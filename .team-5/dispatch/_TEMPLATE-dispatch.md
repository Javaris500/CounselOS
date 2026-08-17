---
# WRITTEN BY: the operator, before an agent starts a slice.
# FILENAME:   {agent}-{slice}-dispatch.md

agent:            # documents | deadlines | chat | drafts | case-ops
slice:            # matches the slice name in 01-codebase.md
dispatch_id:      # {agent}-{slice} — the completion report MUST reuse this exactly
branch:           # the worktree branch, e.g. feat/drafts-review
issued:           # YYYY-MM-DD

scope: >
  One sentence. What this agent builds this round.

file_boundary:
  may_edit: []            # explicit paths — never implied by the feature name
  may_append_only: []     # lib/api/queryKeys.ts, lib/api/mutations.ts — add entries, never modify
  must_not_touch: []      # components/ui/, stores/, lib/api/client.ts

builds_against: mock      # mock | live  — mock (MSW per 04-data-contracts) until the backend slice lands
exit_condition: >
  The slice's Playwright gate from 01-codebase.md. This defines done — not "it renders."

slice_hard_stops: []      # slice-specific only; universal rules live in CLAUDE.md
---

## Assignment

What to build, in plain prose. What "done" looks like beyond the gate. Anything unusual about this slice — a compliance surface, a streaming state, a high-frequency interaction.

## Out of scope

What this agent explicitly does NOT build. State it — five parallel agents drift into each other's slices when scope is only implied.

---
---

# WORKED EXAMPLE — drafts slice

---
agent: drafts
slice: draft-review
dispatch_id: drafts-draft-review
branch: feat/drafts-review
issued: 2026-08-17

scope: >
  Section-by-section draft review with the attestation modal and approve/send gating.

file_boundary:
  may_edit:
    - apps/web/src/app/(attorney)/transactions/[id]/drafts/
    - apps/web/src/components/drafts/
  may_append_only:
    - lib/api/queryKeys.ts
    - lib/api/mutations.ts
  must_not_touch:
    - components/ui/
    - stores/
    - lib/api/client.ts

builds_against: mock
exit_condition: >
  Playwright: attorney opens a draft, reviews every section, attestation modal appears,
  approve enables ONLY after the last section is marked, approval fires, draft state updates.

slice_hard_stops:
  - Approve is disabled by sectionsReviewed.size === sections.length in component state — never a CSS class
  - No dev bypass, no query-param shortcut, no "approve all" affordance, for any reason including testing
  - Every AI-generated section carries the AI-teal marker
---

## Assignment

Build the draft review surface. An attorney opens a generated draft and reviews it section by
section; each section is individually marked reviewed. Only when every section is marked does the
Approve control become genuinely enabled, and approval requires the stored attestation.

This is the highest-compliance-stakes surface in the app. The gate is a Texas Opinion 705
requirement, not a UX preference — an attorney is signing that they reviewed something.

## Out of scope

Draft *generation* (worker-side). Sending to counterparties. The drafts list beyond what's needed
to open one. Do not touch the deadlines or chat surfaces.
