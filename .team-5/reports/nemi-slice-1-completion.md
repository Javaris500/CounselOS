---
# WRITTEN BY: the agent, when its slice is done or blocked.
# FILENAME:   nemi-slice-1-completion.md
# PAIRS WITH: .team-5/dispatch/nemi-slice-1-dispatch.md

agent:                    nemi
slice:                    1
dispatch_id:              nemi-slice-1
branch:                   test/nemi-slice-1
completed:                2026-08-24
status:                   complete

files_touched:
  - apps/web/playwright.config.ts
  - apps/web/e2e/fixtures/auth.ts
  - apps/web/e2e/fixtures/seed.ts
  - apps/web/e2e/fixtures/print-seed-ids.ts
  - apps/web/e2e/slice-1.spec.ts
  - apps/web/e2e/slice-1-access.spec.ts
  - apps/web/e2e/slice-1-states.spec.ts
  - apps/web/e2e/slice-1-a11y.spec.ts
shared_files_touched: []   # none. No product code, no queryKeys, no mutations, no error codes.
components_created: []     # none, by design — Nemi owns no slice and writes no product code.

testids_added:            false      # none needed: every selector this gate uses already existed
playwright_gate:          pass       # 48/48, whole suite, real stack
four_states_covered:      true
error_codes_handled:      [INTERNAL_ERROR, TRANSACTION_NOT_FOUND, MATTER_ACCESS_DENIED,
                           INVALID_STATUS_TRANSITION, VALIDATION_ERROR]
mock_used:                true       # network interception in slice-1-states.spec.ts ONLY;
                                     # the gate file intercepts nothing
contract_drift:
  - "seed.ts header promises Playwright imports SEED_IDS directly — it cannot"
  - "13 §1 requires the frontend to render the named attorney and a request button — ErrorState renders neither"

decisions: 3               # decision-log rows 18, 19, 20
blockers: [11, 12, 13]     # error-log rows
self_check:               passed
---

## What I built

**The storageState harness, and the four spec files that run on it.** No product code — that is
structural. An agent that can edit the code it tests can make any failing test pass by changing the
code instead of fixing the bug, so everything below is a finding or a test, never an edit.

### 1. The harness — `apps/web/e2e/fixtures/`

`auth.ts` exposes a `role` test option and a `storageState` fixture, so a describe block picks its
actor with `test.use({ role: 'PARALEGAL' })` and the default stays ATTORNEY. It also exposes
`openSecondSession()`, which the gate needs.

**It mints per test rather than reading a file, and that is the single most important thing in this
report for the next five slices.** The shape the dispatch describes — and Playwright's own standard
pattern — is a setup project that logs in once per role and writes `.auth/attorney.json`. Against
this API that produces a suite where the first test passes and the second lands on `/auth/login`,
with nothing linking the two. The cause is correct behaviour: **the refresh token rotates on use.**
The access token lives in memory and nothing durable is stored on the origin, so the httpOnly
`counselos_rt` cookie is the whole of the stored state — and it is a single-use credential. The
first test to load a protected page consumes it; the API writes the successor into that test's own
context; the context is discarded; the file still holds the dead token.

Rotation is right and is not the thing to change. The harness adapts: one login per test through
`/v1/auth/login` (the endpoint the form calls, not the form), producing a real `storageState` object
that Playwright hands to the context exactly as it would hand it a file. The rule that matters — no
test drives the login UI — holds, and slice 0 remains the only place that form is exercised.

`seed.ts` re-exports the seeded UUIDs. No UUID is hardcoded and no fixture is found by clicking. It
cannot import the seed module in-process, which is finding 7: `seed.ts` pulls `PG_CLIENT_OPTIONS`
out of `database.module.ts`, and Playwright's Babel cannot parse NestJS parameter decorators, so
reading one plain constant drags a whole NestJS module through a parser that chokes on it. It is
read through a tsx subprocess instead — the same runtime `fake-supabase-auth.ts` uses to import the
same module without trouble.

`playwright.config.ts` now builds `@counselos/shared` before either server starts. Without it the
browser gate could not run at all on a clean tree (finding 8).

### 2. `slice-1.spec.ts` — the gate

The clause from `00-developer-guide.md` §7, in one test, in order: create → appears in the right
pipeline column → open detail → change status → invalid transition blocked with a visible reason.
Nothing is intercepted. Real browser, Next, NestJS, Postgres, Redis, guards and httpOnly cookie;
only Supabase Auth is faked, and it mints genuine ES256 tokens.

"The right column" is asserted three ways — the card is in the INTAKE column, it is in no other
column, and it carries `data-status="INTAKE"` — because a card rendering *somewhere* on the board
would satisfy a naive check, and the columns ARE the status ladder.

The last clause needed the most care. The status control only ever offers
`transaction.allowedTransitions`, which the server computed, so **a browser cannot ask for an
illegal transition unless what it is looking at is stale.** A second signed-in session moves the
matter on while the first tab holds its old ladder — a colleague in another window, which is the
real shape of this failure — and `revalidateOnFocus: false` is what keeps the first tab stale when
focus returns. The precondition is asserted rather than assumed, so a future revalidation change
fails there instead of as a confusing "the rejection never appeared".

The refusal is then checked on all four things that make it actionable: the move did not happen,
it carries `role="alert"`, the message names both states, and it lists exactly what IS legal from
where the matter actually is — **and nothing that is not.** That last assertion is the one that
matters: an explaining error that explains something untrue is worse than a bare 403, because it
sends the attorney to do a thing that will also fail.

