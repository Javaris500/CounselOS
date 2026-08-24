import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, STAFF_ROLES, type AuthUser, type UserRole } from '@counselos/shared';

import { Clock } from '../../common/clock';
import {
  AppException,
  NotFoundException,
  UnprocessableException,
} from '../../common/errors/app.exception';
import { EVENT_TYPES } from '../../common/events/event-types';
import { ActivityLogService } from './activity-log.service';
import {
  MatterAccessRepository,
  type MatterAccessContext,
  type MatterAccessGrantRow,
} from './matter-access.repository';
import type { ListScope } from './transactions.repository';

/** What the ladder can DECIDE. Two answers, and only two. */
export type AccessLevel = 'FULL' | 'READ_ONLY';

/**
 * What a route can REQUIRE — a superset of what the ladder decides.
 *
 * Writes need FULL; GETs accept READ_ONLY. `MANAGE_ACCESS` is narrower than
 * FULL and is not a rung: it is the question 13 §1 asks of the two grant
 * routes, answered after the ladder has already granted FULL.
 */
export type RequiredAccess = AccessLevel | 'MANAGE_ACCESS';

/** The reason codes from 13-adoption-features.md §1. */
export type DenialReason =
  | 'NOT_ASSIGNED'
  | 'READ_ONLY_ROLE'
  | 'ACCESS_EXPIRED'
  | 'ROLE_INSUFFICIENT'
  | 'NOT_MATTER_ATTORNEY';

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
    required: RequiredAccess,
  ): Promise<MatterAccessContext> {
    const context = await this.repository.loadContext(user.firmId, transactionId, user.id);
    if (context === undefined) {
      throw new NotFoundException('Transaction not found.', ERROR_CODES.TRANSACTION_NOT_FOUND);
    }

    const decision = this.resolve(user, context);

    if (!decision.granted) throw this.denial(decision.reason, context);
    if (decision.level === 'READ_ONLY' && required !== 'READ_ONLY') {
      throw this.denial('READ_ONLY_ROLE', context);
    }

    /**
     * FULL IS NOT "MAY CHANGE WHO ELSE HAS ACCESS".
     *
     * The ladder grants FULL to five populations: OWNER, the assigned
     * attorney, the assigned PARALEGAL, anyone holding a live grant, and
     * anyone who becomes one of those. 13 §1 scopes granting to two of them —
     * "OWNER, or the assigned attorney" — so gating the grant routes on FULL
     * was strictly wider than the rule it claimed to implement.
     *
     * What that cost, confirmed against the real stack in review 2026-08-24:
     * an assigned paralegal could hand a matter to anyone at the firm, and a
     * two-week coverage grant could POST a grant for its own holder with no
     * `expiresAt` — turning a time-boxed permission permanent, which is
     * precisely what `grant-access.dto.ts` says the expiry exists to prevent.
     *
     * Checked HERE rather than in the handler so it sits beside the ladder it
     * narrows, in the file an access-control reviewer is told to read first.
     */
    if (required === 'MANAGE_ACCESS' && !this.mayManageAccess(user, context)) {
      throw this.denial('NOT_MATTER_ATTORNEY', context);
    }

    return context;
  }

  /**
   * "OWNER, or the attorney this matter is assigned to" (13 §1).
   *
   * The OWNER comparison is a firm-wide role rule, the same one rung 1 makes.
   * The other half is an id comparison against THIS matter's assignment
   * column — deliberately not `role === 'ATTORNEY'`, which would let every
   * attorney at the firm re-grant a matter they only have cover on.
   */
  private mayManageAccess(user: AuthUser, context: MatterAccessContext): boolean {
    if (user.role === 'OWNER') return true; // commit-check-exempt: 13 §1 names OWNER explicitly alongside the assigned attorney; a firm-wide role rule, and the assignment comparison is on the next line
    return context.assignedAttorneyId === user.id;
  }

  /** The ladder itself. Pure — no I/O, so it unit-tests at every rung. */
  resolve(user: AuthUser, context: MatterAccessContext): AccessDecision {
    /**
     * RUNG 0 — THE FLOOR. A non-staff account holds no matter access at any
     * level, whatever the assignment columns or a grant row say.
     *
     * Rungs 2, 3 and 4 match on an id or on the existence of a row, and none of
     * them looks at `role` — correctly, because the whole point of 8G is that
     * assignment beats job title. But that cuts both ways: without this floor,
     * writing a CLIENT's id into `assigned_attorney_id`, or granting one a
     * `matter_access` row, yields FULL. A portal client could then change a
     * legal status, edit parties, and grant access to others.
     *
     * 13 §1 gives CLIENT "one transaction, read-only + messaging, via signed
     * token, not an account" — never FULL, and never through this path at all.
     * The entry points refuse to write such a row (assertActiveFirmMember), and
     * this refuses to honour one that exists anyway. Two layers, because the
     * row could predate the check or arrive from a CSV import.
     *
     * Not annotated `commit-check-exempt`: the guard does not flag this shape,
     * and tagging a line the guard is silent on would imply a silenced warning.
     */
    if (!isStaffRole(user.role)) return { granted: false, reason: 'ROLE_INSUFFICIENT' };

    // 1. OWNER bypasses matter checks. Firm settings, user management, all
    //    matters (13 §1) — there is no matter in their own firm they may not
    //    open, so this is genuinely a firm-wide role rule and nothing else.
    if (user.role === 'OWNER') return { granted: true, level: 'FULL' }; // commit-check-exempt: 8G step 1 — OWNER bypasses matter checks by definition (13 §1); a firm-wide role rule, not the assignment rule

    // 2 & 3. The two assignment columns. This is the rule; everything else is
    //        an exception to it.
    if (context.assignedAttorneyId === user.id) return { granted: true, level: 'FULL' };
    if (context.assignedParalegalId === user.id) return { granted: true, level: 'FULL' };

    // 4. An explicit grant — vacation coverage, second-chairing, reassignment.
    //
    // The rung is "a row exists AND IS NOT EXPIRED". An expired row therefore
    // does not match it, and evaluation CONTINUES to rung 5 rather than
    // stopping here — otherwise an attorney whose coverage grant lapsed would
    // be denied the read-only cover every other attorney at the firm has,
    // which is stricter than 13 §1 and arbitrary: the lapse of an extra
    // permission must not remove a baseline one.
    const grantExpired =
      context.grant !== null &&
      context.grant.expiresAt !== null &&
      context.grant.expiresAt.getTime() <= this.clock.timestamp();

    if (context.grant !== null && !grantExpired) return { granted: true, level: 'FULL' };

    // 5. Read-only cover for other attorneys at the firm. A PARALEGAL never
    //    reaches this rung — the absence of a fallback for them IS the rule
    //    (13 §1: "No visibility into unassigned matters").
    if (user.role === 'ATTORNEY') return { granted: true, level: 'READ_ONLY' }; // commit-check-exempt: 8G step 5 — READ_ONLY cover is defined by role; note it grants READ_ONLY, never FULL, and a PARALEGAL deliberately reaches no such rung

    // 6. Denied — and the reason is the most specific true one, because the UI
    //    renders a different offer for each. A lapsed grant means "ask for it
    //    again"; never having had one means "you were never on this matter".
    //    All three branches DENY; the role only picks which explanation is true.
    if (grantExpired) return { granted: false, reason: 'ACCESS_EXPIRED' };

    // Only a PARALEGAL reaches here: OWNER and ATTORNEY returned above, and a
    // non-staff role was refused at the floor. Kept as the explicit answer for
    // the one role that arrives.
    return { granted: false, reason: 'NOT_ASSIGNED' };
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
    // `asOf` from the same Clock `resolve()` uses, so the list and the detail
    // route cannot disagree about when a grant lapsed.
    return { kind: 'ASSIGNED_OR_GRANTED', userId: user.id, asOf: this.clock.now() };
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
      NOT_MATTER_ATTORNEY: `Only ${context.assignedAttorneyName} or a firm owner can change who has access to this matter.`,
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
    /**
     * A portal client is not a colleague. Assigning a matter to one, or
     * granting one access, would write a row that `resolve()` now refuses to
     * honour — so this is the same rule enforced where the mistake is made,
     * while the operator is still looking at it, rather than as a denial
     * somebody debugs later.
     */
    if (!isStaffRole(member.role)) {
      throw new NotFoundException('That colleague is not an active member of this firm.');
    }
    return member;
  }

  async listGrants(transactionId: string): Promise<MatterAccessGrantRow[]> {
    return this.repository.listGrants(transactionId);
  }

  /**
   * Grant access. The guard has already established that the caller is the
   * OWNER or this matter's assigned attorney (`MANAGE_ACCESS`) — not merely
   * that they hold FULL, which is a wider set and was the bug.
   */
  async grant(
    user: AuthUser,
    context: MatterAccessContext,
    input: { userId: string; expiresAt?: string },
  ): Promise<MatterAccessGrantRow[]> {
    /**
     * NOBODY GRANTS THEMSELVES.
     *
     * Redundant against `MANAGE_ACCESS` today — the two callers who pass that
     * check already hold FULL by role or assignment, so a self-grant would buy
     * them nothing. It is here because the shape is what made the escalation
     * possible: `grant()` upserts on (transaction_id, user_id) and overwrites
     * `expires_at`, so a holder who can call it at all can erase their own
     * expiry. Refusing the self case closes that permanently rather than
     * leaving it to depend on the level rule above staying narrow.
     */
    if (input.userId === user.id) {
      throw new UnprocessableException(
        'You already have access to this matter — a grant is for a colleague.',
        ERROR_CODES.VALIDATION_ERROR,
        { userId: ['Choose a colleague other than yourself.'] },
      );
    }

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

/**
 * Everyone who logs into the attorney product (`STAFF_ROLES`, packages/shared).
 *
 * A role comparison, and a legitimate one: this is the firm-wide question "is
 * this an internal account at all", which is genuinely about job title and is
 * asked BEFORE the assignment rules rather than instead of them.
 */
const isStaffRole = (role: UserRole): boolean =>
  (STAFF_ROLES as readonly UserRole[]).includes(role);
