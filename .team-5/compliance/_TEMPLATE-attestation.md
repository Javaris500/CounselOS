---
# WRITTEN BY: the agent, verified by a second party, BEFORE a legal-gate slice merges.
# FILENAME:   {slice}-{gate}-attestation.md

slice:
gate:                     # opinion-705-attestation | ai-marker | citation-verbatim | client-portal-404
requirement_source:       # e.g. "Texas Opinion 705" | "07-design-handoff.md AI marker" | "01-architecture.md §8"
built_by:
verified_by:              # MUST be someone other than built_by
date:                     # YYYY-MM-DD
result:                   # verified | failed
bypass_found:             # true | false — MUST be false to merge
bypass_attempts: 0        # how many you tried; 0 means this was not verified
evidence: []              # the data-testid(s) / Playwright test names that prove it
---

# {gate} — Verification

## The requirement

State it in one paragraph, plain language, citing its source. Why it exists, and what
failure would mean in the real world.

## How it was verified

Not "the component exists." Proof the gate **actually blocks**: which state drives it,
that the disabled state is real rather than styled, and which test asserts it.

## Attempted bypasses

List what you tried in order to break it, and confirm each failed. **A gate nobody tried
to break is a gate nobody has verified** — `bypass_attempts: 0` is a failed verification.

## Result

`verified` or `failed`. If failed: what's missing. The slice does not merge on a failed gate.

---
---

# WORKED EXAMPLE

---
slice: draft-review
gate: opinion-705-attestation
requirement_source: Texas State Bar Opinion 705 (Feb 2025)
built_by: drafts
verified_by: integrator
date: 2026-08-19
result: verified
bypass_found: false
bypass_attempts: 5
evidence:
  - drafts-approve-button
  - drafts-attestation-modal
  - "e2e: approve stays disabled until final section reviewed"
---

# opinion-705-attestation — Verification

## The requirement

An attorney must individually review every section of an AI-generated draft and sign a stored
attestation before it can be approved. Opinion 705 governs competence and supervision of AI
output. If the gate can be bypassed, an attorney signs an attestation for work they did not
review — a professional-responsibility failure with a licensed name attached, not a UI bug.

## How it was verified

Approve is driven by `sectionsReviewed.size === sections.length` read from the same render-time
SWR value, not a prop that can go stale. The control renders with the `disabled` attribute set
from that comparison — verified by inspecting the DOM, not the styling. The Playwright test
asserts the button is non-interactive after reviewing n-1 of n sections and interactive only
after the nth.

## Attempted bypasses

1. Clicked Approve with 2 of 3 sections reviewed → rejected, control non-interactive.
2. Removed the `disabled` attribute in devtools and clicked → mutation rejected client-side by
   the same state check before firing.
3. Navigated away mid-review and back → `sectionsReviewed` resets, gate re-closes. Correct.
4. Searched the branch for any bypass affordance (`approveAll`, `skipReview`, dev flags,
   query params) → none found.
5. Forced a `draft.ready` revalidate mid-review → sections re-read, gate stayed closed.

## Result

**verified.** No bypass found across five attempts. Gate holds under revalidation and navigation.
