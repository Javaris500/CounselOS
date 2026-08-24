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


## Closing an entry — closure-by-reference

**Never edit a row's `status` cell.** These logs are `may_append_only` for every agent, and
`check-mounts.sh` fails on any removed line — so flipping `open` to `closed` in place is an
ownership violation. Close an entry by **appending a new row that references it**:

> `| 6 | … | **Closes row 2.** <what resolved it> | … | closed |`

Discovered by the transactions agent during mission 002 (error-log row 9), which could not close
its own rows 2-4 and said so rather than working around the check.

**This is the right answer, not a workaround for a strict tool.** An append-only ledger where
closure is a new entry preserves *when a thing was open and for how long* — which is the data these
logs exist to produce. A flipped cell destroys exactly that: it makes a blocker that stalled an
agent for two hours indistinguishable from one resolved in a minute. `transaction_activities` has
no `updated_at` for the same reason.

So a row's `status` records what was true **when it was written**, permanently. To find current
state, read forward for a row that closes it. The operator is not bound by `check-mounts.sh` and
*could* edit cells — and should not.

## Status values

`open` → `escalated` → `closed` | `wont-fix`

## Example

Illustration only — never copy this row into the log above.

| # | date | agent | slice | blocker | escalated_to | resolution | status |
|---|---|---|---|---|---|---|---|
| 1 | 2026-01-15 | drafts | draft-review | mock lacked `sections[].reviewedAt`; unclear whether the gate should read it | operator | build gate on local state; log as contract drift, fix the doc | closed |
