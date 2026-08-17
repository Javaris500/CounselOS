# Error / Escalation Log

**Written by:** the agent, on any blocker — including ones you resolved yourself.
**Why:** a recurring blocker is a systemic problem, not bad luck. The pattern is the data.

**Escalation ladder:** agent → integrator → operator. A contract gap goes straight to the top.

## Log

| # | date | agent | slice | blocker | escalated_to | resolution | status |
|---|---|---|---|---|---|---|---|

## Rules

- **A contract gap is never patched locally.** File it, fix the doc, everyone rebuilds against
  the fix. A local patch fixes one branch and leaves four agents wrong.
- **Log it even if you unblocked yourself.** What blocks agents is the useful signal.
- Recurring entries become a KnowledgeEntry at harvest.

## Status values

`open` → `escalated` → `closed` | `wont-fix`

## Example

Illustration only — never copy this row into the log above.

| # | date | agent | slice | blocker | escalated_to | resolution | status |
|---|---|---|---|---|---|---|---|
| 1 | 2026-01-15 | drafts | draft-review | mock lacked `sections[].reviewedAt`; unclear whether the gate should read it | operator | build gate on local state; log as contract drift, fix the doc | closed |
