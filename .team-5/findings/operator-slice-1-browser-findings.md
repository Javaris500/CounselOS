---
# WRITTEN BY: the operator, driving the running app before merge.
# FILENAME:   operator-slice-1-browser-findings.md

reviewer:                 operator
slice:                    1
target_agent:             transactions
branch:                   feat/transactions-slice-1
reviewed:                 2026-08-23
findings_count:           2
severity:                 [blocker, warn]
categories:               [missing-state, contract-drift, unhandled-error-code]
gate:                     blocked
---

## Findings

### 1. The pipeline board renders nothing. It throws. — `blocker`

**What.** `/transactions` is the slice's primary screen. With a valid session and four seeded
matters in the database, it renders zero cards and throws
`TypeError: Cannot read properties of undefined (reading 'total')`.

**Where.** Two files, compounding:

- `apps/web/src/lib/api/client.ts` — `apiFetch` ends `return body.data as T`. It **discards
  `meta`**. Every paginated response arrives as a bare array, never as `{ data, meta }`.
- `apps/web/src/components/features/transactions/useTransactions.ts:41` —
  `total: data?.meta.total ?? 0`. The optional chain guards `data` and **not** `meta`. `data` is
  the array, `meta` is `undefined`, and the read throws before `?? 0` can apply.

**Why nothing caught it.** This is the important part.

- `pnpm typecheck` passes. `useSWR<Paginated<Transaction>>` *asserts* the shape, and `as T` in
  `apiFetch` is an unchecked cast — so the compiler is told `meta` exists and has no way to learn
  otherwise. Two casts pointed at each other typecheck perfectly.
- The API E2E gate passes 79/79. The API is correct: `GET /v1/transactions` returns
  `{ success, data, meta }` with `meta.total = 4`, verified by curl against the running server.
  The bug is entirely on the browser side of `apiFetch`.
- `pnpm lint` passes. No rule sees it.
- The completion report states `four_states_covered: true`. The **success** state is the one that
  does not render.

**This is the two-gate rule earning its keep.** Every gate that exists is green and the slice's main
screen is blank. Only a browser gate — which has never been run, because Nemi was dispatched an
hour ago — catches this class. `01-codebase.md` says a slice ships when both gates pass; slice 1 is
the first concrete demonstration of why one gate is not a rounding error off two.

**Whose.** Shared, and the split matters:
- `apiFetch` dropping `meta` is **foundation** (slice 0, operator). The contract in
  `04-data-contracts.md` is `{ data, meta }`; the client silently returns half of it.
- Typing the hook `Paginated<T>` without verifying what `apiFetch` returns is the **agent's** —
  and it is precisely the "never invent a shape the contract doesn't define" rule, inverted: the
  contract did define it, and the client didn't honour it.
- The missing second `?.` is the agent's, and is the smaller half. With
  `data?.meta?.total ?? 0` the board would have rendered with a wrong count of 0 instead of
  crashing — quieter, and arguably worse.

**Fix, in order.** Decide where `meta` lives *first*, because both halves depend on it. Either
`apiFetch` returns the envelope for paginated routes, or a separate `apiFetchPaginated` does, or
`meta` moves into `data`. That is a foundation decision and it affects every future list surface —
documents, deadlines, activity — not just this one. Then the hook follows.

### 2. An illegal transition to a terminal state reports the wrong reason first — `warn`

**What.** `PATCH /v1/transactions/:id/status` with an illegal transition to `CLOSED` returns
`VALIDATION_ERROR` — *"Record why this matter ended."* The user supplies an `outcomeReason`,
resubmits, and only then receives `INVALID_STATUS_TRANSITION`: the move was never legal.

**Where.** The `outcomeReason` requirement is enforced at the Zod pipe; the transition map is
enforced in the service. The pipe runs first, so a request that is wrong in both ways reports the
one that cannot be fixed.

**Verified against the running server:**

```
TITLE_REVIEW → INTAKE                    INVALID_STATUS_TRANSITION   correct, with allowedTransitions
TITLE_REVIEW → CLOSED   (no reason)      VALIDATION_ERROR            "Record why this matter ended"
TITLE_REVIEW → CLOSED   (with reason)    INVALID_STATUS_TRANSITION   the real problem, one round trip late
```

**Why it matters.** The agent's own identity file: *"NEVER show a rejected transition as a bare
failure… 'Could not update' teaches the attorney nothing and generates a support ticket."* This
message is not bare — it is **actionable and futile**, which is worse. It instructs the user to do
something that cannot succeed.

**Realistic path.** A detail page held open while someone else moves the matter. The rendered
`allowedTransitions` go stale, the attorney clicks a control that was valid when the page loaded,
and is asked to justify a closure that will be refused either way.

**Not a blocker.** No data is at risk and the transition is correctly refused. The layering is also
defensible — validation before business rules is the documented order. The fix is either to check
the transition before the terminal-outcome requirement, or to have the pipe's message acknowledge
it may not be the only problem.

## Verdict

`blocked` on finding 1. The API is sound, the tests are honest about what they cover, and the
primary screen does not work. Nothing merges until the board renders.

Found by starting the dev stack and driving it — not by reading the diff, which had already been
read closely and looked correct.
