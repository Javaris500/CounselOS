# Merge Queue

**Maintained by:** the operator, as slices integrate.
**The rule: one branch integrates at a time.** Five isolated worktrees are pointless if they land
together and their conflicts interleave.

## The foundation gate

**No slice agent is dispatched until row 0a reads `merged`.**

Slice 0 is a prerequisite, not a slice. Every parallel slice depends on the same primitives, the
same `apiFetch`, the same stores — foundation work is sequential by nature. Parallelism begins
after it lands. The operator builds it; no agent owns it, and no agent may build any part of it
(`components/ui/`, `stores/`, and `lib/api/client.ts` are outside every agent's boundary).

**It is split in two, because the halves have different blockers.** The five slice agents build
against MSW mocks — they need the frontend foundation and never needed auth. Gating them on a
Supabase project they don't use would idle five agents for no benefit.

- **0a — frontend foundation.** No backend dependency. **This is what gates agent dispatch.**
- **0b — backend + auth.** Blocked on the Supabase project. **This is what gates the Slice 0
  Playwright gate** in `00-developer-guide.md` §7 (login → dashboard, silent refresh, deactivated
  user, explaining 403). Splitting the queue does not weaken that gate; it still has to pass.

**Nemi is exempt from the dispatch gate.** It binds *slice* agents. She owns no slice and writes
no product code, so there is no half-built foundation for her to build against — and her first
deliverable (`playwright.config.ts`, `apps/web/e2e/`) is what 0b's gate is *run with*. Gating her
on the thing she is needed to prove is circular. She starts when there is something to test.

**0a deliverable:**

```
DONE  globals.css              Design System v5 tokens, 129 of them
DONE  components/ui/           all 12 registry primitives, every row now `exists`
DONE  lib/api/client.ts        apiFetch — single-flight refresh, USER_INACTIVE routing
DONE  lib/api/queryKeys.ts     the key module (seeded; agents append)
DONE  lib/api/mutations.ts     the mutation module (seeded; agents append)
DONE  stores/                  auth.store.ts, realtime.store.ts
DONE  mocks/                   MSW handlers — shared, never per-slice (06 Part 14)
DONE  app/(attorney)|(client)  layouts, route groups, /auth/deactivated
```

**0b deliverable:**

```
DONE     L1 1C   Redis wiring — cache + subscriber connections
DONE     L1 1D   error envelope: exception filter, error classes, Zod pipe,
                 correlation + response + logging interceptors. E2E gate green.
DONE     8L      GET /v1/health/services, not_configured first-class
DONE             seed.ts + the Austin fixtures; db:seed and db:reset work again
DONE     L2      Auth — JWT guard, Redis hydration, roles
                 ES256/JWKS verification, login proxy, httpOnly rotating
                 refresh cookie. Supabase provisioned in us-east-1.
BLOCKED  8G      matter-level access guard                     [needs Module 3]
```

**0b is no longer blocked.** Supabase is provisioned, Module 2 shipped, and the Slice 0 gate runs
green: 6/6 Playwright, 37/37 API E2E, 41/41 integration, 19/19 unit. The gate's fourth clause —
a paralegal denied an unassigned matter — moved to slice 1 with 8G, which resolves against
`transactions.assigned_attorney_id` and so cannot exist before Module 3 (`00-developer-guide.md`
§7, noted 2026-08-18).

The gate earned its keep on the way through: it caught a cross-user session bug in the Supabase
client that no unit test asserts against and no bug report would have described. `SURPRISES.md` 001.

## Dispatch order — decided 2026-08-18

Agents are **full-stack** (Option C): each owns its NestJS module and its UI, built together and
gated together. Four conditions came with that decision:

1. **Stagger.** One agent runs dispatch-to-completion before any other starts. This is the first
   time an agent writes backend code, and nobody yet knows what they get wrong with it — one
   complete cycle tells us what to fix across the other agent files before six branches accumulate
   the same mistake.
2. **Transactions goes first**, not Documents. Documents is Module 4 and depends on Module 3, so it
   cannot be first. Transactions is also the better teacher: no queue, no storage, no external APIs,
   so a failure is a *process* failure rather than pipeline complexity. And it carries 8G, the
   product's primary access-control surface — exactly what condition 3 exists for.
3. **Every agent's FIRST backend module takes an adversarial security review before merge** — the
   access-control section of `/review`, run in a fresh session. Structural violations already crash
   the bootstrap or fail ESLint; this buys the category tooling cannot reach: a missing
   `notDeleted`, a guard on five of six routes, a role check where the rule is assignment.
   Subsequent modules from a cleared agent go through normal review.
4. **Playwright must run before the first full-stack dispatch.** Under Option C every slice is gated
   by a browser test, so a gate that cannot run turns "two gates" into one gate and an IOU — the
   provisional-done problem we rejected Option B for.

| order | agent | slice | module | blocked by |
|---|---|---|---|---|
| 1 | transactions | 1 | Module 3 + 8G | — cleared 2026-08-23 |
| 2 | documents | 2 | Module 4 | Module 3 |
| 3 | drafts · case-ops | 6 · 4/7 | Module 7 · 8A–8D | Module 3 |
| 4 | chat · deadlines | 5 · 3 | Module 5 · Module 6 + M1 | Module 4 |

## Dispatch hold — roster decomposition · OPENED 2026-08-23 · **CLOSED 2026-08-23**

**Resolved: the vertical cut stands.** AVEL's rewritten roster doc adopts the shape-plus-instantiation
model — the principle is fixed, the cut is derived from the client's directory structure, and a
feature-organised framework gets the vertical cut. `agents/` is correct as it stands. Territory names
are the convention for feature agents; a personal name marks a horizontal role that builds nothing.
Foundations is assigned to the operator (decision-log row 9). **Dispatch is unblocked.**

The original statement of the problem is kept below, because the reasoning is the record.

`agents/` and `ROSTER-V2.md` — an AVEL doc, in the AVEL repo, deliberately not carried here —
describe two different decompositions, not two vocabularies
for one. AVEL cuts by **layer** — Leonora owns schema, Kel owns services, Dunn owns routes, Gat
owns auth, Ghost owns state, Leon owns components. This repo cuts by **feature**: one agent owns
one slice through every layer, which is Option C above. A single agent here spans all six AVEL
lanes, which is why five of our seven folders have no AVEL name to inherit and are named for their
slice instead. Nemi is the only one with a roster name because she is horizontal in both systems —
she owns no territory in either, which is the whole point of her.

**Why this blocks rather than proceeds in parallel.** If AVEL resolves toward the horizontal
roster, the `transactions` agent dissolves into six and Option C reverses along with its four
conditions. The dispatch↔completion pair is the unit of measurement this apparatus exists to
collect; producing one against a roster that is about to change measures a system that will not
exist. Condition 1's stated purpose — finding out what an agent gets wrong when it writes backend
code for the first time — is only answerable once we know which agent that is.

Handed to AVEL 2026-08-23 with the tree, the comparison, and the two resolutions stated. Slice 1
is specced and parked, not cancelled.

## Queue

| order | slice | agent | branch | status | playwright gate | merged |
|---|---|---|---|---|---|---|
| 0a | foundation: frontend | operator | — | merged | — | 2026-08-23 |
| 0b | foundation: backend + auth | operator | — | merged | pass (6/6) | 2026-08-23 |
| 1 | transactions | transactions | feat/transactions-slice-1 | queued | — | — |

**Status:** `queued` → `integrating` → `gate-running` → `merged` | `blocked`

## Procedure

1. One slice moves to `integrating`. **Nothing else moves.**
2. Run **that slice's** Playwright gate. Red → `blocked`, back to the agent, the next slice does
   not start. A gate that doesn't block isn't a gate.
3. Green → merge, mark `merged`, promote the next.
4. After the full set is in, run `/review` and `/gap-check` on the integration branch, looking for:
   - duplicate `queryKeys.ts` entries → cross-check `shared/shared-file-touches.md`
   - competing patterns for one element (two button primitives, two form patterns, two modals)
   - any agent that touched a shared file outside its `file_boundary`
   - contract drift not yet logged in `shared/contract-drift.md`

## Example

Illustration only — never copy these rows into the queue above.

| order | slice | agent | branch | status | playwright gate | merged |
|---|---|---|---|---|---|---|
| 1 | draft-review | drafts | feat/drafts-review | merged | pass | 2026-01-15 |
| 2 | document-upload | documents | feat/documents | integrating | running | — |
| 3 | deadline-dashboard | deadlines | feat/deadlines | queued | — | — |
