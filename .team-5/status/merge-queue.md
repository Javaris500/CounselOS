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
apps/web/src/app/globals.css       Design System v5 tokens          ✅ done
apps/web/src/components/ui/        all 12 registry primitives → flip each to `exists`
apps/web/src/lib/api/client.ts     apiFetch — owns the auth lifecycle
apps/web/src/lib/api/queryKeys.ts  the key module (seeded; agents append)
apps/web/src/lib/api/mutations.ts  the mutation module (seeded; agents append)
apps/web/src/stores/               auth.store.ts, realtime.store.ts
apps/web/src/mocks/                MSW handlers — shared, never per-slice (06 Part 14)
apps/web/src/app/(attorney)|(client)  layouts + route groups
```

**0b deliverable:**

```
L1 1C   Redis wiring (ioredis is not yet an api dependency)
L1 1D   error envelope: exception filter, error classes, Zod pipe,
        correlation + response + logging interceptors
L2      Auth — JWT guard, Redis hydration, roles          [needs Supabase]
8G      matter-level access guard
8L      GET /v1/health/services
        seed.ts + the five Austin fixtures (db:seed and db:reset are
        currently broken — they point at a file that does not exist)
```

## Queue

| order | slice | agent | branch | status | playwright gate | merged |
|---|---|---|---|---|---|---|
| 0a | foundation: frontend | operator | — | (gates agent dispatch) | — | — |
| 0b | foundation: backend + auth | operator | — | (gates the Slice 0 gate) | — | — |

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
