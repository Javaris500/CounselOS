# .team-5/ — Operational Files

Files the five frontend agents write **while working**. Two jobs: coordinate five parallel worktrees that never talk to each other, and capture data the Command Center harvests to improve the agents.

## Format: header + body

Every file is a **YAML header** (machine-readable — this is what gets harvested) followed by a **prose body** (human-readable). Anything counted, joined, or filtered lives in the header. Never bury a machine-relevant value in prose.

## Who writes what, and when

| File | Written by | Trigger | Purpose |
|---|---|---|---|
| `dispatch/` | the operator | before an agent starts a slice | the assignment + boundaries |
| `reports/` | the agent | when its slice is done or blocked | what was built |
| `findings/` | reviewer or `/review` | at merge review | what review surfaced |
| `compliance/` | the agent + verifier | before a legal-gate slice merges | proof the gate can't be bypassed |
| `shared/shared-file-touches.md` | the agent | **same commit** as the shared-file change | duplicate/drift detection |
| `shared/contract-drift.md` | the agent | when a mock ≠ real API | documentation defects |
| `log/decision-log.md` | the agent | on any consequential choice | reasoning trail |
| `log/error-log.md` | the agent | on any blocker | escalation record |
| `status/merge-queue.md` | the operator | as slices integrate | one-at-a-time merge order |

## Layout

```
.team-5/
  dispatch/     {agent}-{slice}-dispatch.md
  reports/      {agent}-{slice}-completion.md      ← same dispatch_id as its dispatch
  findings/     {reviewer}-{slice}-findings.md
  compliance/   {slice}-{gate}-attestation.md
  shared/       shared-file-touches.md · contract-drift.md · pattern-registry.md
  log/          decision-log.md · error-log.md
  status/       merge-queue.md
```

## The pairing rule

**One dispatch → one completion, identical `dispatch_id`.** That pair is the unit of measurement: the assignment and its outcome. A completion without a matching dispatch can't be harvested. Never reuse a `dispatch_id`.

## The Pattern Registry — the divergence fix

`shared/pattern-registry.md` is the upstream answer to a slice team's dominant failure mode: five
agents each independently inventing a modal. **Check it before building any recurring element.**
Listed → use it. Not listed → build it and register it in the same commit. Nemi audits it.

## Slice coverage — what round 1 does and does not cover

Five agents cover five slices. The rest are **deferred by design, not overlooked.**

| Slice | Status |
|---|---|
| 0 Foundation | **prerequisite** — operator, before any dispatch |
| 2 Documents · 3 Deadlines · 4/7 Case ops · 5 Chat · 6 Drafts | round 1 — the five slice agents |
| 1 Transactions pipeline | round 2 |
| 8 Leads · 9 Client portal · 11 Search / palette / import | round 2 |
| 10 Wire fraud | round 2 — after Phase 1 core is E2E-green |

Slice numbering follows `00-developer-guide.md` §7, which is also where each slice's Playwright
gate is defined. (`01-codebase.md` Part 3 is the *module* order and its API E2E gates — a
different test layer. Don't take a slice gate from it.)

**Slice 0 is a gate, not a slice.** Every parallel slice depends on the same primitives, the same
`apiFetch`, the same stores; foundation work is sequential by nature. The operator builds it and
no agent is dispatched until `status/merge-queue.md` row 0 reads `merged`.

## Why there are no `depth.md` files

Team-5 agents have `identity.md` only, unlike the AVEL agents' identity + depth pair. That is
deliberate. Knowledge lives in `06-frontend-architecture.md`, `CLAUDE.md`, and
`07-design-handoff.md`; duplicating it into depth files would create exactly the two-sources-of-
truth drift that 06's Principle 2 forbids.

**The agent files carry discipline and verification. The docs carry knowledge.** An agent file
that starts explaining how SWR works has begun drifting from the doc it should be pointing at.

## The three CounselOS-specific files

Beyond the standard set, three exist because this domain forces them:

**`compliance/`** — the Drafts slice builds a Texas Opinion 705 gate. This records that the gate was *verified unbypassable*, not merely that the component shipped. It asks what you tried in order to break it. An audit artifact, not a dev note.

**`shared/shared-file-touches.md`** — five agents appending to `queryKeys.ts` and `mutations.ts` in parallel is the single biggest structural risk. Logging each addition in the same commit makes duplicates visible in one file instead of five branches.

**`shared/contract-drift.md`** — agents build against MSW mocks; the Playwright gate proves whether mock matched reality. Each mismatch is a **documentation defect**. Repeated drift in one area means the contract doc is unreliable and every future agent inherits the same wrong assumption.

## Rules

- **Fill every header field.** A blank field breaks the harvest. Use `none` or `[]`, never empty.
- **Log shared-file touches in the same commit** as the change — same discipline as `data-testid`.
- **Never edit another agent's files here.** Add your own; don't amend theirs.
- **A contract gap is never patched locally.** File it, fix the doc, everyone rebuilds against the fix.
- **Append-only on the shared logs.** Add rows; never rewrite history.
