import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, like, lte, sql } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb } from '../../database/database.module';
import { notDeleted } from '../../database/helpers';
import { parties, transactions } from '../../database/schema';
import {
  formatTransactionNumber,
  parseSequence,
  transactionNumberPrefix,
} from './constants/transaction-number';
import type { ListTransactionsQuery } from './dto/list-transactions.dto';

export type TransactionRow = typeof transactions.$inferSelect;
export type PartyRow = typeof parties.$inferSelect;
export type NewPartyRow = typeof parties.$inferInsert;
/** Everything the service supplies. The number is this file's to allocate. */
export type NewTransactionRow = Omit<typeof transactions.$inferInsert, 'transactionNumber'>;

/**
 * Which matters this caller may see in a list.
 *
 * Resolved by MatterAccessService and passed in, so no role comparison reaches
 * this file. That is not tidiness: a role comparison inside a query builder is
 * the exact shape of the bug 19 §2.3 describes, and it would sit somewhere no
 * access-control reviewer thinks to look.
 */
export type ListScope = { kind: 'ALL' } | { kind: 'ASSIGNED_OR_GRANTED'; userId: string };

/** Postgres unique_violation. The partial index is what makes numbers unique. */
const UNIQUE_VIOLATION = '23505';

/**
 * Each retry lets exactly one more contender through, so the ceiling is the
 * number of creates that can land in the same instant. Ten is generous for one
 * firm; the loop rethrows rather than looping forever if it is ever wrong.
 */
const NUMBER_ALLOCATION_ATTEMPTS = 10;

/**
 * Does this error, or anything it wraps, carry `code`?
 *
 * THE CAUSE CHAIN IS THE POINT. Drizzle wraps driver errors in its own
 * `DrizzleQueryError`, so `error.code` on the thrown object is `undefined` and
 * a direct check silently never matches — the retry below never fires and a
 * routine create collision surfaces as a 500. Found by the concurrent-create
 * E2E case, which is exactly why that case exists.
 */
