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

> **All 12 landed in Slice 0a** (2026-08-17) at `apps/web/src/components/ui/`, built on the
> Design System v5 tokens in `globals.css`. Import them from `@/components/ui`.

`planned` means Slice 0 has not built it yet. If you need a `planned` primitive, the foundation
gate has not passed — stop and report. Do not build it yourself and do not work around it; five
agents each filling the same gap is precisely the divergence this file exists to prevent. The
operator flips rows to `exists` as Slice 0 lands.

| Element | Canonical implementation | Status | Notes |
|---|---|---|---|
| Modal / dialog | `components/ui/Dialog` | exists | one overlay implementation, ever |
| Button | `components/ui/Button` | exists | variants live here, not per-slice |
| Form | `react-hook-form` + `zodResolver`, schema from `packages/shared` | exists | never a hand-rolled form |
| Loading skeleton | `components/ui/Skeleton` | exists | content-shaped, never a bare spinner |
| Empty state | `components/ui/EmptyState` | exists | brand voice — no "You don't have any cases yet!" |
| Error state | `components/ui/ErrorState` | exists | mapped by `error.code`, never `message` |
| Toast | `components/ui/Toast` | exists | mutation failure + rollback |
| Data table | `components/ui/Table` | exists | compact density on attorney surfaces |
| Drawer | `components/ui/Drawer` | exists | quick-add and side panels |
| Badge / status pill | `components/ui/Badge` | exists | urgency ladder — never hue alone |
| AI marker | `components/ui/AiMarker` | exists | AI-teal; wraps ALL AI-generated content |
| Inline spinner | `components/ui/Spinner` | exists | in-place actions only, never page-level |
| Card / panel | `components/ui/Card` | exists | bordered surface; `accent` left rule pairs with a Badge, never colour alone |
| Tab navigation | `components/ui/Tabs` | exists | Links not buttons, so tabs deep-link; a tab with no `href` renders DISABLED, never hidden |
| Dropdown / select | `components/ui/Select` | exists | native `<select>`; a combobox is a separate entry with its own argument, not a widened Select |
| Tooltip | `components/ui/Tooltip` | exists | CSS-only, collapsed-rail labels ONLY. Suppressed above 1000px, where the label is visible and a bubble repeating it is noise. Never the accessible name — the real label stays clipped in the DOM. Clips inside `overflow: hidden`, so it is the wrong tool inside the panel |
| Breadcrumb trail | `components/ui/Breadcrumbs` | exists | last crumb is text with `aria-current`, never a link; the trail truncates from the LEFT so the record you are looking at survives |

## Registering a new primitive

Append a row. State what it is, where it lives, and one line on when to use it. If your element
is a near-duplicate of something above, **it is not new** — use the existing one or file a
finding arguing the pattern should change.

A primitive you build and register starts at `exists` — you built it, so it does.

| date | agent | element | implementation | why it wasn't covered |
|---|---|---|---|---|
| 2026-08-23 | transactions | Card / panel | `components/ui/Card` | Slice 0a shipped 12 primitives and no surface. Every slice was about to invent one — a pipeline card, a party card, a deadline card — and four near-identical bordered divs is exactly the divergence this file exists to catch. |
| 2026-08-23 | transactions | Tab navigation | `components/ui/Tabs` | The transaction detail shell is the frame five slices mount into; without a canonical strip each arriving slice would style its own. Disabled-not-hidden is the contract: a tab whose slice has not landed still shows. |
| 2026-08-23 | transactions | Dropdown / select | `components/ui/Select` | The status control and the outcome prompt both need one, and the status control is where a wrong value is a wrong LEGAL state — native `<select>` gets keyboard, typeahead and mobile from the platform. |
| 2026-08-25 | operator | Tooltip | `components/ui/Tooltip` | The rail collapses to icons below 1000px, and an icon-only nav nobody can read is a nav only its author can use. Deliberately narrow: it is not a general tooltip, it does not own the accessible name, and it clips inside the panel — all three stated in the file so the next consumer hits the note instead of the bug. |
| 2026-08-25 | operator | Breadcrumb trail | `components/ui/Breadcrumbs` | This product drills matter → document → deadline → draft, and every level is a dead end without a way up that is not the browser button. The matter is the spine; the trail is how you climb it. |

