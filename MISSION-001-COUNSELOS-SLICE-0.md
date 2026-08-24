# MISSION-001 — CounselOS Slice 0

**Mission:** Slice 0, Foundation.
**Operator:** Axis (manual).
**Roster:** none dispatched — the operator built Slice 0. See `.team-5/status/merge-queue.md`.
**Opened:** 2026-08-17 · **Closed:** 2026-08-23 · **Result:** shipped, gates green.

> Slice 0 was built before the agent system ran. This record exists so the first *dispatched*
> mission has a baseline to be compared against — what a slice costs and how it fails when a human
> does it. Slice 1 is the first real test of the roster.

---

## Definition of done

Copied word for word from `docs/00-developer-guide.md` §9 on 2026-08-23. **Not paraphrased.** If it
changes, record what changed and why in the amendments section — do not edit it in place.

### §9 — Definition of Done (verbatim)

A layer or feature is **done** when:

- [ ] All checklist items for it are ticked in `05-backend-checklist.md`
- [ ] Unit tests cover the deterministic logic (including boundaries and failure cases)
- [ ] Integration tests cover the DB and queue paths
- [ ] At least one e2e test proves the endpoint end-to-end with a real JWT
- [ ] The negative cases are tested (invalid transition throws, wrong role gets 403, expired token gets 401)
- [ ] Errors return the standard envelope with a typed code — never a raw stack trace
- [ ] Anything AI-touched respects the compliance rules in `09-legal-compliance.md`
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass
- [ ] The PR is reviewed against the §8 checklist

"It runs on my machine" is not done. "The tests prove it, including when it should fail" is done.

---

**Amendments:** none.

### The slice gate, from `00-developer-guide.md` §7 (verbatim)

> **Slice 0 — Foundation.** Backend L1 + L2 + 8G access guard + 8L `/v1/health/services`. Frontend
> shell: layouts, route groups, `apiFetch` with single-flight refresh, both Zustand stores, design
> primitives off the v5 tokens. Demo seed working.
> *Gate:* login → dashboard · expired token silently refreshes · deactivated user lands on
> `/auth/deactivated` · paralegal denied an unassigned matter sees the **explaining** error, not a
> bare 403.

**One clause moved, on the record.** The fourth clause is Layer 8G, which resolves against
`transactions.assigned_attorney_id` and therefore depends on Module 3 — slice 1. It cannot be built
or tested before there are transaction-scoped routes to guard. Slice 0 closed on the first three;
the fourth moves with 8G. Noted 2026-08-18 in `00-developer-guide.md` §7 and in the header of
`apps/web/e2e/slice-0.spec.ts`. This is a scope change to the gate and is recorded as one.

---

## What ran

| Phase | Who | What shipped |
|---|---|---|
| 0a — frontend foundation | operator | v5 tokens (129), 12 registry primitives, `apiFetch` with single-flight refresh, `queryKeys.ts`, `mutations.ts`, both Zustand stores, MSW handlers, route groups |
| 0b — backend + auth | operator | L1 foundation, error envelope + filter + Zod pipe + interceptors, 8L `/v1/health/services`, 27 tables + 4 migrations + RLS, seed/reset, L2 auth (ES256/JWKS, guards, login proxy, httpOnly rotating refresh cookie) |

**No agent was dispatched.** `.team-5/dispatch/` and `.team-5/reports/` are still empty. There is
no dispatch↔completion pair for this mission, which is the measurement the apparatus exists to
collect — and the reason Slice 1 matters more than this record does.

## Gate results at close

| Gate | Result |
|---|---|
| `pnpm lint` | pass |
| `pnpm typecheck` | pass |
| unit | 19/19 |
| integration | 41/41 |
| API E2E | 37/37 |
| Playwright — the slice gate | **6/6** |

HEAD commit `31f4b44`, 2026-08-23.

## What the gates caught that review did not

**One real bug, and it was the browser gate that found it.** `supabase.provider.ts` held two
supabase-js singletons configured `persistSession: false`, under a comment asserting that made them
stateless. It did not — the client retains the last session in an in-memory adapter, so
`refreshSession()` operated on whichever user logged in most recently and rotated away a *different*
user's refresh token. Reproduced at the API level: refreshing user A's token returned 201 while
user B, the stored session, got 401 and was logged out having made no request.

Fixed by calling GoTrue directly over `fetch` and deleting the client. `SURPRISES.md` 001.

**Why it matters as evidence:** no unit test asserts against this, ESLint cannot see it, and it
survived being read carefully — the file documented the exact failure mode it had. In production,
with 3600s tokens, the 90-second expiry margin makes it fire rarely and unreproducibly: a user
reports "I got logged out randomly" and there is nothing to chase. **This is the first concrete
evidence that the two-gate rule pays for itself.**

## Where the process was skipped or cut

Recorded honestly, because the value of this file is the parts that went wrong.

- **`.team-5/` was never exercised.** No dispatch, no completion report, no findings file, no
  compliance attestation. Templates only, at close as at open.
- **`COST-LOG.md` did not exist during the mission.** Slice 0's token spend is unrecoverable. It
  is created at the same time as this file and starts at Slice 1. That is precisely the loss the
  file was meant to prevent, and it happened on mission one.
- **This record was written at close, not during.** It is therefore a reconstruction — tidier than
  what occurred, which is the failure `SURPRISES.md` warns about. `SURPRISES.md` itself was created
  on the final day; entries 001–004 are same-day, but nothing from 2026-08-17 to 08-22 was captured
  as it happened.
- **The adversarial security review (merge-queue condition 3) did not run.** It binds an *agent's*
  first backend module. Slice 0 had no agent, so it was not triggered — but Module 2 is auth, and
  it shipped a cross-user session bug found by a browser test rather than by review.

## Did anything ship that looked finished but was not?

**Yes — twice, and both were caught before merge.**

1. The auth module passed lint, typecheck, 37/37 API E2E, and read cleanly, while carrying the
   cross-user session bug above. It looked finished at every layer except the browser gate.
2. `.team-5/status/merge-queue.md` still read `0a — built, awaiting review` after Slice 0 shipped,
   with `L2` marked `BLOCKED [needs Supabase]`. The queue's own rule is "no slice agent is
   dispatched until row 0a reads `merged`" — so the gate that governs dispatch was reporting unmet
   while met. Corrected 2026-08-23.

## Verdict

Slice 0 shipped and the gates worked. The two-gate rule justified itself on its first outing by
catching a class of bug that no other check in this project would have found.

Nothing was learned about the agent system, because none of it ran. Every claim in `agents/`,
`.team-5/`, and the roster documents remains an untested hypothesis. **Slice 1 is still mission one
for everything this apparatus was built to measure.**

## Feeding back into the docs

| Change | Where | Status |
|---|---|---|
| Gate's fourth clause moved to slice 1 with 8G | `00-developer-guide.md` §7 | done 2026-08-18 |
| `0a`/`0b` marked merged; `L2` done; 8G blocked on Module 3, not Auth | `.team-5/status/merge-queue.md` | done 2026-08-23 |
| Vertical cut kept; Foundations named as a role | all 7 `agents/*/identity.md`, decision log 8–9 | done 2026-08-23 |
| Dispatch hold opened pending AVEL's roster answer | `.team-5/status/merge-queue.md` | done 2026-08-23 |
| Four citation/reference fixes | `00-developer-guide.md`, `08-prompts.md`, 4 source files | done 2026-08-23 |
