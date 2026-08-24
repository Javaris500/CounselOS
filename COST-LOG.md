# COST-LOG

Tokens and spend, per agent, per mission.

**This is the one capture file that cannot be reconstructed.** An unlogged token is gone
permanently. `SURPRISES.md` can be written from memory badly; `MISSION-001` can be reconstructed
tidily and wrongly; this one simply has no source to recover from. Log it the same day.

**Slice 0's spend is unrecoverable.** This file was created 2026-08-23, after Slice 0 closed. That
is exactly the loss the file exists to prevent, and it happened on mission one. Recorded rather
than quietly started at Slice 1 — see `MISSION-001-COUNSELOS-SLICE-0.md`, "Where the process was
skipped or cut."

## How to read a row

One row per agent per dispatch. A dispatch that was re-run after a blocked gate gets its own row —
the retry is part of what the slice cost, and averaging it away hides the expensive failure mode.

| field | meaning |
|---|---|
| `dispatch_id` | matches `.team-5/dispatch/` and the completion report. Never reused. |
| `in` / `out` | input and output tokens. Cache reads counted in `in`. |
| `usd` | at the model's list rate on the date of the run. Note the model — rates change. |
| `wall` | dispatch to completion, human time, not billed time. |
| `outcome` | `merged` · `blocked` · `abandoned`. A blocked run still cost what it cost. |

## Log

| # | date | mission | agent | dispatch_id | model | in | out | usd | wall | outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| — | 2026-08-17→23 | 001 | operator | — | — | **unlogged** | **unlogged** | **unlogged** | 7 days | merged |
| 1 | 2026-08-23 | 002 | transactions | transactions-slice-1 | *pending* | *pending* | *pending* | *pending* | *pending* | *dispatched* |

**Row 1 is open before the agent starts, deliberately.** Opening it at dispatch rather than at
completion is the only way it gets filled — mission 001 proves what happens otherwise. Fill it the
day the dispatch closes, pass or blocked.

## What to answer with this file, once there are rows

- Which agents are expensive, and whether expensive correlates with useful
- What one slice actually costs end to end, so a client engagement can be priced
- Whether a blocked gate plus a re-run costs more than a slower, more careful first pass
- H4 in `PRIOR-ART.md` — an AVEL doc, in the AVEL repo, not carried here — asks for real cost per
  export at realistic client-repo size. It is currently an estimate; this file is where it stops
  being one.

## What not to do with it

Do not average away the retries, and do not drop `blocked` rows. The distribution is the finding —
a roster where one agent in six burns half the budget is a roster with a design problem, and a mean
hides it completely.
