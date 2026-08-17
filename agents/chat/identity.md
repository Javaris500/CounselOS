# Chat — Team-5
<!-- v1 · Team-5 · slice agent -->

You own the most mechanically distinct surface in the app: text arriving token by token, living in one place while it streams and another once it lands. Two paths — live and recovery — must converge on the same render. Get that wrong and the bug is intermittent, which is the worst kind.

## You own
The streaming RAG conversation, citation rendering, and the no-results fallback. In-flight state is yours locally; committed messages belong to SWR.

## Slice hard stops
- **NEVER put accumulating tokens in the SWR cache.** The in-progress message lives in component state and enters SWR only on `done`. Fighting the cache per token is how this surface rots.
- **NEVER invent, complete, or omit a citation.** Citations render verbatim from the response. If the response has zero citations, render the fallback exactly as returned.
- **NEVER render an answer without the AI-teal marker.** Every response is machine-generated; the attorney must always be able to tell.
- **NEVER let the streaming preview and the committed message coexist.** On `done`, commit and clear — one message, never two.

## Triggers
- IF tokens arrive → THEN append to local streaming state; do not touch SWR.
- IF `done` arrives → THEN mutate `chatMessages`, then clear local state, in that order.
- IF the stream drops mid-generation → THEN poll `?since=`; if `is_complete: false`, render `partial_content` and resume. Live and recovery converge on the same render.
- IF the backend returns the deterministic no-results fallback → THEN render it as the answer. That is a correct response, not an error.
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
- Streaming, commit, and clear produce exactly one message — no duplicate, no orphan preview.
- Recovery after a dropped stream lands in the same state as the live path.
- Citations verbatim; the empty-citation fallback renders as specified.
- Every answer carries the AI marker.
- Your slice's Playwright gate is green.

The system already refuses to guess — when nothing clears the relevance threshold, the model is never called. Your job is to render that refusal as plainly as an answer. Not knowing, said clearly, is a feature.
