# 19 — Commits, Guards, and the Merge Flow

**Who this is for:** every developer and every agent working in this repo.
**What it answers:** who commits, who pushes, what gets blocked and why.

---

## Part 1 — Two kinds of mistake

Every mistake you can make in this codebase falls into one of two buckets. The difference
matters more than anything else in this document.

### Loud mistakes — the toolchain already catches these

| Mistake | What stops you |
|---|---|
| Import another module's repository | ESLint fails the build |
| Export a repository from a module | The app **crashes on boot** |
| Wrong type, missing field | `pnpm typecheck` fails |
| `class-validator`, `Scope.REQUEST`, `app.useGlobalFilters()` | ESLint `no-restricted-syntax` |
| Read `process.env` outside the three allowed files | ESLint |

You cannot ship these. You will find out in seconds. **Stop worrying about them.**

### Silent mistakes — nothing catches these

This is the whole reason this document exists.

| Mistake | What happens |
|---|---|
| A list query missing its soft-delete filter | Compiles. Passes lint. Returns **deleted legal records**. |
| `@MatterAccess` on 5 of 6 routes | Compiles. Passes lint. One route is **wide open**. |
| `user.role === 'ATTORNEY'` where the rule is assignment | Compiles. Passes lint. **Every attorney in the firm** gets access. |

Read those again. Each one **compiles, passes lint, and reads perfectly reasonably in code
review.** There is no red squiggle. There is no failing test unless someone thought to write
exactly the right one. In a legal product, each is a real harm: a deleted matter resurfacing, a
client's file exposed to an attorney who isn't on it.

**This is what the commit guard is for.** It exists for bucket two only.

---

## Part 2 — The three silent failures, in detail

### 2.1 Soft delete

CounselOS **never hard-deletes legal data.** Instead a row gets `deleted_at = <timestamp>` and
stays in the table forever. That is a legal requirement, not a preference — 7-year Texas
retention.

The consequence: **a plain `SELECT` returns deleted rows.** You must filter them out yourself,
every single time.

If you've used Prisma or TypeORM before, you may expect a global middleware that adds this filter
automatically. **Drizzle has no such layer.** There is no backstop. Miss it once and it's wrong.

```typescript
// WRONG — returns closed AND deleted matters
await db.select().from(transactions)
  .where(eq(transactions.firmId, firmId));

// RIGHT
import { notDeleted } from '../../database/helpers';

await db.select().from(transactions)
  .where(and(eq(transactions.firmId, firmId), notDeleted.transactions));
```

`notDeleted` lives in `apps/api/src/database/helpers.ts` and covers all **13** tables that carry
`deleted_at`. A unit test derives that list from `schema.ts` and fails if the two ever disagree, in
either direction — so the map cannot silently go stale.

**Always use the helper, never a hand-written `isNull(x.deletedAt)`.** Two reasons: the guard can
see the helper, and coverage stays greppable.

**The guard counts per table.** Four selects from `transactions` need four `notDeleted.transactions`.
Using the helper once in a file proves nothing about the other three queries — and "I filtered
three of four" is exactly the failure being prevented.

### 2.2 Matter access

Authentication and authorization are different questions:

- **Authentication** — *are you a real logged-in user?* Handled globally by `JwtAuthGuard`. Every
  route is protected by default; `@Public()` opts out.
- **Authorization** — *are you allowed to see **this** matter?* Handled by `@MatterAccess`. **Not
  automatic.**

So a route with no decorator isn't broken — `GET /v1/auth/me` legitimately has none, because any
logged-in user may fetch their own profile.

The failure is **inconsistency**:

```typescript
@Controller('transactions')
export class TransactionsController {
  @MatterAccess()
  @Get(':id')            findOne() {}     // guarded

  @MatterAccess()
  @Patch(':id/status')   transition() {}  // guarded

  @Get(':id/parties')    parties() {}     // ← added last week. Wide open.
}
```

Nothing fails. The tests pass. And any authenticated user in the firm can read the parties on
**any** matter, including ones they were deliberately kept off.

**The guard's rule:** if a controller uses `@MatterAccess` *anywhere*, every route in it must carry
it — or `@Public()`, or an explicit exemption. Using it once establishes that this controller is
matter-scoped; a route without it is an oversight until you say otherwise.

