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
| 2026-08-23 | transactions | Design System v5 token coverage | agent files say every space/colour/radius/duration is a `var(--token)` and "no literal px, ever" | there are no tokens for border widths, outline offsets, media-query breakpoints or layout constraints (`minmax`, `min()`), and a media query cannot read a custom property at all. Slice 0a's own primitives (`Button`, `Spinner`, `Drawer`, `Badge`, `Toast`) use bare px for exactly these, so that is the house convention — followed it, and used tokens everywhere one exists | `07-design-handoff.md` — either publish the missing scales or state the structural-px carve-out | no |

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

| 2026-08-24 | 1 | `seed.ts` — how Playwright reads `SEED_IDS` | `seed.ts:10-15` states "Playwright imports these rather than hardcoding a UUID", and `11-test-data.md` assumes the same | a spec importing it dies at transpile: `seed.ts:4` pulls `PG_CLIENT_OPTIONS` from `database.module.ts`, and Playwright's Babel cannot parse NestJS parameter decorators (`Decorators cannot be used to decorate parameters`). Read through a tsx subprocess instead — `e2e/fixtures/seed.ts` | `apps/api/src/database/seed.ts` header — or better, move `PG_CLIENT_OPTIONS` out of the NestJS module so the promise becomes true | no |
| 2026-08-24 | 1 | `MATTER_ACCESS_DENIED` — what the frontend renders | `13-adoption-features.md` §1: *"Frontend renders: 'This matter is assigned to James Okafor. Ask them for access.' — with a button that requests it. Never a bare 'Access denied.'"* | `ErrorState.tsx:22` maps the CODE to fixed generic copy and never reads `error.message` or `error.details`, so `assignedAttorney` and `requestAccessFrom` reach the browser and are discarded. No request button exists. `StatusControl.tsx:84` renders the server message correctly on the other path — one code, two levels of helpfulness | `ErrorState` is the defect, not the doc: 13 §1 is right and the component does not honour it. Fix `components/ui/ErrorState.tsx` | no |
