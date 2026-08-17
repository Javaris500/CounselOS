# Merge Queue

**Maintained by:** the operator, as slices integrate.
**The rule: one branch integrates at a time.** Five isolated worktrees are pointless if they land
together and their conflicts interleave.

## The foundation gate

**No agent is dispatched until row 0 reads `merged`.**

Slice 0 is a prerequisite, not a slice. Every parallel slice depends on the same primitives,
the same `apiFetch`, the same stores — foundation work is sequential by nature. Parallelism
begins after it lands. The operator builds it; no agent owns it, and no agent may build any part
of it (`components/ui/`, `stores/`, and `lib/api/client.ts` are outside every agent's boundary).

**Slice 0 deliverable:**

```
apps/web/src/components/ui/        all 12 registry primitives → flip each to `exists`
apps/web/src/lib/api/client.ts     apiFetch — owns the auth lifecycle
apps/web/src/lib/api/queryKeys.ts  the key module (seeded; agents append)
apps/web/src/lib/api/mutations.ts  the mutation module (seeded; agents append)
apps/web/src/stores/               auth.store.ts, realtime.store.ts
apps/web/src/mocks/                MSW handlers — shared, never per-slice (06 Part 14)
```

## Queue

| order | slice | agent | branch | status | playwright gate | merged |
|---|---|---|---|---|---|---|
| 0 | foundation (prerequisite) | operator | — | (must be merged) | — | — |

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