### 2.3 Role vs. assignment

The most dangerous of the three, because the wrong version looks *more* readable than the right one.

```typescript
if (user.role === 'ATTORNEY') return true;
```

That reads as "attorneys can do this." What it actually says is **"every attorney at the firm can
do this — including ones who have nothing to do with this matter."**

The real rule (spec 8G) is about **assignment**, not job title:

| Situation | Correct access |
|---|---|
| Attorney assigned to this matter | Full |
| Attorney **not** assigned | **READ_ONLY** |
| Paralegal assigned | Per assignment |
| Paralegal **not** assigned | **Nothing.** No read-only fallback. |

A role check collapses all four rows into "full access." It compiles, passes lint, and reads
sensibly to a reviewer who doesn't have 8G in their head.

**When is a role check correct?** When the rule genuinely is firm-wide — "only an OWNER may view
billing." Then express it as a route decorator, `@Roles('OWNER')`, not an `if` in a service. The
one place role comparison legitimately lives is `roles.guard.ts`, and the guard exempts that file.

---

## Part 3 — What the guard actually is

`.claude/hooks/commit-checks.mjs`, run by `.claude/hooks/pre-commit-guard.sh`.

**It is a Claude Code hook, not a git hook.** Two consequences worth knowing:

1. It fires **before git runs at all** — so `git commit --no-verify` does not bypass it.
2. It only fires when *Claude* runs the commit. A human typing `git commit` in their own terminal
   is not intercepted. That's deliberate: you're accountable for your own commits, and agents are
   the ones working unattended.

It reports **every** violation at once rather than the first — same philosophy as
`validateEnvVars()`. Discovering one problem per attempt is its own failure mode.

### It reads the index, not your working tree

The guard checks **staged** content. If you stage a file and then keep editing, the guard judges
what git is about to commit — which is the thing that matters.

### It knows agent from operator

An agent works in a **linked git worktree**; the operator works in the main clone. `git rev-parse`
reports a different git-dir in a worktree, and that's the signal. Path restrictions apply to agents
only — the operator owns the schema and migrations and must be able to commit them.

### The exemption escape hatch

Sometimes the guard is wrong. A `restore()` method **must** find the soft-deleted row:

```typescript
async restore(id: string) {
  // commit-check-exempt: restore must find the soft-deleted row by definition
  return db.select().from(transactions).where(eq(transactions.id, id));
}
```

Three things about exemptions:

- They are **greppable.** `grep -rn "commit-check-exempt" apps/` shows every one.
- They **require a reason.** The marker without text doesn't match.
- They are **a review item, not a silencer.** A reviewer will read yours and may reject it.

If you find yourself writing exemptions routinely, the guard isn't the problem — say so and we'll
fix the rule.

---

## Part 4 — Who commits, who pushes

The original rule in `CLAUDE.md` was *"the user runs `git commit` and `git push` themselves."* That
was correct when one assistant worked in one repo. With six agents in six worktrees it makes the
operator the bottleneck that parallel work exists to remove. So the rule splits.

**The line is: local vs. shared.**

A **commit** is local. It lives on the agent's own branch in the agent's own worktree. Nobody else
sees it. One command undoes it.

A **push** or **PR** is a claim on shared state. It says *"this is done — look at it."* That claim
comes from the operator, after the gates pass. **Not from the agent that wrote the code and is
grading its own homework.**

| Action | Who | Why |
|---|---|---|
| `git commit` in own worktree | **Agent** | Local, reversible, private |
| `git push` | **Operator** | First moment the work leaves the machine |
| Open the PR | **Operator** | A PR is a claim of doneness — verify, then claim |
| Merge | **Operator**, one branch at a time | `.team-5/status/merge-queue.md` |

### Why agents must commit — it isn't a convenience

Three rules in this repo say **"same commit"**:

- `data-testid` ships in the same commit as the component
- A shared-file touch is logged in the same commit as the change
- A Pattern Registry entry is registered in the same commit

Those rules only mean something if **the agent controls the commit boundary.** If work is batched
and committed at the end by someone else, "same commit" is vacuous — it's all one commit. The
discipline evaporates.

