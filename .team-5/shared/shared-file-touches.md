# Shared-File Touch Log

**Written by:** the agent, in the **same commit** as the change.
**Why:** five agents append to `queryKeys.ts` and `mutations.ts` in parallel. This log makes
duplicates and pattern drift visible in one file instead of five branches at merge time.

## The rule

Append only, following the existing pattern. **Never modify an existing entry. Never change the
pattern itself.** If you believe the pattern is wrong, that's a finding — not an edit.

## Log

| date | agent | slice | file | entry added | invalidates |
|---|---|---|---|---|---|
| 2026-08-19 | drafts | draft-review | `queryKeys.ts` | `draft(id, draftId)` | — |
| 2026-08-19 | drafts | draft-review | `mutations.ts` | `approveDraft` | `draft`, `drafts`, `activity` |
| 2026-08-23 | transactions | 1 | `apps/api/src/app.module.ts` | `TransactionsModule` in `imports` (2 lines, after `HealthModule`) | — |
| 2026-08-23 | transactions | 1 | `apps/web/src/components/ui/index.ts` | `Card`, `Tabs`, `Select` exports (3 lines, appended) | — |
| 2026-08-23 | transactions | 1 | `components/features/transactions/TransactionShell.tsx` — **the tab contract** | `TABS` (10 rows) + `LANDED` set. Five slices mount here. ADD a row and give it an `href`; never reorder, rename or reshape. Mount recipe is in the file header. | — |

*(example rows — replace with real entries)*

## What the integrator checks this log for

- **Duplicate keys** — two agents adding the same route under different names
- **Pattern drift** — an entry not matching `keys.x = (id) => '/v1/…'`
- **Missing invalidation** — a mutation added without its invalidation set declared on the mutation
  (per `06-frontend-architecture.md` Part 3, invalidation is declared on the mutation, never at the call site)
- **Invalidation gaps** — any transaction mutation that doesn't invalidate `activity(id)`
