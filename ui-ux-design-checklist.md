# UI/UX Design Checklist
*A working reference for shell layout, page UI, and interaction design*

---

## 1. Shell / App Layout

- [ ] What's the core navigation model (sidebar, top nav, tab bar) — does it scale from 3 sections to 30?
- [ ] How does the shell adapt across breakpoints (drawer, collapse, full transform)?
- [ ] Where does global state live (notifications, search, user menu) so it doesn't clutter every page?
- [ ] Are persistent regions (nav, header) cleanly separated from swappable content?
- [ ] What's the max content width? How does it behave on ultra-wide monitors?

## 2. Page-Level UI

- [ ] What's the single most important action on this page — is it visually dominant?
- [ ] Does visual hierarchy (size, weight, contrast, spacing) match actual information priority?
- [ ] Is there a consistent spacing/type scale (4px or 8px grid), not one-off values?
- [ ] What does this page look like empty, loading, partially loaded, and errored?
- [ ] Is content density right for the context (scanning vs. deep task work)?

## 3. UX / Interaction

- [ ] Is there instant feedback (<100ms) after every click/tap/submit, even if the real result is slower?
- [ ] How does the user recover from a mistake (undo, confirm, easy back-out)?
- [ ] Are destructive actions harder to trigger than routine ones?
- [ ] Can this be used keyboard-only, with sensible focus order?
- [ ] Does the UI reward repeat use — does it get more efficient once someone isn't a first-timer?

## 4. Modern Practices

- [ ] Does this follow platform/design-system conventions instead of reinventing patterns?
- [ ] Designed in dark mode AND light mode simultaneously (not retrofitted)?
- [ ] Is motion purposeful — guiding attention or showing relationships, not decorative?
- [ ] Tested with real/realistic data (long names, empty lists, overflow text)?
- [ ] Perceived performance handled — skeletons, optimistic UI — even when load time can't improve?

---

## 5. Polish Rules

### Spacing & Alignment
- [ ] Every gap is a multiple of your base unit (4px/8px) — no arbitrary values
- [ ] Optical alignment used where math alignment looks wrong (icons often need a 1–2px nudge)
- [ ] Related items sit closer together than unrelated ones (proximity, not just borders)
- [ ] Nothing touches a container edge without intentional padding

### Typography
- [ ] Line-height scales with line length (tighter for headlines, 1.5–1.7 for body)
- [ ] No pure black (#000) on white — use dark gray
- [ ] Long text truncates with ellipsis + tooltip, never overflows silently
- [ ] Max 2 typefaces, one defined scale (e.g., 12/14/16/20/24/32)

### Color & Contrast
- [ ] Every text/background pair passes WCAG AA (4.5:1 for body text)
- [ ] Interactive elements are visually distinct from static ones
- [ ] Error/success states use color + icon/text (colorblind-safe)
- [ ] Shadows carry a hint of background hue, not pure gray

### Interactive States
- [ ] Every clickable element has hover, active, focus, AND disabled states
- [ ] Focus rings are visible and on-brand — never `outline: none` with no replacement
- [ ] Buttons show a pressed/loading state to prevent double-clicks
- [ ] Disabled elements look genuinely inert (opacity + no pointer cursor)

### Motion
- [ ] Micro-interactions: 100–200ms. Larger transitions: 200–400ms
- [ ] Ease-out for entering, ease-in for leaving
- [ ] Every animation explains a state change — nothing moves just to move
- [ ] `prefers-reduced-motion` is respected

### Edge Cases (the real test)
- [ ] Empty states guide the user (not just "No data")
- [ ] Loading states use content-matched skeletons, not generic spinners
- [ ] Long user-generated content doesn't break layout
- [ ] Numbers/currency are formatted consistently (commas, decimals, alignment)

### The 2px Rule
> Zoom into a screenshot at 200%. If corner radius, icon alignment, or padding looks slightly off — fix it. Users won't consciously notice, but they'll feel the product is "solid."

---

*Use this before shipping any new screen or component — run through the relevant sections, not necessarily all of them.*
