import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  PAGINATION,
  type AuthUser,
  type PaginationMeta,
  type TransactionStatus,
} from '@counselos/shared';

import { Clock } from '../../common/clock';
import { NotFoundException, UnprocessableException } from '../../common/errors/app.exception';
import { EVENT_TYPES } from '../../common/events/event-types';
import { ActivityLogService } from './activity-log.service';
import { MatterAccessService } from './matter-access.service';
import type { MatterAccessContext } from './matter-access.repository';
import {
  TransactionsRepository,
  type NewPartyRow,
  type PartyRow,
  type TransactionRow,
} from './transactions.repository';
import { allowedTransitionsFrom, isTerminal, isValidTransition, RETENTION_YEARS } from './constants/status-transitions';
import type { ActivityRow } from './activity.repository';
import type { CreateTransactionInput, PartyInput } from './dto/create-transaction.dto';
import type { ListTransactionsQuery } from './dto/list-transactions.dto';
import type { UpdateStatusInput } from './dto/update-status.dto';
import type { UpdateTransactionInput } from './dto/update-transaction.dto';
import type { UpdatePartyInput } from './dto/party.dto';

export interface TransactionDetail extends TransactionRow {
  parties: PartyRow[];
  /**
   * Where this matter may legally go from its current status.
   *
   * Sent down so the UI renders the SERVER'S ladder instead of keeping a copy.
   * A duplicated transition map on the frontend looks harmless and drifts the
   * first time the ladder changes — the status control then offers a
   * transition the server refuses, which reads to an attorney as a broken
   * product rather than as a stale constant.
   */
  allowedTransitions: TransactionStatus[];
}

export interface Page<T> {
  data: T;
  meta: PaginationMeta;
}

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * `UNDER_CONTRACT` → `Under Contract`.
 *
 * The activity feed is read by people, and `TITLE_COMPANY` in a sentence reads
 * like a database column because it is one. Applied to statuses and party roles
 * alike — the same shape, so the same helper.
 */
const humanize = (value: string): string =>
  value
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');

