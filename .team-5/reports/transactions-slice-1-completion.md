---
agent:            transactions
slice:            1
dispatch_id:      transactions-slice-1
branch:           feat/transactions-slice-1
completed:        2026-08-23
status:           complete

files_touched:
  - apps/api/src/modules/transactions/           # 20 files — module, guard deps, dto/, constants/, __tests__/
  - apps/api/src/common/events/event-types.ts
  - apps/api/src/common/guards/matter-access.guard.ts
  - apps/api/src/common/decorators/matter-access.decorator.ts
  - apps/api/src/app.module.ts                   # BOUNDARY AMENDMENT — see blockers
  - apps/web/src/app/(attorney)/transactions/    # page.tsx, [id]/layout.tsx, [id]/page.tsx
  - apps/web/src/components/features/transactions/  # 16 files
  - apps/web/src/components/ui/                  # Card, Tabs, Select (+ css) and index.ts

shared_files_touched:
  - "app.module.ts: TransactionsModule in imports (2 lines added, 0 removed)"
  - "components/ui/index.ts: Card, Tabs, Select exports (3 lines appended)"
  - "TransactionShell.tsx TABS: the tab contract five slices mount into"
  - "pattern-registry.md: Card, Tabs, Select registered — canonical table + registration log"
  - "NOT touched: queryKeys.ts, mutations.ts, error-codes.ts — every entry needed already existed"

components_created:
  [Card, Tabs, Select, PipelineBoard, TransactionCard, CreateTransactionDialog,
   TransactionShell, TransactionOverview, StatusControl, ActivityFeed, PartiesList]

testids_added:       true
api_e2e_gate:        pass    # 79/79 across all three e2e suites — the module gate
playwright_gate:     not_run # Nemi owns it; apps/web/e2e/ is must_not_touch
four_states_covered: true
error_codes_handled:
  [TRANSACTION_NOT_FOUND, INVALID_STATUS_TRANSITION, MATTER_ACCESS_DENIED,
   VALIDATION_ERROR, FORBIDDEN, NOT_FOUND, RATE_LIMIT_EXCEEDED, INTERNAL_ERROR]
mock_used:           false   # dispatch says builds_against: live
contract_drift:
  - "MATTER_ACCESS_DENIED details: 13 §1 shows flat strings; ApiError.details is Record<string,string[]>"
  - "05 §3D names the constant EventType; exported as EVENT_TYPES + EventType type"
  - "02-repo-structure says components/transactions/; dispatch grants components/features/transactions/"
  - "02-repo-structure lists modules/parties/; built inside modules/transactions/"
  - "no Design System tokens for border widths, outline offsets, breakpoints or layout constraints"

decisions: 7          # decision-log rows 10-16
blockers:  [1, 2, 3, 4]   # error-log rows
self_check: passed
---

## What I built

**Module 3.** Transactions, parties and the append-only activity log, with the status ladder
enforced in the service layer before any write. A terminal transition writes all five columns —
`closed_at`, `outcome_reason`, `outcome_notes`, `cycle_time_days`, `retention_until` — and a close
with no outcome is refused at the Zod pipe with the error keyed on `outcomeReason`, so it lands on
the dropdown rather than in a toast. A refused transition returns `INVALID_STATUS_TRANSITION`
carrying `details.allowedTransitions`, which is what lets the UI say where the matter *may* go.
`transaction_number` is allocated server-side, allocate-then-retry against the partial unique
index; the client never computes or submits one. `ActivityLogService` never throws — losing a feed
row must not lose the close.

**Layer 8G.** `MatterAccessGuard` registered as `APP_GUARD` after `JwtAuthGuard` and `RolesGuard`,
with the six-rung ladder in `MatterAccessService` as a pure function. Access is assignment, not job
title: unassigned attorney → READ_ONLY, unassigned paralegal → nothing, no fallback. The same rule
narrows the *list* query, or the guard protects the detail route while the collection hands out
every client name anyway. Denials carry `reason`, `assignedAttorney` and `requestAccessFrom`.

