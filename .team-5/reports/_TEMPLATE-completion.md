---
# WRITTEN BY: the agent, when its slice is done or blocked.
# FILENAME:   {agent}-{slice}-completion.md
# PAIRS WITH: the dispatch of the same dispatch_id — this is the harvest unit.

agent:                    # documents | deadlines | chat | drafts | case-ops
slice:
dispatch_id:              # MUST match the dispatch exactly
branch:
completed:                # YYYY-MM-DD
status:                   # complete | partial | blocked

files_touched: []
shared_files_touched: []  # each also logged in shared/shared-file-touches.md, same commit
components_created: []

testids_added:            # true | false — same commit as the component; the hook enforces it
playwright_gate:          # pass | fail | not_run
four_states_covered:      # true | false — true ONLY if loading + empty + error + success all render
error_codes_handled: []   # which error.code values have a designed state
mock_used:                # true | false
contract_drift: []        # each also logged in shared/contract-drift.md

decisions: 0              # count; detail in log/decision-log.md
blockers: []              # ids into log/error-log.md
self_check:               # passed | failed — your own DoD check before handing off
---

## What I built

Plain account of the surface, in prose. Enough that someone reading this six weeks from now
understands what exists without opening the branch.

## Decisions made

Each consequential choice, mirrored into `log/decision-log.md` with its rationale. If a future
agent would ask "why is it like this?", it belongs here and there.

## Handoff / notes for merge

What the integrator needs: shared-file additions, assumptions made against the mock, known gaps,
anything another slice will collide with.

---
---

# WORKED EXAMPLE

---
agent: drafts
slice: draft-review
dispatch_id: drafts-draft-review
branch: feat/drafts-review
completed: 2026-08-19
status: complete

files_touched:
  - apps/web/src/app/(attorney)/transactions/[id]/drafts/page.tsx
  - apps/web/src/components/drafts/DraftSectionList.tsx
  - apps/web/src/components/drafts/AttestationModal.tsx
shared_files_touched:
  - "queryKeys.ts: keys.draft(id, draftId)"
  - "mutations.ts: approveDraft — invalidates draft, drafts, activity"
components_created: [DraftSectionList, DraftSection, AttestationModal, ApproveBar]

testids_added: true
playwright_gate: pass
four_states_covered: true
error_codes_handled: [DRAFT_NOT_FOUND, MATTER_ACCESS_DENIED, DRAFT_ALREADY_APPROVED]
mock_used: true
contract_drift:
  - "draft.sections[].reviewedAt absent in mock, present in real API"

decisions: 2
blockers: []
self_check: passed
---

## What I built

The draft review surface. Sections render individually, each with the AI-teal marker and its own
"mark reviewed" control. `sectionsReviewed` is a Set in component state; the Approve bar reads its
size against `sections.length` and is genuinely disabled — not styled-disabled — until they match.
Approving opens the attestation modal, which posts and then invalidates draft, drafts, and activity.

All four states render: skeleton on load, an empty state for a draft with no sections, a mapped
error state per code above, and the success path.

## Decisions made

1. `sectionsReviewed` lives in component state, not Zustand — it's view-local and resets on
   navigation, which is the correct behavior for an attestation (see decision-log #4).
2. The attestation modal is a separate component rather than inline, so the gate logic has one
   home and can't be partially duplicated (decision-log #5).

## Handoff / notes for merge

Added two shared-file entries (logged). One contract drift found: the mock lacks
`sections[].reviewedAt` which the real API returns — logged in contract-drift.md; it doesn't
change the gate but the doc should be updated. No collisions expected with other slices.
