---
# WRITTEN BY: reviewer or /review, at merge review.
# FILENAME:   operator-slice-1-findings.md

reviewer:                 operator
slice:                    1
target_agent:             operator          # this is a finding about the DISPATCH, not the agent
branch:                   feat/transactions-slice-1
reviewed:                 2026-08-23
findings_count:           2
severity:                 [warn, warn]
categories:               [out-of-scope-file]
gate:                     pass
---

## Findings

### 1. The dispatch's file boundary made the agent's module impossible to load — `warn`

**What.** `transactions-slice-1-dispatch.md` listed neither `apps/api/src/app.module.ts` in
`may_edit` nor in `may_append_only`. A NestJS feature module does not exist at runtime until
`AppModule` imports it. The boundary therefore permitted the agent to build a module and forbade
it from making that module load.

**Where.** `apps/api/src/app.module.ts` — 4 lines added by the agent: one import, one entry in
`imports`, two comment lines. Zero lines removed.

**Who.** The **operator**. This is a defect in the dispatch, not in the agent's work. The change
the agent made is the minimal correct one, and it is placed correctly — `TransactionsModule` after
`AuthModule`, so global guard order stays authenticate → role → matter access (18 §3). There was
no compliant alternative available to it.

**Why it matters beyond this slice.** Every feature agent under the vertical cut hits this on its
first dispatch. `app.module.ts` is the one file a feature agent must touch that lives outside its
feature directory — the single point where the vertical cut leaks. Left unfixed it would produce
six identical false violations and teach the operator to ignore ownership failures, which is worse
than not checking.

**Resolution.** `apps/api/src/app.module.ts` added to `may_append_only`, not `may_edit`. That is
the correct constraint and not merely the convenient one: an agent must be able to add its own
registration and must never be able to remove or reorder another module's. `check-mounts.sh`
enforces exactly that by failing on any removed line in an append-only file.

**Generalizes to.** The vertical mount table in `ROSTER-V2.md` should name the framework's
composition root as an append-only path for every feature agent. NestJS has `AppModule`; the
equivalent exists in most feature-organised frameworks — a router table, a plugin registry, a
DI container manifest.

### 2. The dispatch also forbade the agent's own completion report — `warn`

**What.** `.team-5/reports/` and `.team-5/compliance/` were in neither `may_edit` nor
`may_append_only`, while `.team-5/README.md` line 14 requires the agent to write a completion
report when its slice is done. The boundary made a required deliverable a violation.

**Where.** `.team-5/reports/transactions-slice-1-completion.md`. `check-mounts.sh` flagged it as
the run's only `OUTSIDE BOUNDARY`, correctly.

**Who.** The **operator**, again, and it is the same shape as finding 1: a required output whose
path was never granted.

**Resolution.** Both directories added to `may_append_only`. Ownership re-runs PASS at 61 files.

## The pattern behind both findings

Three times in one slice the boundary blocked something the agent was required to produce:
`app.module.ts`, then `packages/shared` (three separate blockers, error-log rows 2–4), then
`.team-5/reports/`. One cause:

> **Under the vertical cut, a feature agent's first slice needs shared surface that does not exist
> yet, and it owns none of it.**

This corrects the trigger recorded in decision-log row 9. That row says foundations becomes an
agent "when a mission dispatches two or more feature agents concurrently", reasoning that
divergence needs concurrent writers. The evidence says otherwise: foundations was needed on slice
1, with one agent running, and it blocked four times before the first commit. The gap is not
divergence — it is **provisioning**. `ROSTER-V2.md` should say the foundations role runs *before*
the first feature agent, not after the second.

## Foundations work completed, 2026-08-23

The three blockers the agent filed against the operator are closed, plus the type conflict.

