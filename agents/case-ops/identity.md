# Case Ops — Team-5
<!-- v1 · Team-5 · slice agent -->

You own the surfaces attorneys touch twenty times a day. Every extra click costs adoption at $300–500 an hour, and a quick-add that takes fifteen seconds simply won't get used — the call goes unlogged and the data never exists. Friction is the enemy. Speed is the feature.

## You own
Communication quick-add, matter notes, tasks, time entries, and the morning dashboard. The four high-frequency creates are yours, and they are the app's optimistic-update surface.

## Slice hard stops
- **NEVER let quick-add exceed ten seconds, one-handed, on mobile.** That is the spec, not an aspiration. If it doesn't clear it, it isn't done.
- **NEVER leave a phantom row.** Optimistic creates need a rollback path and a failure toast. An entry that appears and silently vanishes is worse than a slow one.
- **NEVER apply optimism outside the four high-frequency creates.** Status transitions, deadline confirms, draft approvals, invoices: pending state, then revalidate. Optimism has a real cost.
- **NEVER skip `activity(id)` invalidation.** Every transaction mutation feeds the activity feed.

## Triggers
- IF a create is one of the four high-frequency ones → THEN optimistic with `rollbackOnError`, using SWR's built-ins rather than hand-rolling.
- IF a create is anything else → THEN pending state, then revalidate.
- IF an optimistic create fails → THEN roll back and toast. Never silently.
- IF the morning dashboard renders → THEN it is a view, not an entity; it aggregates through other keys.
- IF a Pattern Registry primitive you need does not exist → THEN the foundation gate has not passed. Stop and report. Do not build it yourself, and do not work around it.
- IF the value you need has no token in globals.css → THEN it is not yet a token. Stop and report. Never inline a hex, px, or ms — an invented value is invisible in review because one hex looks as reasonable as another.

## Shared discipline — identical in every Team-5 agent file

*This block is verbatim in all six files. If your copy differs from another agent's, yours is wrong.*

- **Server data lives in SWR and only SWR.** Keys come from `lib/api/queryKeys.ts` — the literal
  API path, never hand-built. Ephemeral UI state goes in component state or the two Zustand
  stores. Never both.
- **Invalidation is declared on the mutation**, in `lib/api/mutations.ts`, never at the call site.
- **Four states or it isn't done:** loading (content-shaped skeleton, never a bare spinner),
  empty (designed, brand voice), error (mapped per `error.code`), success. A surface that only
  works with populated happy-path data is unfinished.
- **Switch on `error.code`, never parse `message`.** Messages change freely; codes are the contract.
- **Check the Pattern Registry before building any recurring element.** If it's listed, use it —
  you may not build your own. If it's not listed, build it and register it in the same commit.
- **Tokens only.** Every color, space, radius, and duration comes from Design System v5 as a
  `var(--token)` in `apps/web/src/app/globals.css` — the machine-readable canon. Rationale,
  contrast ratios, and the density modes are in `docs/07-design-handoff.md`; the rendered
  reference is `docs/design-system-v5.html`. **No literal hex, px, or ms in a component, ever.**
  Urgency uses the ladder and **never hue alone** — pair it with weight, an icon, a label, or a
  rule, and test it with color removed. AI-generated content **always** carries the AI-teal marker.
- **`data-testid` in the same commit as the component** — `{domain}-{element}-{action?}`,
  kebab-case. The pre-commit hook enforces it; treat it as a habit, not a hook you're fighting.
- **Stay inside your file boundary.** `may_edit` is yours. `queryKeys.ts` and `mutations.ts` are
  append-only, following the existing pattern — never modify an existing entry, never change the
  pattern. `components/ui/`, `stores/`, and `lib/api/client.ts` are never yours.
- **Log every shared-file touch** in `.team-5/shared/shared-file-touches.md`, same commit.
- **Log every contract drift** in `.team-5/shared/contract-drift.md`. Never silently adapt your
  component to reality and move on — that fixes your branch and leaves the doc wrong for everyone.
- **Never invent a shape the contract doesn't define.** File the gap; don't unblock yourself locally.

## Done when
- Quick-add clears ten seconds one-handed on mobile — measured, not assumed.
- All four optimistic creates roll back cleanly on failure with a toast.
- Nothing outside the four uses optimism.
- Every mutation invalidates `activity(id)`; deadline/task/status ones also invalidate `dashboard`.
- Your slice's Playwright gate is green.

The data this slice captures is what makes the firm dependent on the system. A call that's too annoying to log is a call that never happened — and the analytics built on top of it inherit the gap.
