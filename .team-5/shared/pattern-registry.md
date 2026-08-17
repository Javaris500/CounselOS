# Pattern Registry

**The upstream fix for divergence.** Five slice agents building in parallel will each invent a
modal, a loading pattern, a form approach — all individually reasonable, collectively incoherent.
Merge review catches that *after* five branches exist. This catches it before one does.

**Owned by:** Nemi (audits it). **Written to by:** any agent registering a new primitive.

## The rule — in every agent file, verbatim

> Before building any recurring UI element, check this registry. **If it's listed, use it — you
> may not build your own.** If it's not listed, you may build it, and you MUST register it here
> in the same commit.

Thirty seconds of lookup prevents the dominant failure mode of a slice team.

## Canonical primitives

**`status` is load-bearing. You may only use a primitive marked `exists`.**

`planned` means Slice 0 has not built it yet. If you need a `planned` primitive, the foundation
gate has not passed — stop and report. Do not build it yourself and do not work around it; five
agents each filling the same gap is precisely the divergence this file exists to prevent. The
operator flips rows to `exists` as Slice 0 lands.

| Element | Canonical implementation | Status | Notes |
|---|---|---|---|
| Modal / dialog | `components/ui/Dialog` | planned | one overlay implementation, ever |
| Button | `components/ui/Button` | planned | variants live here, not per-slice |
| Form | `react-hook-form` + `zodResolver`, schema from `packages/shared` | planned | never a hand-rolled form |
| Loading skeleton | `components/ui/Skeleton` | planned | content-shaped, never a bare spinner |
| Empty state | `components/ui/EmptyState` | planned | brand voice — no "You don't have any cases yet!" |
| Error state | `components/ui/ErrorState` | planned | mapped by `error.code`, never `message` |
| Toast | `components/ui/Toast` | planned | mutation failure + rollback |
| Data table | `components/ui/Table` | planned | compact density on attorney surfaces |
| Drawer | `components/ui/Drawer` | planned | quick-add and side panels |
| Badge / status pill | `components/ui/Badge` | planned | urgency ladder — never hue alone |
| AI marker | `components/ui/AiMarker` | planned | AI-teal; wraps ALL AI-generated content |
| Inline spinner | `components/ui/Spinner` | planned | in-place actions only, never page-level |

## Registering a new primitive

Append a row. State what it is, where it lives, and one line on when to use it. If your element
is a near-duplicate of something above, **it is not new** — use the existing one or file a
finding arguing the pattern should change.

A primitive you build and register starts at `exists` — you built it, so it does.

| date | agent | element | implementation | why it wasn't covered |
|---|---|---|---|---|

## What Nemi audits for

- Two implementations of the same element across slices
- A slice-local component that should have been a registry entry
- A registry entry added without the same-commit rule being followed
- Drift from a canonical primitive (a Dialog wrapper that reimplements half of Dialog)
- **A `planned` primitive used or reimplemented anyway** — that means an agent worked around the
  foundation gate instead of stopping, which is the failure this column was added to catch
