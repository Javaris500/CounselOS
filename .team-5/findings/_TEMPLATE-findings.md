---
# WRITTEN BY: reviewer or /review, at merge review.
# FILENAME:   {reviewer}-{slice}-findings.md

reviewer:
slice:
target_agent:             # whose work this is about
branch:
reviewed:                 # YYYY-MM-DD
findings_count: 0
severity: []              # one per finding, in order: blocker | warn | note
categories: []            # duplicate-querykey | competing-pattern | out-of-scope-file
                          # | missing-testid | missing-state | unhandled-error-code
                          # | compliance | contract-drift | other
gate:                     # pass | blocked  — any blocker severity means blocked
---

## Findings

One numbered entry per finding. Each states: **what** (the problem), **where** (file/line),
**severity**, and **the required fix**. A finding without a fix is a complaint.

---
---

# WORKED EXAMPLE

---
reviewer: integrator
slice: draft-review
target_agent: drafts
branch: feat/drafts-review
reviewed: 2026-08-19
findings_count: 3
severity: [blocker, warn, note]
categories: [compliance, competing-pattern, missing-state]
gate: blocked
---

## Findings

**1. Approve enabled by length comparison against a stale array — BLOCKER (compliance)**
`ApproveBar.tsx:41` compares `sectionsReviewed.size` against a `sections` prop that isn't
guaranteed fresh after a `draft.ready` revalidate. Under a re-fetch mid-review the gate can
enable early. **Fix:** derive both from the same SWR read at render time. This is an Opinion 705
surface — a gate that can enable early is not a gate. Blocks merge.

**2. Second modal pattern introduced — WARN (competing-pattern)**
`AttestationModal.tsx` rolls its own overlay rather than the existing `components/ui/Dialog`.
Two modal primitives will drift. **Fix:** rebuild on the shared Dialog, or file a decision-log
entry justifying the divergence.

**3. No empty state for a zero-section draft — NOTE (missing-state)**
`DraftSectionList.tsx` renders an empty container. Rare but reachable if generation returns
nothing. **Fix:** add the empty state with brand-voice copy.
