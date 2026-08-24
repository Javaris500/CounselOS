import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, type AuthUser } from '@counselos/shared';

import { Clock } from '../../common/clock';
import { AppException, NotFoundException } from '../../common/errors/app.exception';
import { EVENT_TYPES } from '../../common/events/event-types';
import { ActivityLogService } from './activity-log.service';
import {
  MatterAccessRepository,
  type MatterAccessContext,
  type MatterAccessGrantRow,
} from './matter-access.repository';
import type { ListScope } from './transactions.repository';

/** What a route may require. Writes need FULL; GETs accept READ_ONLY (8G). */
export type AccessLevel = 'FULL' | 'READ_ONLY';

/** The four reason codes from 13-adoption-features.md §1. */
export type DenialReason =
  | 'NOT_ASSIGNED'
  | 'READ_ONLY_ROLE'
  | 'ACCESS_EXPIRED'
  | 'ROLE_INSUFFICIENT';

export type AccessDecision =
  | { granted: true; level: AccessLevel }
  | { granted: false; reason: DenialReason };

/**
 * 403 MATTER_ACCESS_DENIED, carrying the details that make it actionable.
 *
 * Its own subclass rather than `ForbiddenException` because that one cannot
 * carry `details` — its constructor takes no such argument — and the details
 * ARE the feature here (13 §1). Service code throws an `AppException` subclass
 * and never a raw `HttpException`; this is that subclass.
 */
export class MatterAccessDeniedException extends AppException {
  constructor(message: string, details: Record<string, string[]>) {
    super(ERROR_CODES.MATTER_ACCESS_DENIED, message, HttpStatus.FORBIDDEN, details);
  }
}

/**
 * LAYER 8G — who may open THIS matter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ASSIGNMENT, NOT JOB TITLE.
 *
 * `role === 'ATTORNEY'` reads as "attorneys can do this" and means "every
 * attorney at the firm can do this, including ones deliberately kept off this
 * matter". The real rule has four rows, not one:
 *
 *   attorney assigned      → FULL
 *   attorney NOT assigned  → READ_ONLY   (cover, don't edit)
 *   paralegal assigned     → FULL
 *   paralegal NOT assigned → NOTHING     (no read-only fallback, ever)
 *
 * The role comparisons below are steps 1 and 5 of the documented ladder and are
 * annotated individually. They are the only role comparisons in this module,
 * and this is the file an access-control reviewer should read first.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Resolution order (13 §1):
 *   1. OWNER                                  → FULL
 *   2. assigned_attorney_id === user.id       → FULL
 *   3. assigned_paralegal_id === user.id      → FULL
 *   4. matter_access row, unexpired           → FULL
 *   5. role ATTORNEY                          → READ_ONLY
 *   6. otherwise                              → DENIED
 */
@Injectable()
export class MatterAccessService {
  constructor(
    private readonly repository: MatterAccessRepository,
    private readonly activity: ActivityLogService,
    private readonly clock: Clock,
  ) {}

  /**
   * Resolve, or throw.
   *
   * A matter that does not exist, is soft-deleted, or belongs to another firm
   * throws TRANSACTION_NOT_FOUND rather than a denial — a 403 on a
   * non-existent id confirms that ids in that range mean something.
   */
  async authorize(
    user: AuthUser,
    transactionId: string,
    required: AccessLevel,
  ): Promise<MatterAccessContext> {
    const context = await this.repository.loadContext(user.firmId, transactionId, user.id);
    if (context === undefined) {
      throw new NotFoundException('Transaction not found.', ERROR_CODES.TRANSACTION_NOT_FOUND);
    }

    const decision = this.resolve(user, context);

    if (!decision.granted) throw this.denial(decision.reason, context);
    if (required === 'FULL' && decision.level === 'READ_ONLY') {
      throw this.denial('READ_ONLY_ROLE', context);
    }

    return context;
  }

  /** The ladder itself. Pure — no I/O, so it unit-tests at every rung. */
  resolve(user: AuthUser, context: MatterAccessContext): AccessDecision {
    // 1. OWNER bypasses matter checks. Firm settings, user management, all
    //    matters (13 §1) — there is no matter in their own firm they may not
    //    open, so this is genuinely a firm-wide role rule and nothing else.
    if (user.role === 'OWNER') return { granted: true, level: 'FULL' }; // commit-check-exempt: 8G step 1 — OWNER bypasses matter checks by definition (13 §1); a firm-wide role rule, not the assignment rule

    // 2 & 3. The two assignment columns. This is the rule; everything else is
    //        an exception to it.
    if (context.assignedAttorneyId === user.id) return { granted: true, level: 'FULL' };
    if (context.assignedParalegalId === user.id) return { granted: true, level: 'FULL' };

    // 4. An explicit grant — vacation coverage, second-chairing, reassignment.
    if (context.grant !== null) {
      const { expiresAt } = context.grant;
      if (expiresAt === null || expiresAt.getTime() > this.clock.timestamp()) {
        return { granted: true, level: 'FULL' };
      }
      // A lapsed grant is a DIFFERENT answer from never having had one: the
      // UI can offer "ask for it again" instead of "you were never on this".
      return { granted: false, reason: 'ACCESS_EXPIRED' };
    }

    // 5. Read-only cover for other attorneys at the firm. A PARALEGAL never
    //    reaches this rung — the absence of a fallback for them IS the rule
    //    (13 §1: "No visibility into unassigned matters").
    if (user.role === 'ATTORNEY') return { granted: true, level: 'READ_ONLY' }; // commit-check-exempt: 8G step 5 — READ_ONLY cover is defined by role; note it grants READ_ONLY, never FULL, and a PARALEGAL deliberately reaches no such rung

    // 6. Denied. A CLIENT reaching an attorney route is a different failure
    //    from a paralegal on someone else's matter, and the UI says so.
    // Both branches DENY. The role only picks which explanation is true.
    const reason: DenialReason =
      user.role === 'PARALEGAL' ? 'NOT_ASSIGNED' : 'ROLE_INSUFFICIENT'; // commit-check-exempt: 8G step 6 — chooses the denial MESSAGE only; access is already refused on both branches
    return { granted: false, reason };
  }