### 3. `slice-1-access.spec.ts` — the clause slice 0 deferred

`slice-0.spec.ts:10` says the fourth clause belongs to slice 1 because 8G resolves against
`transactions.assigned_attorney_id`. Four tests close it.

Both halves of the paralegal rule, because only the denial would pass equally well against a build
where she can open nothing at all: `manorRd` (she is the assigned paralegal) opens with FULL and
real status moves; `clawsonRd` (attorney only) is denied. The denial is checked for four things —
the typed code reached the component, it is announced, the matter never partially renders (a denial
that still leaks the address and the client names has denied nothing), and the copy tells her what
to do next. The list is checked too: a guard on the detail route is worth nothing if the pipeline
hands out every address anyway.

Plus the rung a role check gets wrong: an attorney NOT on the matter gets READ_ONLY cover, so
`sCongress` reads but refuses a status move — visibly, with the server's own explanation.

### 4. `slice-1-states.spec.ts` — 21 tests, four states each

Pipeline board, detail shell, status control, activity feed, parties list, create dialog.

The assertion this file exists for: **on the board, a failed fetch must never be confusable with an
empty result.** "No active transactions" is a false statement about a law firm's caseload, and it is
exactly what a swallowed error looks like. Also proven: the shell renders nothing partial on
failure, the activity panel fails ALONE while the matter around it still reads, the create submit is
genuinely disabled in flight, the status control never renders a move optimistically, and a terminal
matter offers no transitions and says why — reached by driving the outcome dialog, which refuses to
proceed without the one field that cannot be captured later.

### 5. `slice-1-a11y.spec.ts` — 16 tests

Keyboard end to end, focus visibility, labels, contrast computed rather than eyeballed, and colour
removed twice — grayscale and `forcedColors: active`, because the two failure modes differ. Full
verdict in the findings file.

## Decisions made

Three, in `log/decision-log.md` rows 18-20. Row 17 is reserved by the operator per
`operator-slice-1-findings.md`.

1. **Auth is a per-test `storageState` object, not a `.auth/<role>.json`** (row 18) — the refresh
   token rotates on use, so a file-based state is single-use and fails in a way that reads as flake.
2. **Route interception lives in the states spec and never in the gate** (row 19) — "the response
   has not arrived" and "the request 500s" are not states the backend can produce on demand, but a
   gate over a mocked backend proves nothing. Interception replaces the network, the seam MSW
   occupies, never a module and never `apiFetch`.
3. **The invalid-transition clause is driven through a stale second view** (row 20) — a crafted bad
   request would test the API, which the module gate already does, and would prove nothing about
   whether the UI can reach or render the refusal.

## Handoff / notes for merge

**Gate: PASS.** 48/48 across the whole browser suite, including slice 0's six, against the real
stack. The slice 1 clause is green and so is the clause slice 0 deferred.

**Ten findings, no blocker** — `.team-5/findings/nemi-slice-1-findings.md`. The two worth reading
first are both one-file fixes and both live in files this dispatch could not touch:

1. `ErrorState` discards the explaining denial. The backend does exactly what 13 §1 asks; the
   component maps the code to fixed generic copy and never reads `error.message` or `error.details`.
   The same product gets it right on the other path — `StatusControl` renders the server message
   verbatim for the same code — so one error code produces two levels of helpfulness.
2. The rejection banner names the wrong origin state, because it composes its second sentence from
   the stale local status while the list beside it is the server's. It currently states a transition
   rule that does not exist, in the one message whose purpose is to teach the rule. The server
   already sends `details.from`.

**Pattern Registry: same-commit rule PASSES on all three.** `Tabs` and `Select` match what shipped.
`Card` does not — zero consumers, two hand-rolled duplicates in the same commit. There is a real
constraint under it (a pipeline card must be an `<a>` and `Card` has no `href` form), so it is a gap
in the primitive, not a licence to fork it. Decision belongs to Foundations. Audit appended to
`pattern-registry.md`; no row rewritten.

**Three things every later slice inherits**, error-log rows 11-13. The dispatch template should be
amended for the first of them: *auth comes from the fixture in `e2e/fixtures/auth.ts`; do not write
a `.auth/*.json`.* Otherwise the next agent reaches for the file, and loses an hour to a failure
that looks random rather than caused.

**One thing about this dispatch that was wrong, and it is small.** The dispatch names `clawsonRd` as
the denial case; `seed.ts:186-189` names `sCongress` as "the matter the Slice 0 gate denies her".
Both work — neither has an `assignedParalegalId` — so nothing was blocked. `clawsonRd` was used as
dispatched, and `sCongress` earns its keep as the read-only-cover fixture, which is the rung a role
check actually gets wrong. Worth reconciling the seed comment so the next reader is not choosing
between two claimed answers.

**Not covered, named so it is not mistaken for covered:** no axe-core sweep (not a dependency of
`@counselos/web`; adding one is outside this boundary — recommended), no screen-reader transcript,
no mobile viewport (slice 4's gate is the first to require one), no reduced-motion or 200%-zoom
check. No colocated `*.test.tsx` component tests were written: `apps/web` has no unit test runner,
and adding one means editing `apps/web/package.json`, which this dispatch does not grant.

**Operational note.** The suite is `workers: 1` and shares one database, which `globalSetup`
truncates and reseeds. It must not run in two worktrees at once. The gate creates matters and moves
their statuses, so it depends on the reseed and not on being run in isolation.