const hasPgCode = (error: unknown, code: string): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth++) {
    if (typeof current !== 'object' || current === null) return false;
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

/**
 * Drizzle queries. No business rules (Architecture Rule 1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY SELECT FROM `transactions` CARRIES `notDeleted.transactions`.
 *
 * Drizzle has no middleware layer, so there is no framework backstop: a query
 * that forgets it compiles, lints, reads correctly in review, and returns
 * soft-deleted legal records. There is exactly one select below without it, and
 * it is annotated with why.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class TransactionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  // ── reads ──────────────────────────────────────────────────────────────────

  async findById(firmId: string, id: string): Promise<TransactionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.firmId, firmId), eq(transactions.id, id), notDeleted.transactions))
      .limit(1);
    return row;
  }

  async list(
    firmId: string,
    query: ListTransactionsQuery,
    scope: ListScope,
    page: number,
    limit: number,
  ): Promise<{ rows: TransactionRow[]; total: number }> {
    const where = this.listPredicate(firmId, query, scope);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(transactions)
        .where(where)
        .orderBy(...this.ordering(query.sort))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(transactions).where(where),
    ]);

    return { rows, total: totals?.value ?? 0 };
  }

  private listPredicate(firmId: string, query: ListTransactionsQuery, scope: ListScope) {
    const clauses = [eq(transactions.firmId, firmId), notDeleted.transactions];

    // Archived matters must not pollute the active pipeline (05 §3A), but they
    // stay queryable — that is what archiving means as against deleting.
    if (query.includeArchived !== true) clauses.push(eq(transactions.isArchived, false));

    if (query.status !== undefined) clauses.push(eq(transactions.status, query.status));
    if (query.transactionType !== undefined) {
      clauses.push(eq(transactions.transactionType, query.transactionType));
    }
    if (query.assignedAttorneyId !== undefined) {
      clauses.push(eq(transactions.assignedAttorneyId, query.assignedAttorneyId));
    }
    if (query.closingAfter !== undefined) {
      clauses.push(gte(transactions.closingDate, new Date(query.closingAfter)));
    }
    if (query.closingBefore !== undefined) {
      clauses.push(lte(transactions.closingDate, new Date(query.closingBefore)));
    }

    if (scope.kind === 'ASSIGNED_OR_GRANTED') {
      /**
       * 8G, applied to the list rather than only to the detail route: a matter
       * the caller could not open must not appear in a list either, or the
       * addresses and client names leak through the very surface the guard was
       * added to protect.
       */
      clauses.push(
        sql`(
          ${transactions.assignedAttorneyId} = ${scope.userId}
          OR ${transactions.assignedParalegalId} = ${scope.userId}
          OR EXISTS (
            SELECT 1 FROM matter_access ma
            WHERE ma.transaction_id = ${transactions.id}
              AND ma.user_id = ${scope.userId}
              AND (ma.expires_at IS NULL OR ma.expires_at > now())
          )
        )`,
      );
    }

    return and(...clauses);
  }

  private ordering(sort: ListTransactionsQuery['sort']) {
    switch (sort) {
      case 'updatedAt':
        return [desc(transactions.updatedAt)];
      case 'status':
        return [asc(transactions.status), asc(transactions.closingDate)];
      default:
        // Soonest closing first — the order an attorney wants at 8am, and why
        // transactions_closing_date_idx exists. NULLS LAST so undated matters
        // sit below dated ones instead of on top of them.
        return [sql`${transactions.closingDate} ASC NULLS LAST`, desc(transactions.createdAt)];
    }
  }

  // ── writes ─────────────────────────────────────────────────────────────────

  /**
   * Insert, allocating the transaction number here rather than in the service.
   *
   * ALLOCATE-THEN-RETRY, NOT A LOCK. Two creates landing in the same
   * millisecond read the same maximum and build the same number; the partial
   * unique index refuses the second, and this catches that specific violation
   * and tries again with the next sequence. A table lock would serialise every
   * create in the firm to remove a collision that resolves in one extra round
   * trip.
   *
   * Only `23505` is retried. Any other failure is a real failure and rises.
   */
  async createWithGeneratedNumber(
    values: NewTransactionRow,
    year: number,
  ): Promise<TransactionRow> {
    let lastError: unknown;

    for (let attempt = 0; attempt < NUMBER_ALLOCATION_ATTEMPTS; attempt++) {
      const transactionNumber = formatTransactionNumber(
        year,
        (await this.highestSequence(values.firmId, year)) + 1 + attempt,
      );

      try {
        const [row] = await this.db
          .insert(transactions)
          .values({ ...values, transactionNumber })
          .returning();
        // `returning()` on a single-row insert yields exactly one row or throws
        // first. The check is for the type system, not for a real case.
        if (row === undefined) throw new Error('Insert returned no row.');
        return row;
      } catch (error) {
        if (!hasPgCode(error, UNIQUE_VIOLATION)) throw error;
        lastError = error;
      }
    }

    throw lastError;
  }

  /**
   * The highest sequence issued for this firm and year.
   *
   * commit-check-exempt: number allocation counts deleted matters on purpose — a
   * soft-deleted matter keeps its number in correspondence that already went
   * out, and reissuing it would put two different deals behind one identifier.
   * The partial unique index only constrains live rows; not reusing is this
   * query's job.
   */
  private async highestSequence(firmId: string, year: number): Promise<number> {
    const [row] = await this.db
      .select({ transactionNumber: transactions.transactionNumber })
      .from(transactions)
      .where(
        and(
          eq(transactions.firmId, firmId),
          like(transactions.transactionNumber, `${transactionNumberPrefix(year)}%`),
        ),
      )
      .orderBy(desc(transactions.transactionNumber))
      .limit(1);

    return row === undefined ? 0 : parseSequence(row.transactionNumber);
  }

  /**
   * Partial update. Returns undefined when nothing matched, which is how a
   * soft-deleted or other-firm row reads as "not found" rather than as a
   * silent no-op that returns 200.
   */
  async update(
    firmId: string,
    id: string,
    patch: Partial<typeof transactions.$inferInsert>,
  ): Promise<TransactionRow | undefined> {
    const [row] = await this.db
      .update(transactions)
      .set(patch)
      .where(and(eq(transactions.firmId, firmId), eq(transactions.id, id), notDeleted.transactions))
      .returning();
    return row;
  }

  // ── parties ────────────────────────────────────────────────────────────────
  //
  // No soft delete: parties cascade with their transaction (schema.ts), so a
  // removal here is a real DELETE. The party.removed activity row is what
  // preserves the fact that they were ever on the matter.

  async listParties(transactionId: string): Promise<PartyRow[]> {
    return this.db
      .select()
      .from(parties)
      .where(eq(parties.transactionId, transactionId))
      .orderBy(asc(parties.role), asc(parties.name));
  }

  async insertParties(rows: NewPartyRow[]): Promise<PartyRow[]> {
    if (rows.length === 0) return [];
    return this.db.insert(parties).values(rows).returning();
  }

  async findParty(transactionId: string, partyId: string): Promise<PartyRow | undefined> {
    const [row] = await this.db
      .select()
      .from(parties)
      .where(and(eq(parties.transactionId, transactionId), eq(parties.id, partyId)))
      .limit(1);
    return row;
  }

  async updateParty(
    transactionId: string,
    partyId: string,
    patch: Partial<NewPartyRow>,
  ): Promise<PartyRow | undefined> {
    const [row] = await this.db
      .update(parties)
      .set(patch)
      .where(and(eq(parties.transactionId, transactionId), eq(parties.id, partyId)))
      .returning();
    return row;
  }

  async deleteParty(transactionId: string, partyId: string): Promise<PartyRow | undefined> {
    const [row] = await this.db
      .delete(parties)
      .where(and(eq(parties.transactionId, transactionId), eq(parties.id, partyId)))
      .returning();
    return row;
  }
}