  /**
   * Which matters this caller may see in a LIST.
   *
   * The same rule applied to a collection. An attorney covers, so they see
   * every live matter in the firm; a paralegal sees only what they are on.
   * Without this the guard protects the detail route and the list hands out
   * every client name and address anyway.
   */
  listScope(user: AuthUser): ListScope {
    if (user.role === 'OWNER' || user.role === 'ATTORNEY') return { kind: 'ALL' }; // commit-check-exempt: 8G — OWNER sees everything and ATTORNEY has firm-wide read cover (13 §1); everyone else falls to the assignment predicate below
    return { kind: 'ASSIGNED_OR_GRANTED', userId: user.id };
  }

  /**
   * PERMISSION ERRORS EXPLAIN THEMSELVES (13 §1).
   *
   * "This matter is assigned to James Okafor. Ask them for access." — with the
   * name in `details` so the UI can render a request button. A bare 403
   * generates a support ticket every single time, which is the whole reason
   * this method exists rather than a one-line throw at each call site.
   *
   * DETAILS ARE ARRAYS OF ONE. `ApiError.details` is
   * `Record<string, string[]>` (packages/shared) while 13 §1 writes this
   * object with flat string values. The type is the compiler-enforced reality,
   * so the values are wrapped; logged in .team-5/shared/contract-drift.md
   * rather than silently reshaped on one branch.
   */
  private denial(reason: DenialReason, context: MatterAccessContext): MatterAccessDeniedException {
    const messages: Record<DenialReason, string> = {
      NOT_ASSIGNED: `This matter is assigned to ${context.assignedAttorneyName}. Ask them for access.`,
      READ_ONLY_ROLE: `You have read-only cover on this matter. ${context.assignedAttorneyName} can give you full access.`,
      ACCESS_EXPIRED: `Your access to this matter has expired. ${context.assignedAttorneyName} can renew it.`,
      ROLE_INSUFFICIENT: 'Your account cannot open firm matters.',
    };

    return new MatterAccessDeniedException(messages[reason], {
      reason: [reason],
      assignedAttorney: [context.assignedAttorneyName],
      requestAccessFrom: [context.assignedAttorneyName],
    });
  }

  // ── grant / revoke / list ──────────────────────────────────────────────────

  /**
   * A user id from a request body is untrusted input like any other.
   *
   * Used before granting access AND before assigning a matter: both write a
   * user id onto a matter, and neither may reach outside the firm or land on a
   * deactivated account. Deactivated is checked as well as present, because
   * assigning a matter to someone who no longer works here silently orphans it.
   */
  async assertActiveFirmMember(
    firmId: string,
    userId: string,
  ): Promise<{ id: string; fullName: string }> {
    const member = await this.repository.findFirmUser(firmId, userId);
    if (member === undefined || !member.isActive) {
      // Not a 404 on the matter — the matter is fine. Naming this is safe
      // because the caller can already see the firm roster.
      throw new NotFoundException('That colleague is not an active member of this firm.');
    }
    return member;
  }

  async listGrants(transactionId: string): Promise<MatterAccessGrantRow[]> {
    return this.repository.listGrants(transactionId);
  }

  /**
   * Grant access. The caller already holds FULL on this matter (the guard saw
   * to that), which is what "OWNER or the assigned attorney" resolves to.
   */
  async grant(
    user: AuthUser,
    context: MatterAccessContext,
    input: { userId: string; expiresAt?: string },
  ): Promise<MatterAccessGrantRow[]> {
    const grantee = await this.assertActiveFirmMember(user.firmId, input.userId);

    await this.repository.grant({
      transactionId: context.transactionId,
      firmId: context.firmId,
      userId: input.userId,
      grantedById: user.id,
      expiresAt: input.expiresAt === undefined ? null : new Date(input.expiresAt),
    });

    await this.activity.log({
      transactionId: context.transactionId,
      firmId: context.firmId,
      userId: user.id,
      eventType: EVENT_TYPES.ACCESS_GRANTED,
      description: `${user.fullName} gave ${grantee.fullName} access to this matter`,
      metadata: { grantedTo: input.userId, expiresAt: input.expiresAt ?? null },
    });

    return this.listGrants(context.transactionId);
  }

  async revoke(
    user: AuthUser,
    context: MatterAccessContext,
    userId: string,
  ): Promise<MatterAccessGrantRow[]> {
    const removed = await this.repository.revoke(context.transactionId, userId);
    if (!removed) {
      throw new NotFoundException('That colleague does not have granted access to this matter.');
    }

    const grantee = await this.repository.findFirmUser(user.firmId, userId);
    await this.activity.log({
      transactionId: context.transactionId,
      firmId: context.firmId,
      userId: user.id,
      eventType: EVENT_TYPES.ACCESS_REVOKED,
      description: `${user.fullName} removed ${grantee?.fullName ?? 'a colleague'}'s access to this matter`,
      metadata: { revokedFrom: userId },
    });

    return this.listGrants(context.transactionId);
  }
}
