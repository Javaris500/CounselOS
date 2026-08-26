---
reviewer: axe-core/playwright 4.13.0
slice: slice-1
target_agent: fantem, transactions
branch: main + uncommitted polish work in the tree
reviewed: 2026-08-25
findings_count: 7
severity: [blocker, blocker, blocker, blocker, note, note, note]
categories: [compliance, compliance, compliance, compliance, contract-drift, other, other]
gate: pass
applied: 1, 2, 3, 4 — re-run green (18/18, 0 WCAG violations, 518 rule-checks passed)
---

## Scope and standing

Generic WCAG 2.1 A/AA rule sweep of nine slice-1 surfaces **in both colour schemes** — 18 sweeps.

**First pass: 6 violations. Findings 1–4 fixed. Re-run: 18/18, zero WCAG violations, 518 rule-checks
passed.** Findings 5–7 are reported, not fixed — each needs a decision that is not mine to make. Run by `apps/web/e2e/slice-1-axe.spec.ts`; the machine-readable
report lands in `apps/web/test-results/axe/` (gitignored).

**What it ran against.** The working tree, which at audit time carried a large uncommitted UI-polish
change on top of `main` (AppRail, TopBar, Breadcrumbs, Tooltip, `globals.css`). Every defect below was
checked against `git show HEAD` and **all four are present on `main` itself** — none is an artifact of
the uncommitted work. Re-run after that work lands: it touches `globals.css` and the primitives, so it
can move these numbers in either direction.

This is a **post-merge audit**, not a pre-merge review. `gate: blocked` is a statement about
the accessibility conformance claim — `ui-ux-design-checklist.md` binds us to AA and says "AA is a floor,
not a preference", and today `main` does not clear it. It is **not** a claim that slice 2 cannot start.

It complements `slice-1-a11y.spec.ts` rather than replacing it. Nemi's suite is hand-written against
this slice's known risks — the status ladder surviving grayscale, the outcome dialog refusing Escape,
a refusal banner readable under forced-colors — and no rule engine would think to check any of them.
Axe covers the ~100 rules nobody thought to check. **Every finding below is in the second category:
none of them are things Nemi got wrong, and the existing suite passes unchanged.**

Every violation found is `color-contrast`. Every other rule passes on every surface in both themes.

---

## Findings

**1. Dark `--text-tertiary` fails AA on four of seven surfaces — BLOCKER (compliance)**

`apps/web/src/app/globals.css:292` declares `--text-tertiary: #7b8288; /* 4.6:1 AA */`.
That annotation is true against `--surface-base`/`--surface-inset` and false everywhere else:

| surface | value | ratio | |
|---|---|---|---|
| `--surface-shell` | `#0b0c0e` | 5.02:1 | AA |
| `--surface-base` | `#16181b` | 4.57:1 | AA |
| `--surface-inset` | `#16181b` | 4.57:1 | AA |
| `--surface-sunken` | `#1b1e22` | 4.29:1 | **fails** |
| `--surface-card` | `#1e2126` | **4.14:1** | **fails** |
| `--surface-raised` | `#272b31` | 3.65:1 | **fails** |
| `--surface-overlay` | `#2e333a` | 3.27:1 | **fails** |

`--surface-card` is where cards, dialogs and the detail shell all render, so this is not a corner case.
Axe measured 4.14:1 in the browser on five surfaces and twelve nodes: `Breadcrumbs.link`,
`TransactionShell.number`, `TransactionCard.number`, `PipelineBoard.subheading`, `Form.hint`, and the
`<dt>` labels in the matter detail list.

**This exact bug was already found and fixed — in light only.** On `main`, the light token reads
`--text-tertiary: #6e7479; /* 4.9:1 on card · 4.1:1 on paper — UI/large only */`; the uncommitted
polish work replaces it with
`--text-tertiary: #5f6569; /* 5.1:1 paper · 5.6:1 card · 4.6:1 inset — AA everywhere */`. Someone
noticed a tertiary that cleared AA on one surface and not another, enumerated all three, and picked a
value that quantifies over them. The dark block sat six lines further down and did not get the same
read — it still carries one unqualified number describing its second-best pairing.

That is the shape of the finding: not that nobody was paying attention to contrast, but that the
attention stopped at the light palette.