**The surfaces.** A pipeline board grouped by the status ladder, compact density, read-only columns
(dragging a card would imply a legal state change already happened). A create dialog with no
number and no status field. A detail shell that fetches the matter once and provides it by context,
with the ten-tab strip; only `overview` has a route, the other nine render disabled rather than
hidden. The status control is never optimistic, renders the server's rejection reasoning, and opens
a non-dismissible outcome prompt on a terminal move.

**Tests.** 79 E2E (the gate), 96 unit + integration. The E2E enumerates every one of the twelve
matter-scoped routes against the one identity that must never pass — the "five of six" failure the
decorator exists to prevent.

## Decisions made

Seven, logged as decision-log rows 10–16. The three a future agent will care about:

1. **The detail payload carries `allowedTransitions`** (row 11). The frontend holds no transition
   map at all. The identity file requires rendering the server's verdict; a second copy in the
   browser drifts the first time the ladder changes and starts offering transitions the server
   refuses.
2. **The pipeline reads the bare `keys.transactions()` key** (row 12). `mutations.ts` is
   append-only and `createTransaction` declares an exact-key invalidation, so a filtered key would
   silently never refresh after a create. **Any agent adding a filtered list key must append its
   own mutation with matching invalidation.**
3. **An expired grant falls through rung 4 to rung 5** (row 16) — found by the unit grid, not the
   E2E. See below.

## Handoff / notes for merge

**The operator must add one line to the dispatch.** `apps/api/src/app.module.ts` was outside the
declared boundary and a NestJS module is unreachable without an entry in its `imports` — no routes,
so the API E2E gate could not run at all. You approved adding it to `may_append_only`; the dispatch
file itself is outside my boundary, so I could not amend it. **`check-mounts.sh` currently FAILS on
exactly that one file** and passes on everything else, including verifying all five shared files as
genuinely append-only. Add the line and it goes green.

**The tab contract is the thing five branches depend on.** `TABS` in `TransactionShell.tsx`, with
the mount recipe in the file header: add a page under `[id]/<tab>/`, give your row an `href`, read
the matter with `useTransactionContext()` (do NOT refetch it), fetch your own collection with your
own key. Add rows; never reorder, rename or reshape.

**Two blockers I could not fix from inside the boundary** (error-log rows 2–3). The create form's
Zod schema and the `Transaction`/`Party`/`ActivityEntry` response types belong in `packages/shared`
per 06 Part 11, which is Foundations'. Both are duplicated *visibly*, with headers saying so and
naming the file they should move to. The enums still come from `packages/shared`, so values cannot
drift while the envelope is local; and a disagreement still surfaces as a 422 mapped onto the
field, so the form is the weaker gate and never the only one. Row 4 is smaller: `FIELD_LIMITS` has
no `OUTCOME_NOTES` entry, so 500 lives in the DTO.

**Two bugs worth knowing about, both invisible to lint and typecheck.**

*Drizzle wraps driver errors.* A direct `error.code === '23505'` check never matched, so the
number-allocation retry never fired and a routine concurrent create surfaced as a 500. The
cause-chain walk is in `transactions.repository.ts`. Any module catching a Postgres error code
needs the same unwrap — worth knowing before Documents hits it on a storage-key collision.

*An expired matter_access grant.* My first version denied outright; 13 §1 states the rung as "row
exists **and is not expired**", so an expired row simply does not match and evaluation continues to
the read-only rung. Denying stripped an unassigned attorney of the cover every attorney at the firm
has — losing an extra permission must never cost a baseline one. **No E2E case produced that
combination and none would have**; the exhaustive role×assignment grid in the unit spec is what
found it. That is the argument for keeping the ladder a pure function on the service.

**Per merge-queue condition 3**, this is my first backend module and takes an adversarial security
review in a fresh session before merge. The places to point it: the six `commit-check-exempt`
annotations (`grep -rn commit-check-exempt apps/api/src` — four are the 8G ladder's role
comparisons, one is the number allocator's deliberate un-filtered select, two are the firm-scoped
collection routes); `MatterAccessService.resolve`; and the route table in the controller header,
which should be read against the actual decorators rather than trusted.

**Not built, and out of scope by the dispatch:** tab *contents* for the other five slices, search
(8I), CSV import (8K), dashboard aggregation. No migration was written; all 27 tables already
existed.
