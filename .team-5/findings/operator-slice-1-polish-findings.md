---
# WRITTEN BY: the operator, auditing the shipped UI against ui-ux-design-checklist.md.
# FILENAME:   operator-slice-1-polish-findings.md

reviewer:                 operator
slice:                    1
target_agent:             foundations       # 6 of 10 are Foundations-owned primitives or tokens
branch:                   main
reviewed:                 2026-08-25
findings_count:           10
severity:                 [warn, warn, warn, warn, warn, note, note, withdrawn, note, note]
categories:               [missing-state, competing-pattern, contract-drift, other]
gate:                     pass              # no blockers — none of these breaks a gate
---

## Findings

Ten, ordered by what they cost rather than by where they live. **Advisory only** — nothing here is
edited by this file, per the project's plugin rule (findings, never generative edits). Two adjacent
items were already fixed while diagnosing the scrollbar report and are recorded at the end so they
are not re-found.

---

### 1. `"Nothing here"` is the exact copy the empty-state work replaced everywhere else — WARN (missing-state)

**Where:** `apps/web/src/components/features/transactions/PipelineBoard.tsx:119`

Every empty surface in the product now says what will land there and how it gets there. The board's
per-column empty still says **"Nothing here"** — and it is the one that renders **five to seven
times simultaneously**, so it is statistically the empty copy an attorney reads most.

It also fails the voice rule in `07`: *not* "You don't have any cases yet!" but say what is true and
what to do next. "Nothing here" says neither.

**Fix:** it should not become a full `EmptyState` — a page-level state per column would drown the
board. It wants one short, specific line per column that names what belongs in that rung:
"No matters in title review." The column header already carries the count, so the line does not
need to repeat it.

---

### 2. The breadcrumb's deepest crumb is generic, and it is the one carrying the information — WARN (other)

**Where:** `apps/web/src/app/(attorney)/TopBar.tsx:41`

The trail reads **"Matters / Matter"**. The structure is right and the ancestor is a working link,
but the last crumb — the only one that identifies where you are — renders the literal word "Matter"
for every record in the system.

The cause is deliberate and documented: `TopBar` derives crumbs from the path and refuses to fetch,
because a crumb that loads separately produces "Matters / Loading…" on every navigation. That
reasoning holds. The consequence does not.

**Fix:** the page that owns the record supplies the label. A small context (`useCrumb({label})`
registered by the detail page, consumed by `TopBar`) keeps the trail in the shell while letting the
data come from the component that already has it. Do NOT add a second `<Breadcrumbs>` in the page —
two trails on one screen is worse than one generic crumb.

---

### 3. The login submit is a second button implementation — WARN (competing-pattern)

**Where:** `apps/web/src/app/auth/login/page.tsx:131`, `className={styles.submit}`

It is a hand-rolled `<button>` with its own hover, active, focus, disabled and loading states,
sitting beside a registry primitive that now does all five. It was written that way legitimately —
`Button` had no `fullWidth` and no `iconRight` at the time. Both landed 2026-08-25.

This is precisely the failure the Pattern Registry exists to catch: two implementations of one
element, each reasonable alone. The login one has already drifted — its focus ring, pressed state
and 56px height were all tuned separately.

**Fix:** `<Button variant="primary" fullWidth iconRight={<Arrow/>} loading={isSubmitting}>`. The
56px height is the one genuine difference and belongs as a local override on a page that is a page,
not as a second component.

---

### 4. `Card` still has no `href` variant, and three consumers now want one — WARN (competing-pattern)

**Where:** `components/ui/Card.tsx`; consumers in `features/transactions/`

Nemi found this in the slice-1 audit: `Card` was registered as canonical, shipped with **zero
consumers**, and two hand-rolled bordered surfaces landed in the same commit — because a pipeline
card must be an `<a>` for keyboard activation and open-in-new-tab, and `Card` offers only `<div>` or
`<button onClick>`.

Since then the count has gone from two to three. The data-table design hit the identical constraint
and resolved it the same way (whole row is a link), and `Tabs` already carries the precedent —
"Links not buttons, so tabs deep-link".

Three elements independently wanting the same thing is not a coincidence any more.

**Fix:** give `Card` an `href` form that renders an `<a>`, then rebuild `TransactionCard` and
`TransactionOverview` on it. Foundations' call, per the registry's own rule.

---

### 5. `--surface-inset` is doing two different jobs, and one of them now has its own token — WARN (contract-drift)

**Where:** 17 uses of `--surface-inset` vs 7 of `--surface-sunken` across `apps/web/src`

`--surface-sunken` (`#F4F2EE`) was added 2026-08-25 for surfaces that sit *one step down inside a
panel* — table headers, pagination strips, quiet wells. `--surface-inset` (`#E6E3DC`) is a **wash**:
two steps down, and at that value it reads as a separate band rather than the same surface recessed.

The 17 existing uses predate the new token and were all written when `inset` was the only option, so
some fraction of them are now the wrong choice — the panel-empty state and the button `:active`
fills are the likely candidates.

