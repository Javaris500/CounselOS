import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import type { MatterAccessContext } from '../../modules/transactions/matter-access.repository';

/**
 * Declares what a route needs on THIS matter (8G).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT GOES ON EVERY MATTER-SCOPED ROUTE. NOT MOST OF THEM.
 *
 * Five of six is the realistic failure, and the sixth is usually a GET added
 * later — no bootstrap crash, no lint error, no failing test, and any
 * authenticated user in the firm can read a matter they were deliberately kept
 * off. The pre-commit guard refuses a controller that uses this decorator
 * anywhere and omits it somewhere, and the E2E enumerates every route against
 * one identity that must never pass. Two backstops, because review is not one.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Writes take FULL. GETs take READ_ONLY, which an unassigned attorney has so
 * they can cover — and a paralegal never does.
 *
 * MANAGE_ACCESS is a THIRD requirement, not a third decision. The ladder still
 * answers only FULL or READ_ONLY; this asks the narrower question 13 §1 asks of
 * the two grant routes — "OWNER, or the attorney this matter is assigned to".
 * It exists because FULL is held by five populations, not two: the assigned
 * PARALEGAL and anyone holding a live grant have it as well, so gating
 * `POST /:id/access` on FULL let a paralegal hand out firm-wide access and let
 * a two-week coverage grant re-grant itself permanently. Confirmed against the
 * real stack in review, 2026-08-24, not inferred.
 */
export type MatterAccessLevel = 'FULL' | 'READ_ONLY' | 'MANAGE_ACCESS';

export const MATTER_ACCESS = 'matterAccess';

export const MatterAccess = (
  level: MatterAccessLevel = 'FULL',
): MethodDecorator & ClassDecorator => SetMetadata(MATTER_ACCESS, level);

/** Where MatterAccessGuard parks what it resolved, for the param decorator. */
export const MATTER_CONTEXT = 'matterContext';

export interface RequestWithMatter extends Request {
  [MATTER_CONTEXT]?: MatterAccessContext;
}

/**
 * The matter the guard already loaded and authorized.
 *
 * The guard fetched the row to make its decision; a handler re-fetching it is a
 * second round trip for an answer already in memory. **Never undefined on a
 * route carrying `@MatterAccess`** — the guard throws rather than passing
 * through, exactly like `@CurrentUser()` on a protected route.
 */
export const Matter = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MatterAccessContext | undefined =>
    context.switchToHttp().getRequest<RequestWithMatter>()[MATTER_CONTEXT],
);