## Amendments — 2026-08-25, operator

Append-only. No row above was rewritten.

**`Card` (2026-08-23) — the `href` gap is now closed by precedent, not by the primitive.**
Nemi's slice-1 audit found `Card` registered with zero consumers and two hand-rolled duplicates,
because a pipeline card must be an `<a>` and `Card` has no `href` form. The data table designed on
2026-08-25 hit the identical constraint and resolved it the same way — the whole row is a link, for
the same reason `Tabs` are links: middle-click and open-in-new-tab are how people work a caseload.
That is now three elements wanting one thing. **`Card` should gain an `href` variant**, and the
decision is still Foundations'.

**`Tooltip` gained `enabled`, and the reason generalises.** It decided its own visibility with a
`@media (min-width: 1001px)` block — meaning `Tooltip.module.css` and `AppRail.module.css` had to
agree on a breakpoint by coincidence, with nothing linking the two numbers. A user-driven collapse
broke it on contact: the rail collapsed at any width while the bubble stayed hidden above 1000px,
producing an icon-only nav nobody could read. **A primitive must not infer a state its caller owns.**

**`Button` gained `size`, `iconLeft`/`iconRight`, `fullWidth` and `danger-outline`.** Not a new
row — the same primitive, widened. Two things worth knowing: `danger` had **no `:hover` at all**
until now, so the one control whose click cannot be taken back was the one that felt inert under
the cursor; and the split between `danger` (solid, irreversible) and `danger-outline` (destructive
but reversible) exists because legal data is soft-deleted, so dressing every delete in solid red
trains people to click through red.

## What Nemi audits for

- Two implementations of the same element across slices
- A slice-local component that should have been a registry entry
- A registry entry added without the same-commit rule being followed
- Drift from a canonical primitive (a Dialog wrapper that reimplements half of Dialog)
- **A `planned` primitive used or reimplemented anyway** — that means an agent worked around the
  foundation gate instead of stopping, which is the failure this column was added to catch

---

## Audit — slice 1, nemi, 2026-08-24

**Append-only, per this file's own rule.** No row above was edited. Full reasoning and the fixes
are in `.team-5/findings/nemi-slice-1-findings.md` (finding 3 and the audit section).

| check | result |
|---|---|
| Registered in the same commit as built | **PASS**, all three — `Card`, `Tabs`, `Select` all in `77bc39b`, alongside `ui/Card.tsx`, `ui/Tabs.tsx`, `ui/Select.tsx` and the `ui/index.ts` exports. Verified against the commit's file list, not the claim. |
| Genuinely new, not a near-duplicate | **PASS**, all three. No prior row covers a bordered surface, a tab strip or a dropdown. |
| Entry matches what shipped | **2 of 3.** `Tabs` and `Select` are accurate. `Card` is not — see below. |
| Nothing else in the slice duplicates a primitive | **PASS.** Every recurring element the slice shipped is consumed from `@/components/ui`. No second modal, skeleton, form pattern or listbox. |
| No `planned` primitive used or reimplemented | **PASS.** All fifteen rows read `exists`. |

**The one violation — `Card` has zero consumers and two live duplicates.**

`Card` is imported by `components/ui/index.ts` and by nothing else. The same commit that registered
it shipped two hand-rolled bordered surfaces on the same four tokens:
`features/transactions/TransactionCard.module.css` `.card` and
`features/transactions/TransactionOverview.module.css` `.panel`. `.panel` is `Card` with identical
padding.

There is a real constraint underneath: `TransactionCard` must be an `<a>` for keyboard activation
and open-in-new-tab, and `Card` offers only `<div>` or `<button onClick>` — it has no `href` form.
That is a gap in the primitive, not a licence to fork it.

**Decision required from Foundations, not from a slice agent** — either give `Card` an `href`
variant and rebuild both on it, or argue the row should change, which is what this file's
"Registering a new primitive" section instructs. A canonical primitive with no proven usage and two
competing precedents beside it is the exact divergence this registry exists to prevent, arriving
through the registry itself.