**Fix:** raise dark `--text-tertiary` until it clears 4.5:1 on `--surface-overlay`, the worst case.
`#949ba1` is the minimum lift that does it on the existing hue (4.52:1 overlay · 5.06 raised ·
5.74 card · 6.95 shell). Note the trade-off before taking that number as given: it narrows the gap to
`--text-secondary` (`#a2a9af`), so the dark ramp compresses. Whether to lighten tertiary, darken the
upper surfaces, or re-space the whole dark ramp is Fantem's call — this finding fixes the ratio, not
the ramp. **Whatever value lands, re-annotate it per-surface the way the light token is**, or the next
reader inherits the same false claim.

**The value is declared TWICE and both must change.** `globals.css:292` is inside
`@media (prefers-color-scheme: dark)`; `globals.css:355` repeats it inside `:root[data-theme='dark']`,
the block that exists so a future in-app toggle wins over the OS setting. Fixing only the media query
leaves anyone who picks dark explicitly on the failing value — and that is the harder bug to find,
because the OS-dark path would by then look correct.

---

**2. The empty-state copy is painted in a token whose own comment forbids it — BLOCKER (compliance)**

`apps/web/src/components/features/transactions/PipelineBoard.module.css:80` sets
`.columnEmpty { color: var(--text-disabled); }` for the "Nothing here" text in an empty pipeline column.

Measured: **2.67:1 in light**, **2.04:1 in dark**. AA requires 4.5:1 for 11px text. This is the only
violation that fails in *both* themes, and the only one that light-only testing would have caught.

`--text-disabled` is documented at its own definition — `globals.css:90`,
`/* 2.7:1 decorative only, never information */`. "Nothing here" is the empty state: it is the
component's entire message in that condition, and `ui-ux-design-checklist.md` counts the four states
as content. The design system already got this right; the component reached past it.

**Fix:** `.columnEmpty` uses `--text-tertiary`, not `--text-disabled`. In `PipelineBoard.module.css`,
inside the transactions mount — no token change needed, and it stays correct once finding 1 lands.

**APPLIED.** The class survived the in-flight copy change (`{COLUMN_EMPTY[status]}` now replaces the
literal "Nothing here"), so the fix covers the new per-column strings too.

---

**3. The solid danger button fails AA in dark — BLOCKER (compliance)**

`Button.module.css:120` sets `.danger { background: var(--urgency-critical-fg); color:
var(--urgency-critical-on-solid); }`. In light that is `#faf3f4` on `#a62230` — 6.63:1, fine. In dark
the background token is redefined to `#e4636f`, and the label colour is not redefined at all, so it
stays near-white: **3.03:1**. Measured on "Fell Through" in the matter detail shell.

The cause is one token doing two jobs. `--urgency-critical-fg` is redefined in dark for its role as
*foreground text on a dark surface* — a light coral, correctly. `.danger` uses that same token as a
solid *background*. In light both roles want the same crimson, so the collision is invisible; in dark
they pull opposite ways.

**Fix (APPLIED):** the dark blocks now define the two tokens that describe the solid button, so the
relationship inverts with the palette — `--urgency-critical-on-solid: #26141a` (5.3:1 on the coral)
and `--urgency-critical-focus: #ee8b95`, so hover lightens, which is what hover does on a dark ground.

**This one was hidden by a bug in the audit tooling.** `compact()` kept `result.nodes.slice(0, 5)` to
hold the report size down. The dark detail shell had six failing nodes: five were finding 1, and this
was the sixth. The assertion still failed — axe groups nodes under one violation — so nothing looked
wrong, but the JSON report the findings file is written from silently under-counted. Truncation now
happens in the display helper, and `nodeCount` records the true total. **A report that drops evidence
is worse than no report, because it reads as coverage.**

---

**4. The dark focus ring on danger controls is invisible — BLOCKER (compliance)**

`--urgency-critical-focus` is also the `outline-color` for `.danger:focus-visible` and
`.danger-outline:focus-visible`. Its light value, `#75141f`, was never redefined in dark, where it
measures **1.44:1 against `--surface-card`** and 1.27:1 against `--surface-raised`. WCAG 1.4.11 wants
3:1 for non-text UI. The ring is rendered, has a real width, and cannot be seen.

**Fix (APPLIED):** covered by the same `--urgency-critical-focus: #ee8b95` change as finding 3 — 6.7:1
on card, 5.9:1 on raised.

**Neither tool would have caught this.** Axe cannot focus a control, so no rule fires. And
`slice-1-a11y.spec.ts`'s focus-visibility test asserts that an indicator EXISTS — `outlineWidth > 0`
or a box-shadow — which is exactly true here. It is a correct test of the wrong property: presence is
not visibility. Found by reading the token while fixing finding 3. **Worth adding a contrast assertion
on the focus indicator to that suite**, since it is the only place that can test it.