**Fix:** audit the 17. This is not a find-and-replace: some are genuinely washes and should stay.
The distinction to apply is *is this a recessed part of the surface, or a different surface?*

---

### 6. The matter tab strip shows ten tabs, nine of them disabled — NOTE (other)

**Where:** `features/transactions/TransactionShell.tsx:56-65`

Disabled-not-hidden is the right contract and should not change — hiding them would make the product
look smaller than it is, and it is how a returning user tells "not built" from "lost access".

But at ten items with nine greyed, the first impression of a matter is a row of things that do not
work. The contract is right; the *density* is what reads badly.

**Fix (worth discussing, not obviously correct):** once more than ~5 are unlanded, collapse the
unlanded ones behind a single trailing "+6 more" that expands. The promise is kept — everything is
still visible and still says when it lands — without the strip being mostly grey. Revisit as slices
land and the ratio inverts on its own.

---

### 7. `Skeleton` is a paragraph shape used for every surface — NOTE (missing-state)

**Where:** `components/ui/Skeleton.tsx:19`, `rows` + `lastRowWidth`

The checklist asks for **content-matched** skeletons, not generic bars. What exists is a stack of
full-width rows with a short last one — a good paragraph placeholder, and the wrong shape for the
board (columns of cards), the table (a header plus fixed-height rows), and the matter shell
(identity block plus a tab strip plus two panels).

The consequence is small but real: the layout jumps at the moment data lands, because the
placeholder never had the real shape.

**Fix:** the primitive stays; it grows a `shape` prop — `paragraph` (today's behaviour, the
default), `rows`, `cards`. Slices pick the one matching what they are about to render.

---

### 8. ~~The dark shell's tone step is too small~~ — WITHDRAWN, the finding was wrong

**Retracted 2026-08-25, same day it was filed.**

I compared dark `--surface-shell` (`#0B0C0E`) against `--surface-base` (`#16181B`). The panel does
not use `base`; `layout.module.css` sets `background: var(--surface-card)`, which in dark is
`#1E2126`. Measured against what actually renders:

| | step |
|---|---|
| light `--surface-shell` → `--surface-card` | **1.10** |
| dark `--surface-shell` → `--surface-card` | **1.21** |

The dark frame is not weaker than light's. It is **stronger**. Nothing to fix, and the "widen the
gap or write it down" recommendation would have made dark worse.

Worth keeping visible rather than deleting: the finding read as plausible because I had the right
*idea* about the design and the wrong *token*, and no amount of re-reading the prose would have
caught it — only computing the two ratios did. It is `20-review-lessons.md` M2 pointed at myself:
a confident claim is a claim to verify, including my own.

---

### 9. There is no drawer below ~700px — NOTE (other)

**Where:** `app/(attorney)/AppRail.module.css`, `@media (max-width: 1000px)`

The rail collapses to a 60px icon strip at 1000px and stays that way at every width below it. On a
phone that is 60px of a 390px viewport spent on chrome — 15% — permanently.

Left unbuilt deliberately: a hamburger that opens nothing is worse than a narrow rail that works.
But `13 §6` puts mobile in scope and slice 4's gate is the first to require a mobile viewport, so
this has a deadline.

**Fix:** below ~700px the rail becomes a drawer over the panel, opened from a control in the top
bar. Do it with slice 4, not before — it wants a real mobile surface to be tested against.

---

### 10. The service status changes silently — NOTE (missing-state)

**Where:** `app/(attorney)/AppRail.tsx`, `ServiceStatus`

The dot and its text are correct, honest, and read from the real probe. But when a dependency drops
while someone is looking at the page, the row re-renders with no announcement — a screen-reader user
gets nothing, and a sighted user notices only if they happen to look at the bottom-left corner.

This matters more here than in most products: `8L` exists so people know when the AI is unavailable
*before* they rely on it.

**Fix:** `aria-live="polite"` on the status row, and consider a one-time toast on a transition into
`down` (never on `not_configured`, which is a steady state and not news).

---

## Already fixed while diagnosing — recorded so they are not re-found

- **No scrollbar rule existed anywhere.** Every scroll container wore the OS default; on the board —
  the one surface that genuinely must scroll sideways — it was the loudest element on the page. Now
  thin and token-coloured. **Thinned, not hidden:** a kanban board whose extra columns are both
  off-screen and unmarked is a board where nobody finds the extra columns.
- **`Dialog` had no `max-height`,** so a tall modal grew past the viewport and scrolled the page
  behind the backdrop. Now capped with the body scrolling inside and the footer pinned. The fix
  broke four browser tests on first attempt, and instructively: `display: flex` on `.dialog`
  overrides the UA's `display: none` for a *closed* `<dialog>`, so the modal rendered at all times.
  `display` belongs on `.dialog[open]`.

## The pattern under six of these

Findings 3, 4, 5, 7 and the two fixed items are all the same shape: **a primitive was built for its
first consumer, and the second consumer's need was met beside it rather than inside it.** The
registry catches duplicate *components*; it does not catch a primitive that is merely too narrow,
because the workaround never looks like a new component — it looks like a local style.

Worth adding to `20-review-lessons.md` as an M3 variant if it recurs a third time.