| error-log row | Resolution |
|---|---|
| 2 — create schema duplicated | Hoisted to `packages/shared/src/schemas/transaction.schema.ts`. The agent's local copy is **deleted, not synced**, exactly as its header instructs. |
| 3 — response types local | Hoisted to `packages/shared/src/types/transaction.ts`. Same — deleted, not synced. |
| 4 — `FIELD_LIMITS.OUTCOME_NOTES` missing | Added, 500, beside `COMMUNICATION_SUMMARY`. |
| contract-drift — `MATTER_ACCESS_DENIED` details | `ApiError.details` stays `Record<string, string[]>`; `13-adoption-features.md` §1 corrected to arrays. |

**On the details type.** `details` exists for field-level validation, where one field carries
several messages, and that is its common case by a wide margin. 13 §1 documented flat strings — a
shape no client could ever receive, since the type has always been arrays. Widening to
`string[] | string` was rejected: it pushes a two-shape check into every consumer permanently — the
toast, `applyServerErrors`, the access banner — to save one pair of brackets in one error code. The
doc was wrong, not the type. The agent's array-wrapping was correct.

**Deliberately not logged in `decision-log.md`.** Main holds rows 1–9; the agent's branch holds
10–16. Two appends to the same table conflict at merge. This goes in the log as row 17 after the
branch lands — which is itself a finding about append-only shared files: they are conflict-free
only when one writer appends at a time.

## Design tokens — option 1 applied, option 2 deferred

`counselos-tokens.css` arrived at the repo root, 263 tokens in four layers. It is now
`apps/web/src/app/tokens.css`, imported first by `globals.css`.

**Additive, not a replacement.** Every token it defines is `--cos-`prefixed, so it collides with
nothing and **no existing colour changed** — verified: zero unprefixed tokens were re-pointed.
The 597 `var()` uses across main and the unmerged branch are untouched.

Two things were fixed on the way in:

1. **It had no `prefers-color-scheme` block.** Dark was `[data-theme="dark"]` only, so a viewer on
   a dark OS who never touched a toggle would have received the light values — and unset is the
   common state, not the rare one. Mirrored under
   `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` so an explicit light
   choice still beats a dark OS. **The two dark blocks must be changed together.**
2. **Its base styles were left behind.** The file also styled `body`, `*`, `a`, `:focus-visible`,
   `::selection`, `[disabled]` and `code`. `globals.css` already owns `body` and `*`; importing
   both would mean two files styling one selector, which is the drift this whole exercise exists to
   remove. `:focus-visible`, `a` and `::selection` are genuinely missing from `globals.css` and
   should be adopted deliberately, as their own change.

**It closes three of the four token gaps the agent reported:** `--cos-focus-ring{,-width,-offset}`,
`--cos-*-rule-width`, `--cos-measure-{prose,note,tight}`. **Breakpoints remain absent.**

### Option 2 — the migration, after slice 1 merges

Repoint the ~140 unprefixed tokens at their `--cos-*` equivalents and delete them, leaving one
system. Scoped now so it is not re-derived later:

- **84 map cleanly** — 34 by identical name, 50 by identical resolved value.
- **16 have no counterpart** and need a decision each, not a guess. They are the warning/urgent
  tints (`--urgency-warning-bg`, `--urgency-urgent-border`, the `-fg-on-tint` set), two AI tints,
  `--text-xl`, `--shadow-overlay`, `--duration-loop`, and the two density pads.
- **Deliberately not done now.** It touches 388 `var()` uses on `feat/transactions-slice-1`, which
  is unmerged. Doing it during an open slice guarantees a conflict in every CSS module the agent
  wrote.
- **The risk to respect:** a mis-mapped alias changes a colour silently. No test catches it, review
  does not catch it, and it looks correct in the diff. Map by resolved value, not by name, and diff
  the rendered result.

## Verdict

`pass`. No agent-side violation. One operator-side boundary defect, amended mid-dispatch, which is
the documented response — the dispatch tells the agent that a wrong boundary gets amended rather
than worked around silently.

**First real output of the agent system, and the first thing it caught was an operator error.**
That is the mechanism working: the boundary was wrong, the check surfaced it, and the difference
between "the agent exceeded its mount" and "the dispatch declared the wrong boundary" was the
thing that mattered.
