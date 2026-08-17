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
