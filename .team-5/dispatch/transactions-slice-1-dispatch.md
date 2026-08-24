---
# WRITTEN BY: the operator, before an agent starts a slice.
# FILENAME:   transactions-slice-1-dispatch.md

agent:            transactions
slice:            1
dispatch_id:      transactions-slice-1
branch:           feat/transactions-slice-1
issued:           2026-08-23

scope: >
  Module 3 — transactions, parties, activity log, enforced status transitions —
  and Layer 8G matter access, plus the pipeline board and the detail shell the
  other five agents will mount into.

file_boundary:
  may_edit:
    - apps/api/src/modules/transactions/
    - apps/api/src/common/events/
    - apps/api/src/common/guards/matter-access.guard.ts
    - apps/api/src/common/decorators/matter-access.decorator.ts
    - apps/web/src/app/(attorney)/transactions/
    - apps/web/src/components/features/transactions/
    - apps/web/src/components/ui/
  may_append_only:
    - apps/web/src/lib/api/queryKeys.ts
    - apps/web/src/lib/api/mutations.ts
    - packages/shared/src/errors/error-codes.ts
    - apps/web/src/mocks/handlers.ts
    - .team-5/shared/shared-file-touches.md
    - .team-5/shared/pattern-registry.md
    - .team-5/shared/contract-drift.md
    - .team-5/log/decision-log.md
    - .team-5/log/error-log.md
  must_not_touch:
    - apps/api/src/database/          # Foundations. schema.ts and seeds are the operator's.
    - apps/api/drizzle/               # Foundations. Migrations are ordered and immutable.
    - packages/shared/src/enums/      # Foundations. The enums you need already exist.
    - apps/web/src/lib/api/client.ts
    - apps/web/src/stores/
    - apps/api/src/modules/auth/
    - apps/api/src/modules/health/
    - apps/web/e2e/                   # Verification. Nemi owns the browser gate.
    - apps/api/test/

builds_against: live
exit_condition: >
  API E2E green FIRST, then the slice's Playwright gate. Both, or the slice does
  not ship. See "Your gates" below for the exact clauses.

slice_hard_stops:
  - The five-column terminal transition. CLOSED or FALLEN_THROUGH writes closed_at,
    outcome_reason, outcome_notes, cycle_time_days, retention_until — not just closed_at.
    A close with no outcome_reason is rejected. outcome_reason is UNRECOVERABLE after the fact.
  - Never gate on user.role where the rule is assignment. Unassigned attorney → READ_ONLY,
    unassigned paralegal → nothing. A role check grants both and reads fine in review.
  - @MatterAccess on EVERY transaction-scoped route. Five of six is the realistic failure
    and the sixth is usually a late-added GET. Enumerate the controller against the list.
  - Never show a rejected transition as a bare failure. Render the legal next states from
    error.details.
  - Never apply optimism to a status change. It is a legal state.
  - The transaction number is generated server-side. The client never computes or submits it.
---

## Assignment

You are the spine. Build Module 3 and the surfaces on top of it, backend first.

**Do not write a migration.** All 27 tables already exist, including `transactions`,
`parties`, `transaction_activities`, and `matter_access`. `schema.ts` and `drizzle/` belong
to Foundations, which the operator holds for this slice. If you believe you need a schema
change, that is a blocker — file it in `.team-5/log/error-log.md` and stop.

**Check what already exists before you build it.** `packages/shared` already has the status
and party enums, `TERMINAL_TRANSACTION_STATUSES`, `OUTCOME_REASONS`, and the error codes
`TRANSACTION_NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `MATTER_ACCESS_DENIED`. On the
frontend, `queryKeys.ts` already has `transactions`, `transaction`, and `activity`, and
`mutations.ts` already has `createTransaction` and `updateTransactionStatus` with their
invalidation declared. Use them. Do not add a second way to do any of it.

**What does not exist yet:** `apps/api/src/common/events/event-types.ts` (the `EventType`
constants — 3D lists them), an `ActivityLogService` that never throws, the
`MatterAccessGuard` and its `@MatterAccess` decorator, and the `Card`, `Tabs`, and status
`Select` primitives. Those three primitives are not in the Pattern Registry and not in
`components/ui/` — they are unlisted rather than `planned`, so build them and register them
in `.team-5/shared/pattern-registry.md` in the same commit.

**Read first:** `05-backend-checklist.md` Layer 3 and Layer 8G, the transactions/parties/
activity tables in `schema.ts`, `13-adoption-features.md` §1 for the full 8G model, and
`06-frontend-architecture.md` Part 9 for the detail shell.

## Your gates

**API E2E first.** Create → 201 with an auto-generated transaction number; valid transition
→ 200; invalid → 422 `INVALID_STATUS_TRANSITION`; list excludes soft-deleted; every mutation
writes an activity row; a terminal transition writes all five columns; a close with no
`outcome_reason` is rejected.

**Then Playwright**, written by Nemi, not you: create → appears in the correct pipeline
column → open detail → change status → invalid transition blocked with a visible reason.
Plus the clause Slice 0 deferred — a paralegal denied an unassigned matter sees the
explaining error, not a bare 403. `clawsonRd` is the fixture: it has no
`assignedParalegalId`. `manorRd` does.

A browser gate over an unproven module reports UI failures for backend causes. Backend first.

## Out of scope

Documents, deadlines, chat, drafts, and case-ops — you build the tabs' *shell*, never their
contents. Disabled nav items are correct for tabs whose slices have not landed. No search
(8I), no CSV import (8K), no dashboard aggregation. Do not touch auth or health.

## How this is checked

`./scripts/check-mounts.sh .team-5/dispatch/transactions-slice-1-dispatch.md` runs against
your branch before merge. The `may_edit` list above is the boundary it measures you against,
and `may_append_only` is verified as genuinely append-only — a removed line in
`queryKeys.ts` fails it. If the boundary is wrong, say so and it gets amended; working
around it silently is the one thing that cannot be reviewed.

Per merge-queue condition 3, this being your first backend module, it takes an adversarial
security review in a fresh session before merge.
