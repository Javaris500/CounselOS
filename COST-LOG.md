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
| 1 | 2026-08-23 | 002 | transactions | transactions-slice-1 | claude-opus-5 | 83,670,625 | 384,212 | $60.27 | 3h01m | merged-pending |
| 2 | 2026-08-23 | 002 | operator (Axis) | — | claude-opus-5 | 248,374,293 | 863,477 | $161.66 | 8h22m | — |

**Row 1 is open before the agent starts, deliberately.** Opening it at dispatch rather than at
completion is the only way it gets filled — mission 001 proves what happens otherwise. Fill it the
day the dispatch closes, pass or blocked.

### Reading rows 1 and 2

**Recovered from the session transcripts** under `~/.claude/projects/`, not from memory. The
transcripts carry per-turn `usage`, so this is measured rather than estimated — which is the only
reason mission 002 has numbers when 001 does not.

`in` is **all** input: uncached + cache writes + cache reads. The split matters more than the total.

| | operator | transactions agent |
|---|---|---|
| uncached input | 1,328 | 652 |
| cache **writes** | 2,761,649 | 1,535,161 |
| cache **reads** | 245,611,316 | 82,134,812 |
| output | 863,477 | 384,212 |
| assistant turns | 664 | 326 |

**Cache reads are 98.7% of every input token spent today.** At Opus 5 list rates a cache read costs
$0.50/MTok against $5.00 uncached — so that 98.7% cost $164 and would have cost $1,639 without
caching. Caching is not a tuning detail on work of this shape; it is the difference between $222
and roughly $1,700.

**Rates used:** Opus 5 list — $5.00/MTok input, $25.00/MTok output, cache write 1.25x input
($6.25), cache read 0.1x input ($0.50). Verified against the pricing reference on 2026-08-23, not
recalled. **These are list rates.** If the sessions ran under a Claude Code subscription rather
than metered API billing, no invoice matches this figure — it is what the same work would cost at
the API, which is the number that matters for pricing a client engagement.

**Row 2 over-attributes.** The operator session spans 8h22m and covers the whole day — the Supabase
auth fix, the roster documents, three published artifacts, the guard scripts, Foundations, and
slice 1 supervision. Only part of it belongs to mission 002. Row 1 is clean: that session did slice
1 and nothing else.

**The honest read: supervision cost more than construction.** Even discounting row 2 heavily, the
operator side is the larger number. That is worth watching across missions — if it holds, the
bottleneck this system needs to attack is operator context, not agent throughput.

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
