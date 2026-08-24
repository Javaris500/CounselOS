---
# WRITTEN BY: the operator, before an agent starts a slice.
# FILENAME:   nemi-slice-1-dispatch.md

agent:            nemi
slice:            1
dispatch_id:      nemi-slice-1
branch:           test/nemi-slice-1        # branched from feat/transactions-slice-1
issued:           2026-08-23

scope: >
  The slice 1 browser gate, the storageState harness every later slice depends on,
  the four-states and accessibility pass over the transactions surfaces, and the
  Pattern Registry audit of the three primitives that slice registered.

file_boundary:
  may_edit:
    - apps/web/e2e/
    - apps/web/playwright.config.ts
    - "*.test.tsx"          # colocated component tests, anywhere
    - "*.test.ts"
  may_append_only:
    - .team-5/findings/
    - .team-5/reports/
    - .team-5/log/decision-log.md
    - .team-5/log/error-log.md
    - .team-5/shared/contract-drift.md
    - .team-5/shared/pattern-registry.md   # you AUDIT it; append findings, never rewrite rows
    - .team-5/compliance/
  must_not_touch:
    # You write no product code. This is the mechanism, not a courtesy — an agent
    # that can edit the code it tests can make any failing test pass by changing
    # the code instead of fixing the bug.
    - apps/api/src/           # including the transactions module you are testing
    - apps/web/src/           # except the *.test.tsx / *.test.ts globs above
    - packages/
    - apps/api/drizzle/
    - docs/
    - agents/

builds_against: live
exit_condition: >
  The slice 1 gate from 00-developer-guide.md §7 is green, AND the clause slice 0
  deferred. A red gate is a blocker you file, never a gate you widen.

slice_hard_stops:
  - NEVER write product code. If a test cannot pass without a source change, that is a
    finding in .team-5/findings/, not an edit. This is the whole reason you own no slice.
  - NEVER pass a surface on the happy path alone. Loading, empty, error and success are
    each proven or the surface fails your gate.
  - NEVER approve result-bearing UI that carries meaning in colour alone. Test it with
    colour removed.
  - NEVER wave through a red gate. "We'll fix it after merge" is how slices inherit each
    other's bugs.
  - NEVER log in inside a test. Slice 0 does, because slice 0 IS the login test. Every
    later slice takes auth from storageState — building that is your first task here.
---

## Assignment

**1 — The storageState harness. Do this first; nothing else can be written cleanly without it.**

`CLAUDE.md`'s Playwright rules say auth comes from `storageState` per role and the login flow is
tested once, in slice 0. That storageState does not exist yet — `global-setup.ts` currently only
migrates, resets and seeds, and `slice-0.spec.ts` signs in through the form because that is what it
is testing. `slice-0.spec.ts:63` already names this: *"the same mechanism storageState relies on for
every later slice's tests."*

Build it. One state per role — ATTORNEY and PARALEGAL at minimum, since the gate needs both. The
fake Supabase Auth at `:54321` mints real ES256 tokens; the access token lives in memory and the
refresh token in an httpOnly cookie, so a stored context has to carry the cookie and let `apiFetch`
rehydrate. Slice 0 proves that path works — reuse it, don't reinvent it.

**2 — The slice 1 gate**, from `00-developer-guide.md` §7, verbatim:

> create → appears in the right pipeline column → open detail → change status → invalid transition
> blocked with a **visible reason**

"Visible reason" is the load-bearing half. `INVALID_STATUS_TRANSITION` returns
`details.allowedTransitions` and the UI renders them as buttons. A test that only asserts the
transition failed does not test this clause.

**3 — The clause slice 0 deferred.** A paralegal denied an unassigned matter sees the explaining
error, not a bare 403. `MATTER_ACCESS_DENIED` carries `reason`, `assignedAttorney` and
`requestAccessFrom`. Fixtures are already seeded: `manorRd` has `assignedParalegalId` set,
`clawsonRd` does not — `clawsonRd` is your denial case. Import IDs from the seed module; never
hardcode a UUID and never click through the UI to find a fixture.

**4 — Four states on every surface** the slice added: pipeline board, detail shell, status control,
activity feed, parties list, create dialog. Loading, empty, error, success.

**5 — Accessibility.** Keyboard path, focus order, labels, contrast. The status control and the
urgency treatment are where colour-only meaning would hide.

**6 — The Pattern Registry audit.** The transactions agent registered `Card`, `Tabs` and `Select`
in the same commit as it built them. Verify the entries match what shipped, and that nothing else in
the slice duplicates an existing primitive.

## What already passed, so you know what you are adding to

Verified independently, on `feat/transactions-slice-1`: API E2E **79/79**, integration **41/41**,
unit **55/55**, lint and typecheck green, ownership PASS on 61 files. The module gate is proven. The
browser gate is the half that does not exist — that is the entire reason you are here.

## Operational constraint — read this before you run anything

**Playwright cannot run in two worktrees at once.** There is one Postgres on port 5434 and
`global-setup.ts` truncates and reseeds it. A concurrent run corrupts both, and the failures look
random rather than caused. The transactions agent is idle; confirm it still is before a run.

## How this is checked

`./scripts/check-mounts.sh .team-5/dispatch/nemi-slice-1-dispatch.md feat/transactions-slice-1`

Your `may_edit` globs are matched as globs, so a `*.test.tsx` anywhere is yours and the component
beside it is not. If the boundary is wrong, say so and it gets amended — three boundary defects were
found and fixed that way on the transactions dispatch, all of them operator errors. Working around
one silently is the only response that cannot be reviewed.

## Out of scope

Fixing anything you find. You file findings; the transactions agent or the operator fixes them.
Slice 0's gate is already green and is not yours to revise. Tab *contents* for the five slices that
have not landed do not exist and are not a gap.