/**
 * Business rules for Module 3. No database access — everything goes through
 * TransactionsRepository (Architecture Rule 1).
 *
 * Access control is NOT here: MatterAccessGuard has already resolved it before
 * any method below runs, which is what keeps the answer in one place instead of
 * scattered across eleven handlers.
 */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly repository: TransactionsRepository,
    private readonly activity: ActivityLogService,
    private readonly access: MatterAccessService,
    private readonly clock: Clock,
  ) {}

  /** The detail envelope. One place builds it, so no route forgets a field. */
  private async toDetail(transaction: TransactionRow): Promise<TransactionDetail> {
    return {
      ...transaction,
      parties: await this.repository.listParties(transaction.id),
      allowedTransitions: [...allowedTransitionsFrom(transaction.status)],
    };
  }

  // ── create ─────────────────────────────────────────────────────────────────

  async create(user: AuthUser, input: CreateTransactionInput): Promise<TransactionDetail> {
    // Defaults to the caller. Opening a matter on a colleague's behalf is
    // explicit, and the colleague has to actually work here.
    const assignedAttorneyId = input.assignedAttorneyId ?? user.id;
    if (input.assignedAttorneyId !== undefined) {
      await this.access.assertActiveFirmMember(user.firmId, input.assignedAttorneyId);
    }
    if (input.assignedParalegalId !== undefined) {
      await this.access.assertActiveFirmMember(user.firmId, input.assignedParalegalId);
    }

    const transaction = await this.repository.createWithGeneratedNumber(
      {
        firmId: user.firmId,
        assignedAttorneyId,
        assignedParalegalId: input.assignedParalegalId ?? null,
        transactionType: input.transactionType,
        // `status` is not settable at create — INTAKE always, by the column
        // default. A create that could set status would be a way around the
        // transition map.
        title: input.title ?? this.generateTitle(input.propertyAddress, input.parties ?? []),
        propertyAddress: input.propertyAddress,
        ...(input.propertyCity === undefined ? {} : { propertyCity: input.propertyCity }),
        ...(input.propertyState === undefined ? {} : { propertyState: input.propertyState }),
        propertyZip: input.propertyZip ?? null,
        effectiveDate: this.toDate(input.effectiveDate),
        contractDate: this.toDate(input.contractDate),
        closingDate: this.toDate(input.closingDate),
        possessionDate: this.toDate(input.possessionDate),
        purchasePrice: input.purchasePrice ?? null,
        earnestMoneyAmount: input.earnestMoneyAmount ?? null,
        optionFee: input.optionFee ?? null,
        ...(input.tags === undefined ? {} : { tags: input.tags }),
        referralSourceType: input.referralSourceType ?? null,
        referralSourceName: input.referralSourceName ?? null,
      },
      this.clock.now().getUTCFullYear(),
    );

    const parties = await this.repository.insertParties(
      (input.parties ?? []).map((party) => this.toPartyRow(transaction.id, user.firmId, party)),
    );

    await this.activity.log({
      transactionId: transaction.id,
      firmId: user.firmId,
      userId: user.id,
      eventType: EVENT_TYPES.TRANSACTION_CREATED,
      description: `${user.fullName} opened ${transaction.transactionNumber} — ${transaction.title}`,
      metadata: {
        transactionNumber: transaction.transactionNumber,
        transactionType: transaction.transactionType,
      },
    });

    return {
      ...transaction,
      parties,
      allowedTransitions: [...allowedTransitionsFrom(transaction.status)],
    };
  }

  /**
   * "Martinez / Chen — 2847 Manor Rd" (05 §3A).
   *
   * Surnames rather than full names because this is a list label read twenty
   * times a day, and the address is what disambiguates two Martinez matters.
   * The attorney can override it at create; this is only the default.
   */
  private generateTitle(propertyAddress: string, parties: PartyInput[]): string {
    const surname = (role: PartyInput['role']): string | undefined => {
      const party = parties.find((p) => p.role === role);
      if (party === undefined) return undefined;
      // An organization keeps its whole name — "Independence Title" is not
      // "Title". A person is known by their last name.
      if (party.type === 'ORGANIZATION') return party.name;
      return party.name.trim().split(/\s+/).at(-1) ?? party.name;
    };

    const sides = [surname('BUYER'), surname('SELLER')].filter(
      (value): value is string => value !== undefined,
    );

    return sides.length === 0
      ? propertyAddress
      : `${sides.join(' / ')} — ${propertyAddress}`;
  }

  // ── read ───────────────────────────────────────────────────────────────────

  async list(user: AuthUser, query: ListTransactionsQuery): Promise<Page<TransactionRow[]>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? PAGINATION.DEFAULT_LIMIT;

    const { rows, total } = await this.repository.list(
      user.firmId,
      query,
      // 8G applied to the collection: a matter the caller could not open must
      // not appear in a list either.
      this.access.listScope(user),
      page,
      limit,
    );

    return { data: rows, meta: { page, limit, total, hasMore: page * limit < total } };
  }

  async findOne(user: AuthUser, id: string): Promise<TransactionDetail> {
    const transaction = await this.repository.findById(user.firmId, id);
    if (transaction === undefined) throw this.notFound();
    return this.toDetail(transaction);
  }

  async listActivity(
    transactionId: string,
    page: number,
    limit: number,
  ): Promise<Page<ActivityRow[]>> {
    const { rows, total } = await this.activity.list(transactionId, page, limit);
    return { data: rows, meta: { page, limit, total, hasMore: page * limit < total } };
  }

  // ── update ─────────────────────────────────────────────────────────────────

  /**
   * Partial update of a matter's DETAILS.
   *
   * No membership check here, because the two fields that needed one are gone:
   * `updateTransactionSchema` no longer accepts `assignedAttorneyId` or
   * `assignedParalegalId`. Assignment is the 8G ladder's input, not a detail
   * field — see that DTO's banner.
   */
  async update(
    user: AuthUser,
    id: string,
    input: UpdateTransactionInput,
  ): Promise<TransactionDetail> {
    const patch: Record<string, unknown> = { ...input };
    for (const field of ['effectiveDate', 'contractDate', 'closingDate', 'possessionDate']) {
      if (patch[field] !== undefined) patch[field] = this.toDate(patch[field] as string);
    }

    const updated = await this.repository.update(user.firmId, id, patch);
    if (updated === undefined) throw this.notFound();

    await this.activity.log({
      transactionId: updated.id,
      firmId: user.firmId,
      userId: user.id,
      eventType: EVENT_TYPES.TRANSACTION_NOTES_UPDATED,
      description: `${user.fullName} updated matter details`,
      metadata: { fields: Object.keys(input) },
    });

    return this.toDetail(updated);
  }

  /**
   * THE STATUS SURFACE.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * VALIDATE, THEN WRITE. Never the other way round.
   *
   * A status is a legal state. The transition map runs before any write, and a
   * rejection leaves the row untouched and the activity feed silent — a
   * refused transition is not an event, it is a non-event.
   *
   * A terminal transition writes FIVE columns, not one (05 §3C, corrected
   * 2026-08-18). Writing only `closed_at` breaks nothing, fails no test, and
   * surfaces months later as a null column on every closed matter.
   * ───────────────────────────────────────────────────────────────────────────
   */
  async updateStatus(
    user: AuthUser,
    id: string,
    input: UpdateStatusInput,
  ): Promise<TransactionDetail> {
    const current = await this.repository.findById(user.firmId, id);
    if (current === undefined) throw this.notFound();

    const from = current.status;
    const to = input.status;

    if (!isValidTransition(from, to)) {
      /**
       * The rejection carries WHERE THE MATTER MAY GO INSTEAD.
       *
       * "Could not update" teaches an attorney nothing and generates a support
       * ticket; the legal next states let the UI offer them directly. This is
       * the slice's hard stop, and `details` is how the frontend renders it.
       */
      throw new UnprocessableException(
        `A matter in ${humanize(from)} cannot move to ${humanize(to)}.`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        {
          from: [from],
          to: [to],
          allowedTransitions: [...allowedTransitionsFrom(from)],
        },
      );
    }

    const patch: Partial<TransactionRow> = { status: to };

    if (isTerminal(to)) {
      // Belt and braces: the Zod pipe already rejected a terminal transition
      // with no outcome (update-status.dto.ts). This service is callable by
      // another module, and the rule is a business rule, so it is enforced
      // where business rules live as well as where shapes are checked.
      if (input.outcomeReason === undefined) {
        throw new UnprocessableException(
          'Record why this matter ended — it cannot be captured after the fact.',
          ERROR_CODES.VALIDATION_ERROR,
          { outcomeReason: ['An outcome is required when a matter closes or falls through.'] },
        );
      }

      const closedAt = this.clock.now();
      patch.closedAt = closedAt;
      patch.outcomeReason = input.outcomeReason;
      patch.outcomeNotes = input.outcomeNotes ?? null;
      patch.cycleTimeDays = this.cycleTimeDays(current.effectiveDate, closedAt);
      patch.retentionUntil = this.retentionUntil(closedAt);
      // Terminal matters leave the active pipeline on their own. Nobody
      // remembers to archive a deal that fell through in March.
      patch.isArchived = true;
    }

    const updated = await this.repository.update(user.firmId, id, patch);
    if (updated === undefined) throw this.notFound();

    await this.activity.log({
      transactionId: updated.id,
      firmId: user.firmId,
      userId: user.id,
      eventType: EVENT_TYPES.TRANSACTION_STATUS_CHANGED,
      description: `${user.fullName} changed the status from ${humanize(from)} to ${humanize(to)}`,
      metadata: {
        from,
        to,
        ...(isTerminal(to)
          ? { outcomeReason: input.outcomeReason, cycleTimeDays: patch.cycleTimeDays }
          : {}),
      },
    });

    return this.toDetail(updated);
  }

  async archive(user: AuthUser, id: string): Promise<TransactionDetail> {
    const updated = await this.repository.update(user.firmId, id, { isArchived: true });
    if (updated === undefined) throw this.notFound();

    await this.activity.log({
      transactionId: updated.id,
      firmId: user.firmId,
      userId: user.id,
      eventType: EVENT_TYPES.TRANSACTION_ARCHIVED,
      description: `${user.fullName} archived this matter`,
      metadata: null,
    });

    return this.toDetail(updated);
  }

  /**
   * `effective_date` → `closed_at`, in whole days.
   *
   * Stored rather than derived so cycle-time analysis stays a simple aggregate
   * (05 §3C). Null when there is no effective date — a matter that never went
   * under contract has no cycle to time, and a zero there would read as
   * "closed the same day" in every average that touches it.
   */
  private cycleTimeDays(effectiveDate: Date | null, closedAt: Date): number | null {
    if (effectiveDate === null) return null;
    return Math.floor((closedAt.getTime() - effectiveDate.getTime()) / MILLISECONDS_PER_DAY);
  }

  /** Texas real estate matters retain for seven years from close (05 §3C). */
  private retentionUntil(closedAt: Date): Date {
    const until = new Date(closedAt.getTime());
    until.setUTCFullYear(until.getUTCFullYear() + RETENTION_YEARS);
    return until;
  }

  // ── parties ────────────────────────────────────────────────────────────────

  async listParties(transactionId: string): Promise<PartyRow[]> {
    return this.repository.listParties(transactionId);
  }

  async addParty(
    user: AuthUser,
    context: MatterAccessContext,
    input: PartyInput,
  ): Promise<PartyRow> {
    const [party] = await this.repository.insertParties([
      this.toPartyRow(context.transactionId, user.firmId, input),
    ]);
    if (party === undefined) throw new Error('Party insert returned no row.');

    await this.activity.log({
      transactionId: context.transactionId,
      firmId: user.firmId,
      userId: user.id,
      eventType: EVENT_TYPES.PARTY_ADDED,
      description: `${user.fullName} added ${party.name} as ${humanize(party.role)}`,
      metadata: { partyId: party.id, role: party.role },
    });

    return party;
  }

  async updateParty(
    user: AuthUser,
    context: MatterAccessContext,
    partyId: string,
    input: UpdatePartyInput,
  ): Promise<PartyRow> {
    const updated = await this.repository.updateParty(context.transactionId, partyId, input);
    if (updated === undefined) throw new NotFoundException('Party not found.');

    await this.activity.log({
      transactionId: context.transactionId,
      firmId: user.firmId,
      userId: user.id,
      eventType: EVENT_TYPES.PARTY_UPDATED,
      description: `${user.fullName} updated ${updated.name}'s details`,
      metadata: { partyId, fields: Object.keys(input) },
    });

    return updated;
  }

  /**
   * Parties have no `deleted_at` — they cascade with their transaction — so
   * this is a real delete. The `party.removed` activity row is what preserves
   * the fact that they were ever on the matter.
   */
  async removeParty(
    user: AuthUser,
    context: MatterAccessContext,
    partyId: string,
  ): Promise<{ id: string }> {
    const removed = await this.repository.deleteParty(context.transactionId, partyId);
    if (removed === undefined) throw new NotFoundException('Party not found.');

    await this.activity.log({
      transactionId: context.transactionId,
      firmId: user.firmId,
      userId: user.id,
      eventType: EVENT_TYPES.PARTY_REMOVED,
      description: `${user.fullName} removed ${removed.name} from this matter`,
      metadata: { partyId, role: removed.role, name: removed.name },
    });

    return { id: removed.id };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private toPartyRow(transactionId: string, firmId: string, input: PartyInput): NewPartyRow {
    return {
      transactionId,
      firmId,
      role: input.role,
      type: input.type,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      companyName: input.companyName ?? null,
      licenseNumber: input.licenseNumber ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
    };
  }

  private toDate(value: string | undefined): Date | null {
    return value === undefined ? null : new Date(value);
  }

  /** One message for a missing matter, so no caller invents a different one. */
  private notFound(): NotFoundException {
    return new NotFoundException('Transaction not found.', ERROR_CODES.TRANSACTION_NOT_FOUND);
  }
}
