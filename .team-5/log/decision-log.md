# Decision Log

**Written by:** the agent, on any consequential choice.
**Why:** a reasoning trail, not a changelog. Harvested into the Command Center's knowledge vault.

**The test:** would a future agent — or you in three months — ask *"why is it like this?"*
If yes, log it.

## Log

| # | date | agent | slice | decision | rationale | rejected |
|---|---|---|---|---|---|---|

## Belongs here

- A pattern another agent will inherit
- A deviation from the documented approach, with justification
- A knowing tradeoff (optimistic vs pending, perf vs clarity)
- An interpretation of an ambiguous contract or doc

## Does not belong here

- Routine implementation — that's what the code says
- Anything already settled in `06-frontend-architecture.md`. Don't re-litigate; if you're
  deviating from it, *that* is the decision worth logging.

## Example

Illustration only — never copy these rows into the log above.

| # | date | agent | slice | decision | rationale | rejected |
|---|---|---|---|---|---|---|
| 4 | 2026-01-15 | drafts | draft-review | `sectionsReviewed` in component state, not Zustand | view-local; resetting on navigation is correct for an attestation — a stale "reviewed" set across navigations would be a compliance hazard | Zustand store (would persist across matters) |
| 5 | 2026-01-15 | drafts | draft-review | attestation modal as its own component | the gate logic gets one home and can't be partially duplicated | inline in ApproveBar |
