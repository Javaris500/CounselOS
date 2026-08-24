# Error / Escalation Log

**Written by:** the agent, on any blocker — including ones you resolved yourself.
**Why:** a recurring blocker is a systemic problem, not bad luck. The pattern is the data.

**Escalation ladder:** agent → integrator → operator. A contract gap goes straight to the top.

## Log

| # | date | agent | slice | blocker | escalated_to | resolution | status |
|---|---|---|---|---|---|---|---|
| 1 | 2026-08-23 | transactions | 1 | `app.module.ts` is outside the dispatch boundary, but a NestJS module is unreachable without an entry in its `imports` — no routes, so the API E2E gate could not run at all | operator | boundary amended: `apps/api/src/app.module.ts` added to `may_append_only`; 2 lines added, 0 removed. **The dispatch file itself still needs that line or `check-mounts.sh` will flag it** | closed |
| 2 | 2026-08-23 | transactions | 1 | `packages/shared` is Foundations', so the create form's Zod schema cannot live there — `06-frontend-architecture.md` Part 11 requires ONE schema validating in both the browser and the Zod pipe | operator | duplicated visibly in `components/features/transactions/create-transaction.schema.ts` with a header saying so; server 422 + `applyServerErrors` remains the real gate. Hoist to `packages/shared/src/schemas/transaction.schema.ts` and delete the local copy | open |
| 3 | 2026-08-23 | transactions | 1 | Same cause: the `Transaction`/`Party`/`ActivityEntry` response types cannot go in `packages/shared` | operator | declared in `components/features/transactions/transaction.types.ts`; the ENUMS are still imported from `packages/shared`, so values cannot drift even while the envelope is local. Hoist to `packages/shared/src/types/transaction.ts` | open |
| 4 | 2026-08-23 | transactions | 1 | `FIELD_LIMITS` has no `OUTCOME_NOTES` entry, and `05-backend-checklist.md` §3C caps `outcome_notes` at 500 chars | operator | `OUTCOME_NOTES_MAX = 500` exported from `dto/update-status.dto.ts`. Belongs in `packages/shared/src/constants/limits.ts` beside `COMMUNICATION_SUMMARY` | open |
| 5 | 2026-08-23 | transactions | 1 | `.team-5/reports/` is in no dispatch path list, but `_TEMPLATE-completion.md` says the agent writes the completion report — so `check-mounts.sh` flags the required deliverable as OUTSIDE BOUNDARY. Affects **every** agent, not this slice: it is a defect in `_TEMPLATE-dispatch.md`, not in this dispatch | operator | wrote the report anyway (the process requires it) and filed this rather than skipping it. Add `.team-5/reports/` to `may_append_only` in the dispatch template, alongside `.team-5/log/` and `.team-5/shared/` | open |
| 6 | 2026-08-23 | transactions | 1 | **Closes row 2.** Create-form schema hoisted by Foundations to `packages/shared/src/schemas/transaction.schema.ts` | operator | local duplicate `create-transaction.schema.ts` DELETED (not synced — my own file header said delete, and it was right); `CreateTransactionDialog` imports from `@counselos/shared`. Verified byte-identical before deleting rather than taking the hoist on trust. 06 Part 11 now genuinely holds: ONE schema, both sides | closed |
| 7 | 2026-08-23 | transactions | 1 | **Closes row 3.** Response types hoisted to `packages/shared/src/types/transaction.ts` | operator | local duplicate `transaction.types.ts` DELETED; six components import `Transaction`, `TransactionDetail`, `Party`, `ActivityEntry`, `Paginated` from `@counselos/shared`. Verified identical first. A mismatch between API and web is now a compile error rather than a bug report | closed |
| 8 | 2026-08-23 | transactions | 1 | **Closes row 4.** `FIELD_LIMITS.OUTCOME_NOTES = 500` now exists in `packages/shared` | operator | **NOT yet consumed** — `dto/update-status.dto.ts` still exports its own `OUTCOME_NOTES_MAX = 500`, and `StatusControl.tsx` has a local `const OUTCOME_NOTES_MAX = 500`. Same value, three declarations, which is the drift this hoist exists to end. Switching both to `FIELD_LIMITS.OUTCOME_NOTES` was NOT in the operator's task list, so it is flagged here rather than done unasked | open |
| 9 | 2026-08-23 | transactions | 1 | Rows 2-4 could not be closed IN PLACE: `.team-5/log/error-log.md` is `may_append_only` and `check-mounts.sh` fails on any removed line, so editing a `status` cell from `open` to `closed` would fail the ownership check | operator | closure recorded as rows 6-8 instead. Rows 2-4 still read `open` in their own status column — the operator is not bound by check-mounts and can flip them, or the template can gain a convention for closure-by-reference | open |
| 10 | 2026-08-23 | transactions | 1 | **Closes row 8**, which understates its own outcome. Row 8 says `FIELD_LIMITS.OUTCOME_NOTES` is "NOT yet consumed" and leaves itself `open`; I wrote it before making the change and then made the change in the same working set, so it was stale the moment it was committed | operator | consumed in f6a2133: one declaration in `packages/shared/src/constants/limits.ts`, read by `dto/update-status.dto.ts` and `StatusControl.tsx`. No local copy of 500 remains. Row 8 stays as written — the lesson is that a status row written mid-flight records an intention, not a result, and appending is the only honest fix | closed |
| 11 | 2026-08-24 | nemi | 1 | The browser gate could not start at all: `packages/shared/dist/` is gitignored and nothing in the Playwright path builds it, so both webServers died — the API with ~40 lines of `TS2307: Cannot find module '@counselos/shared'`. Playwright reported only "Process from config.webServer was not able to start", which reads as broken imports in `src/` | operator / foundations | built `@counselos/shared` at `playwright.config.ts` module scope, the only point guaranteed to run once before both servers (globalSetup runs AFTER webServer; either webServer command would race the other, which starts concurrently). Upstream fix: `apps/api`'s `build` should depend on its workspace dependency, or the gate should run through turbo. Both files outside this dispatch | open |
| 12 | 2026-08-24 | nemi | 1 | `import { SEED_IDS } from '.../seed'` cannot be transpiled by Playwright — `seed.ts:4` imports `PG_CLIENT_OPTIONS` from `database.module.ts`, whose NestJS parameter decorators Playwright's Babel rejects. `seed.ts`'s own header promises Playwright imports it directly | foundations | read via a tsx subprocess in `e2e/fixtures/seed.ts`; no UUID hardcoded, so the rule holds. Real fix: move `PG_CLIENT_OPTIONS` to a file with no NestJS in it, then the fixture collapses to one re-export | open |
| 13 | 2026-08-24 | nemi | 1 | A file-based `storageState` per role — the shape the dispatch describes and Playwright's standard pattern — cannot work here. The refresh token ROTATES ON USE, so the stored cookie is a single-use credential: test one consumes it, test two lands on `/auth/login`, and nothing connects the two | operator | minted per test through `/v1/auth/login` and handed to Playwright as a storageState OBJECT (`e2e/fixtures/auth.ts`). No test drives the login form; slice 0 keeps that. **The dispatch template should say so** — every later slice will reach for the file first and lose an hour to what looks like flake | open |