---

**5. Both fixed token bugs exist, unfixed, in the `--cos-*` system — NOTE (contract-drift)**

`globals.css:18` imports `./tokens.css`, a parallel `--cos-*` token system described there as additive,
with a planned migration: *"repoint the ~140 unprefixed tokens at their --cos-* equivalents and delete
them. 84 map cleanly; 16 have no counterpart and need a decision each."*

That migration would reintroduce both blockers fixed above:

- `tokens.css:74` — `--cos-ink-d-500: #7B8288; /* 4.6:1 AA */`. The same dark value, the same
  unqualified annotation, feeding `--cos-text-muted` in both dark blocks. Finding 1 verbatim.
- `tokens.css:68` — `--cos-ink-500: #6E7479; /* 4.9:1 on card · 4.1:1 on paper */`. This is the
  **pre-fix** light tertiary; `globals.css` already moved to `#5f6569`. The cos system is behind.
- `--cos-destructive` resolves to `#E4636F` in dark and **there is no on-destructive or on-solid token
  at all** — only `--cos-text-on-slate`. A solid destructive button in the cos system has no defined
  label colour, which is finding 3 with the token missing rather than merely wrong.

**Not fixed here.** `tokens.css` is a separate planned effort in Fantem's mount, and editing it
unilaterally forks the migration. **Fix:** carry these three across before the repoint, and treat them
as three of the "16 that need a decision each." Re-run `slice-1-axe.spec.ts` after the migration — it
is now the thing that would catch a silent regression.

---

**6. `EmptyState` gives a page no heading at all — NOTE (other)**

`apps/web/src/components/ui/EmptyState.tsx:103` renders the title as `<p className={styles.title}>`.
On `/home`, where the page *is* an `EmptyState` with `layout="page"`, the result is a document with no
heading element anywhere — axe's `page-has-heading-one`, in both themes.

`best-practice`, not WCAG, so it is not gating and is reported rather than asserted. It still matters
here: heading navigation is a primary screen-reader mechanism, and there is nothing to navigate to.

**Fix:** when `layout="page"`, render the title as `<h1>`. Inline layouts keep the `<p>`, since an
`EmptyState` inside a card should not inject a heading into the page outline. Fantem's mount.

---

**7. Two contrast checks axe declined to decide — NOTE (other)**

Recorded as `incomplete`, not violations: axe could not resolve a background because the element
partially overlaps another. Not failures; not cleared either.

`StatusControl.outcomeIntro` — the "This is the only moment this can be captured" paragraph — in both
themes. (The first pass also had two undecidable nodes on the dark pipeline board; those resolved once
finding 1 landed.)

**Fix:** check these by hand, or add them to `slice-1-a11y.spec.ts`'s targeted contrast samples, whose
walk-up-for-the-first-opaque-background helper resolves exactly the case axe gives up on.

---

## Coverage notes

**Both themes are swept, and that decision found five of the six violations.** `globals.css:276`
defines the dark palette under `@media (prefers-color-scheme: dark)`, so every attorney whose OS is set
to dark is already on it — no toggle involved. Playwright's default context is `colorScheme: 'light'`;
a single-theme pass would have reported one violation and looked complete.

**What this audit does not cover:** forced-colors (asserted in `slice-1-a11y.spec.ts` instead), viewports
other than Desktop Chrome's default, keyboard traversal and focus order (Nemi's, and better done there),
and screen-reader announcement, which no automated tool measures. Axe catches roughly a third of WCAG
issues by rule count; a clean sweep is a floor, not a certificate.

**One pre-existing suite failure, not caused by this work.** `slice-1-states.spec.ts:179` asserts the
pipeline empty column contains `"Nothing here"`. The in-flight polish work replaced that literal with
per-column copy (`{COLUMN_EMPTY[status]}` → *"No matters closed in this view."*) and did not update the
assertion. Left alone deliberately: it belongs to whoever is mid-flight on that change, and the two
files this audit touched there alter a `color:` and add a comment — neither can change `textContent`.

**A note on this template:** `categories:` has no accessibility value, so findings 1 and 2 are filed as
`compliance` and 3 and 4 as `other`. If a11y findings become routine, `_TEMPLATE-findings.md` should
grow an `accessibility` category rather than have each audit pick a near-miss.
