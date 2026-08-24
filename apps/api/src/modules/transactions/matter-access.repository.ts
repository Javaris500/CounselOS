import { Inject, Injectable } from '@nestjs/common';
import { aliasedTable, and, asc, eq } from 'drizzle-orm';
import type { UserRole } from '@counselos/shared';

import { DRIZZLE, type DrizzleDb } from '../../database/database.module';
import { notDeleted } from '../../database/helpers';
import { matterAccess, transactions, users } from '../../database/schema';

/**
 * The facts an access decision is made from — one row, one round trip.
 *
 * Fetched together because MatterAccessGuard runs on EVERY matter-scoped
 * request. Three sequential queries per request to answer one yes/no would be
 * three round trips on the hottest path in the product.
 */
export interface MatterAccessContext {
  transactionId: string;
  firmId: string;
  assignedAttorneyId: string;
  assignedParalegalId: string | null;
  /** For the denial message: who to ask. Never a bare "access denied". */
  assignedAttorneyName: string;
  /** Present if this user has been granted access, expired or not. */
  grant: { expiresAt: Date | null } | null;
}

export interface MatterAccessGrantRow {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  grantedById: string;
  expiresAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class MatterAccessRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Everything needed to resolve access, or undefined if there is no such live
   * matter in this firm.
   *
   * `notDeleted.transactions` is load-bearing here in a way that is easy to
   * miss: without it a soft-deleted matter still resolves, the guard says FULL,
   * and the handler then returns a record the firm believes is gone.
   */
  async loadContext(
    firmId: string,
    transactionId: string,
    userId: string,
  ): Promise<MatterAccessContext | undefined> {
    const attorney = aliasedTable(users, 'assigned_attorney');

    const [row] = await this.db
      .select({
        transactionId: transactions.id,
        firmId: transactions.firmId,
        assignedAttorneyId: transactions.assignedAttorneyId,
        assignedParalegalId: transactions.assignedParalegalId,
        assignedAttorneyName: attorney.fullName,
        grantExpiresAt: matterAccess.expiresAt,
        grantId: matterAccess.id,
      })
      .from(transactions)
      .innerJoin(attorney, eq(attorney.id, transactions.assignedAttorneyId))
      .leftJoin(
        matterAccess,
        and(eq(matterAccess.transactionId, transactions.id), eq(matterAccess.userId, userId)),
      )
      .where(
        and(
          eq(transactions.firmId, firmId),
          eq(transactions.id, transactionId),
          notDeleted.transactions,
        ),
      )
      .limit(1);

    if (row === undefined) return undefined;

    return {
      transactionId: row.transactionId,
      firmId: row.firmId,
      assignedAttorneyId: row.assignedAttorneyId,
      assignedParalegalId: row.assignedParalegalId,
      assignedAttorneyName: row.assignedAttorneyName,
      // A row with a null id means the leftJoin found nothing — no grant at
      // all, which is a different answer from a grant that lapsed.
      grant: row.grantId === null ? null : { expiresAt: row.grantExpiresAt },
    };
  }

  /** Who can see this matter, beyond the two assignment columns. */
  async listGrants(transactionId: string): Promise<MatterAccessGrantRow[]> {
    return this.db
      .select({
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        role: users.role,
        grantedById: matterAccess.grantedById,
        expiresAt: matterAccess.expiresAt,
        createdAt: matterAccess.createdAt,
      })
      .from(matterAccess)
      .innerJoin(users, eq(users.id, matterAccess.userId))
      .where(eq(matterAccess.transactionId, transactionId))
      .orderBy(asc(users.fullName));
  }

  /**
   * Grant, or re-grant.
   *
   * `onConflictDoUpdate` on (transaction_id, user_id) because the unique index
   * makes a second grant to the same person an error otherwise — and "extend
   * Sarah's coverage by another week" is the same gesture as granting it.
   */
  async grant(values: {
    transactionId: string;
    firmId: string;
    userId: string;
    grantedById: string;
    expiresAt: Date | null;
  }): Promise<void> {
    await this.db
      .insert(matterAccess)
      .values(values)
      .onConflictDoUpdate({
        target: [matterAccess.transactionId, matterAccess.userId],
        set: { expiresAt: values.expiresAt, grantedById: values.grantedById },
      });
  }

  async revoke(transactionId: string, userId: string): Promise<boolean> {
    const removed = await this.db
      .delete(matterAccess)
      .where(and(eq(matterAccess.transactionId, transactionId), eq(matterAccess.userId, userId)))
      .returning({ id: matterAccess.id });
    return removed.length > 0;
  }

  /** Confirms a grantee is a real, active member of this firm before granting. */
  async findFirmUser(
    firmId: string,
    userId: string,
  ): Promise<
    { id: string; fullName: string; isActive: boolean; role: UserRole } | undefined
  > {
    const [row] = await this.db
      // `role` is selected because the caller has to refuse a portal client as
      // an assignee or grantee. Without it the check cannot be written, which
      // is how it came to be missing in the first place.
      .select({
        id: users.id,
        fullName: users.fullName,
        isActive: users.isActive,
        role: users.role,
      })
      .from(users)
      .where(and(eq(users.firmId, firmId), eq(users.id, userId)))
      .limit(1);
    return row;
  }
}