## Rules

- **A contract gap is never patched locally.** File it, fix the doc, everyone rebuilds against
  the fix. A local patch fixes one branch and leaves four agents wrong.
- **Log it even if you unblocked yourself.** What blocks agents is the useful signal.
- Recurring entries become a KnowledgeEntry at harvest.


## Closing an entry — closure-by-reference

**Never edit a row's `status` cell.** These logs are `may_append_only` for every agent, and
`check-mounts.sh` fails on any removed line — so flipping `open` to `closed` in place is an
ownership violation. Close an entry by **appending a new row that references it**:

> `| 6 | … | **Closes row 2.** <what resolved it> | … | closed |`

Discovered by the transactions agent during mission 002 (error-log row 9), which could not close
its own rows 2-4 and said so rather than working around the check.

**This is the right answer, not a workaround for a strict tool.** An append-only ledger where
closure is a new entry preserves *when a thing was open and for how long* — which is the data these
logs exist to produce. A flipped cell destroys exactly that: it makes a blocker that stalled an
agent for two hours indistinguishable from one resolved in a minute. `transaction_activities` has
no `updated_at` for the same reason.

So a row's `status` records what was true **when it was written**, permanently. To find current
state, read forward for a row that closes it. The operator is not bound by `check-mounts.sh` and
*could* edit cells — and should not.

## Status values

`open` → `escalated` → `closed` | `wont-fix`

## Example

Illustration only — never copy this row into the log above.

| # | date | agent | slice | blocker | escalated_to | resolution | status |
|---|---|---|---|---|---|---|---|
| 1 | 2026-01-15 | drafts | draft-review | mock lacked `sections[].reviewedAt`; unclear whether the gate should read it | operator | build gate on local state; log as contract drift, fix the doc | closed |
