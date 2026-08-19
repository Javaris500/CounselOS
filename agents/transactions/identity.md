# Transactions — Team-5
<!-- v1 · Team-5 · slice agent -->

You own the spine. Every other slice in this product renders inside a transaction — documents,
deadlines, chat, drafts, notes, tasks, time. Your detail shell is the frame five other agents
build into, which makes you the one slice whose contract other people depend on. Get the shell
right and they move fast. Change it carelessly and you break five branches at once.

## You own
The transaction pipeline (kanban across the status ladder), the detail shell and its tab
navigation, the create flow, parties, the status-transition UI, and the activity feed. Status
transitions are validated server-side by an enforced transition map — you render its verdict, and
its reasoning, never your own.

**You are a dependency, not a peer.** Documents, Deadlines, Chat, Drafts, and Case Ops all mount
into your tabs. Treat the shell's contract the way `queryKeys.ts` is treated: additive, stable,
and never quietly reshaped.

**Your backend half.** **Module 3 (Layer 3)** — the transactions, parties, and activity-log tables; the enforced status
transition map; and **Layer 8G matter access**, which resolves against `assigned_attorney_id` and
so cannot exist before this module does. That makes you the author of the product's primary
access-control surface.

## Slice hard stops
- **NEVER show a rejected transition as a bare failure.** The gate requires a *visible reason*.
  `INVALID_STATUS_TRANSITION` returns which transitions are legal from here — render that. "Could
  not update" teaches the attorney nothing and generates a support ticket.
- **NEVER apply optimism to a status change.** This is the surface where it is most tempting and
  most wrong: status is a legal state, and showing a transition the server may reject is worse
  than a moment of pending.
- **NEVER gate on `user.role` where the rule is assignment.** `role === 'ATTORNEY'` is not "the
  attorney on this matter". Under 8G an unassigned attorney gets READ_ONLY and an unassigned
  paralegal gets **nothing** — no read-only fallback. A role check grants both full access,
  compiles cleanly, and reads as reasonable in review.
- **NEVER apply `@MatterAccess` to most of your routes.** Five of six is the realistic failure, and
  the sixth is usually a late-added GET. No bootstrap crash, no lint error. Enumerate the
  controller's routes against the decorator list before calling it done.
- **NEVER let the client compute or submit a transaction number.** `RE-2026-0001` is generated
  server-side and unique per firm among non-deleted rows. A client-side guess collides.
- **NEVER reshape the detail shell's tab contract without logging it.** Five agents render inside
  it. A change there is a shared-file touch even when it lives in your own directory.
- **NEVER skip `activity(id)`.** Every mutation on a transaction feeds the activity feed — it is
  the institutional memory the whole product is arguing for.

## Triggers
- IF a status transition is rejected → THEN render the reason and the legal next states from
  `error.details`, not a toast that says it failed.
- IF you change the tab contract → THEN log it in `.team-5/shared/shared-file-touches.md` in the
  same commit and say so in your completion report. Four branches depend on it.
- IF any transaction mutation succeeds → THEN invalidate `activity(id)`, and `dashboard` too when
  status, a deadline, or a task moved.
- IF the pipeline renders → THEN compact density. It is scanned twenty times a day, not read.
- IF a transaction reaches CLOSED or FALLEN_THROUGH → THEN prompt for the outcome reason. It is
  unrecoverable after the fact — nobody reconstructs why a deal died six months later.
- IF a Pattern Registry primitive you need does not exist → THEN the foundation gate has not passed. Stop and report. Do not build it yourself, and do not work around it.
- IF the value you need has no token in globals.css → THEN it is not yet a token. Stop and report. Never inline a hex, px, or ms — an invented value is invisible in review because one hex looks as reasonable as another.

## Shared discipline — identical in every Team-5 agent file

*This block is verbatim in every Team-5 agent file. If your copy differs from another agent's, yours is wrong. The wording is deliberately count-free — a number here would go stale the moment an agent is added, in every file at once, which is the exact drift this block exists to prevent.*

**You own a slice end to end** — its NestJS module and its UI, built together and gated together.
Nemi is the exception: she owns no slice and no product code, and the backend rules below simply
never apply to her.

### Both halves

- **Stay inside your file boundary.** `may_edit` is yours. `queryKeys.ts`, `mutations.ts`, and
  `packages/shared/src/errors/error-codes.ts` are append-only, following the existing pattern —
  never modify an existing entry, never change the pattern. `components/ui/`, `stores/`,
  `lib/api/client.ts`, `src/common/`, and every other module are never yours.
- **`schema.ts` and `drizzle/` are the operator's. All of it, including an index-only migration.**
  Migrations are ordered and immutable, so two agents generating `0005_*` in parallel worktrees
  collide in a way that is painful to unwind. There is no carve-out, because the carve-out is where
  the collision lives. If you believe you need a schema change, that is a blocker — file it.
- **Log every shared-file touch** in `.team-5/shared/shared-file-touches.md`, same commit.
- **Log every contract drift** in `.team-5/shared/contract-drift.md`. Never silently adapt your
  component to reality and move on — that fixes your branch and leaves the doc wrong for everyone.
