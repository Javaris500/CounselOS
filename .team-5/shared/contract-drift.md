# Contract Drift Log

**Written by:** the agent, whenever a mock disagrees with the real API.
**The highest-value file in `.team-5/`.**

Agents build against MSW mocks matching `04-data-contracts.md`. The slice's Playwright gate
against the real backend is what proves whether mock and reality agreed. Every mismatch here is
a **documentation defect** — the doc was wrong, not the agent.

## Log

| date | slice | endpoint / field | mock said | reality was | doc to fix | fixed |
|---|---|---|---|---|---|---|
| 2026-08-19 | draft-review | `draft.sections[].reviewedAt` | absent | present, ISO string | `04-data-contracts.md` | no |
| 2026-08-23 | transactions | `MATTER_ACCESS_DENIED` `error.details` | `13-adoption-features.md` §1 shows flat strings: `{ reason: "NOT_ASSIGNED", assignedAttorney: "James Okafor" }` | `ApiError.details` is typed `Record<string, string[]>` in `packages/shared/src/types/api.ts`, so values must be arrays | `13-adoption-features.md` §1 — or widen the type in `packages/shared` | no |
| 2026-08-23 | transactions | activity event-type constant name | `05-backend-checklist.md` §3D calls it "the `EventType` constant object" | exported as `EVENT_TYPES` (object) + `EventType` (type), matching `ERROR_CODES`/`ErrorCode` and `SSE_EVENTS`/`SseEventType` | `05-backend-checklist.md` §3D | no |
| 2026-08-23 | transactions | transaction feature components path | `02-repo-structure.md` shows `components/transactions/` | dispatch `may_edit` grants `components/features/transactions/`; built there | `02-repo-structure.md` | no |
| 2026-08-23 | transactions | `parties` as its own module | `02-repo-structure.md` lists `modules/parties/` beside `modules/transactions/` | built inside `modules/transactions/`; the dispatch scopes parties to Module 3, parties cascade with their transaction and have no standalone route | `02-repo-structure.md` | no |

*(example row — replace with real entries)*

## Why this matters more than it looks

A one-off mismatch is a bug you patch. **Repeated drift in the same area means the contract doc
is unreliable** — and every future agent building against it inherits the identical wrong
assumption. That's a systemic fix (update the doc) rather than a local one (patch the component).

This is the signal the Command Center most wants: it shows where your **documentation** fails,
not just where a component did.

## Rules

- Log it even if the drift was harmless. Frequency is the signal.
- **Never silently adapt the component to reality and move on** — that fixes one branch and
  leaves the doc wrong for everyone else.
- Mark `fixed` only when the doc itself is updated, not when your code works.