### Four things an agent must never commit

| Never | Why |
|---|---|
| `.env` files | The repository is **public**. A leaked service key is a real incident. |
| Anything in `apps/api/drizzle/` | Migrations are ordered and immutable. Two agents generating `0005_*` in parallel collide painfully. |
| `apps/api/src/database/schema.ts` | 27 tables, one source of truth. Six branches editing it is worse than the problem it solves. |
| Another agent's files | Boundaries are what make parallel work possible. |

The guard blocks the first three by path. **The fourth is on you** — no tool knows which agent you
are.

Need a schema change? **That's a blocker, not a task.** File it in `.team-5/log/error-log.md` and
stop. The operator generates the migration; you rebuild on it.

---

## Part 5 — The flow, end to end

```
  OPERATOR                    AGENT                      OPERATOR
  ────────                    ─────                      ────────
  writes dispatch    →   builds in worktree      →   reads completion report
  (.team-5/dispatch)     commits as they go          (.team-5/reports)
                         never pushes                        ↓
                                ↓                     runs API E2E gate
                         writes completion                   ↓
                         report, same dispatch_id      runs Playwright gate
                                                             ↓
                                                      first module? →
                                                        adversarial review
                                                             ↓
                                                      push + open PR
                                                             ↓
                                                      squash-merge, one at a time
```

### Gate order matters

**API E2E first, browser gate second.** Always. A browser test running over an unproven module
reports UI failures for backend causes, and you burn an afternoon debugging the wrong layer.

### The dispatch ↔ completion pair

One dispatch produces one completion report with the **same `dispatch_id`**. That pair is the unit
of measurement: the assignment and its outcome. **Read the completion report before the diff** — it
tells you which shared files were touched and what contract drift was found. Those are your risk
areas, and the diff won't volunteer them.

### First module gets an adversarial review

Every agent's **first** backend module goes through the access-control section of `/review`, in a
fresh session, before merge. Structural violations already crash the bootstrap. This buys the
category tooling can't reach — a missing filter, a partly-guarded controller, a role check standing
in for an assignment rule. Once an agent has cleared one module, later ones take normal review.

### Squash-merge each slice

The agent's intermediate commits are working notes. The reviewable unit is the **slice**. Squashing
gives you a clean history and exactly one revert button per slice — and the "same commit"
discipline already did its job during the build.

---

## Part 6 — When the guard blocks you

**Read the message.** It names the file, the line, and the fix. Then:

1. **Is it right?** Usually. Add the filter, add the decorator, gate on assignment. Done.
2. **Is it wrong?** Add `// commit-check-exempt: <reason>` on the line, with a real reason.
3. **Is it a path block?** Unstage the file. If you believe you need a schema change, that's a
   blocker for `.team-5/log/error-log.md` — not something to work around.
4. **Is the rule itself wrong?** Say so. A guard people route around is worse than no guard.

**Never disable the hook to get a commit through.** If a check is broken it gets fixed for
everyone, in one place, in one commit.

---

## Quick reference

```bash
# What the guard checks
soft-delete          every select from a soft-deletable table carries notDeleted.<table>
matter-access        if a controller uses @MatterAccess, every route in it carries it
role-vs-assignment   no `user.role === '...'` outside roles.guard.ts
forbidden-path       agents may not commit .env, drizzle/, or schema.ts

# The escape hatch (needs a reason, shows up in review)
// commit-check-exempt: <why this line is correct as written>

# Find every exemption in the repo
grep -rn "commit-check-exempt" apps/ packages/

# Gate order — never reverse these
pnpm --filter @counselos/api test:e2e     # API gate, first
pnpm --filter @counselos/web test:e2e     # browser gate, second
```

| I want to... | Who does it |
|---|---|
| Commit my work | You, in your worktree |
| Push a branch | Operator |
| Open a PR | Operator |
| Merge | Operator, one at a time |
| Change the schema | Operator — file a blocker |
| Add a migration | Operator — file a blocker |

**Related:** `CLAUDE.md` (the rulebook) · `docs/18-nestjs-conventions.md` (NestJS wiring) ·
`docs/03-schema.md` (soft-delete pattern) · `.team-5/status/merge-queue.md` (dispatch order)