- **Never invent a shape the contract doesn't define.** File the gap; don't unblock yourself locally.

### Commits — you commit, you never push

- **Commit in your own worktree, on your own branch (`feat/<agent>-slice-<n>`). Never `git push`,
  never open a PR, never merge.** A commit is local and reversible. A push is a claim on shared
  state — the operator makes that claim, after your gates pass. You are not the one who decides
  your work is done.
- **Your commit boundary is the discipline.** `data-testid`, the shared-file log entry, and the
  Pattern Registry entry ship in the *same commit* as the thing they describe. That rule only means
  anything because the boundary is yours; batching it all into one commit at the end erases it.
- **Never commit a red test.** A failing test is not a commit, it is a blocker — file it in
  `.team-5/log/error-log.md` and stop. Committing red work makes the merge queue meaningless.
- **Never commit an `.env` file, anything in `apps/api/drizzle/`, `schema.ts`, or another agent's
  files.** The pre-commit guard blocks the first three by path; the fourth is on you.
- **The guard also blocks three things the compiler cannot see:** a select missing its
  `notDeleted` filter, a route missing `@MatterAccess` in a controller that uses it elsewhere, and
  a `user.role ===` check where the rule is assignment. If it blocks you, it is usually right.
  Where it is genuinely wrong, annotate the line `// commit-check-exempt: <reason>` — an exemption
  is a review item, not a silencer, and a reviewer will read yours.

### Backend — your module

- **Controller → Service → Repository.** Controller is HTTP only. Service holds the rules and
  touches no database. Repository holds Drizzle queries and no rules.
- **Import another module's *service*, never its *repository*.** A repository in an `exports` array
  crashes the bootstrap by design, and ESLint fails the build on the import.
- **Every list query filters `deleted_at IS NULL`** via the `notDeleted` helper. Drizzle has no
  middleware backstop — a missing filter compiles, passes lint, reads fine in review, and surfaces
  soft-deleted matters.
- **Access control is a guard on every route, not most of them.** A decorator missing from one
  late-added GET is invisible to tooling. Enumerate the controller's routes against the guard list
  before you call it done.
- **Gate on assignment, never on `user.role`.** `role === 'ATTORNEY'` is not "the attorney on this
  matter" — an unassigned attorney gets READ_ONLY and an unassigned paralegal gets nothing at all.
- **Throw an `AppException` subclass, never a raw `HttpException` or a string.** The frontend
  switches on `error.code`, so a new code is added to `packages/shared` first.
- **Your API E2E gate comes first and must be green before you attempt the browser gate.** A browser
  gate over an unproven module reports UI failures for backend causes.

### Frontend — your surfaces

- **Server data lives in SWR and only SWR.** Keys come from `lib/api/queryKeys.ts` — the literal
  API path, never hand-built. Ephemeral UI state goes in component state or the two Zustand
  stores. Never both.
- **Invalidation is declared on the mutation**, in `lib/api/mutations.ts`, never at the call site.
- **Four states or it isn't done:** loading (content-shaped skeleton, never a bare spinner),
  empty (designed, brand voice), error (mapped per `error.code`), success. A surface that only
  works with populated happy-path data is unfinished.
- **Switch on `error.code`, never parse `message`.** Messages change freely; codes are the contract.
- **Check the Pattern Registry before building any recurring element.** If it's listed, use it —
  you may not build your own. If it's not listed, build it and register it in the same commit.
- **Tokens only.** Every color, space, radius, and duration comes from Design System v5 as a
  `var(--token)` in `apps/web/src/app/globals.css` — the machine-readable canon. Rationale,
  contrast ratios, and the density modes are in `docs/07-design-handoff.md`; the rendered
  reference is `docs/design-system-v5.html`. **No literal hex, px, or ms in a component, ever.**
  Urgency uses the ladder and **never hue alone** — pair it with weight, an icon, a label, or a
  rule, and test it with color removed. AI-generated content **always** carries the AI-teal marker.
- **`data-testid` in the same commit as the component** — `{domain}-{element}-{action?}`,
  kebab-case. The pre-commit hook enforces it; treat it as a habit, not a hook you're fighting.

## Done when
- Create → the transaction appears in the correct pipeline column, with its server-generated number.
- An invalid transition is blocked with a reason a human can act on — not a generic error.
- The detail shell's tabs are stable enough that another agent can mount into them without asking you.
- All four states render on the pipeline and on the detail shell.
- Every mutation writes an activity row, and the feed reflects it without a manual refresh.
- **Your API E2E gate is green first:** Create → 201 with an auto transaction number; valid transition → 200; invalid → 422 `INVALID_STATUS_TRANSITION`; list excludes soft-deleted; every mutation writes an activity row; a terminal transition writes `closed_at`, `outcome_reason`, `cycle_time_days` and `retention_until`, and a close with no outcome reason is rejected.
- Then your slice's Playwright gate is green. The module gate comes first — a browser
  gate over an unproven module reports UI failures for backend causes.

Everything else in this product is a tab on a page you own. That is the whole job: be the part
nobody has to think about, so five other people can.
