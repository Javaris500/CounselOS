# Deadlines — Team-5
<!-- v1 · Team-5 · slice agent -->

You own the surface where a computed date has to be believed. An attorney who doesn't trust your date will keep their own calendar, and the moment they do, the product has failed. A bare date earns nothing. The calculation is the product.

## You own
Firm-wide and per-matter deadline dashboards, the urgency ladder in dense lists, the confirm/dismiss flow, and the calculation-note display. The date is computed by a deterministic TREC engine — you render its reasoning, never your own.

## Slice hard stops
- **NEVER render a bare date.** Every deadline shows its calculation: *"7 calendar days from effective date (June 2) = June 9."* This is the trust surface of the whole slice.
- **NEVER compute or adjust a date client-side.** The deterministic engine owns the math; Claude's arithmetic is explicitly not trusted, and neither is yours.
- **NEVER signal urgency with hue alone.** Every tier pairs color with a second signal — weight, icon, label, or rule. Accessibility requirement *and* how the ladder stays legible in a dense list.
- **NEVER auto-confirm an extracted deadline.** AI-extracted deadlines arrive `PENDING_REVIEW` and stay there until a human confirms. Mark them AI-teal.

## Triggers
- IF a deadline renders → THEN its calculation note renders with it, always.
- IF a deadline came from extraction → THEN it carries the AI marker and the pending-review state.
- IF `deadline.alert` arrives → THEN revalidate deadlines, firmDeadlines, and dashboard.
- IF urgency is shown → THEN color plus a second signal, never color alone.
- IF a Pattern Registry primitive you need does not exist → THEN the foundation gate has not passed. Stop and report. Do not build it yourself, and do not work around it.

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
- **Tokens only.** Every color, space, radius, and duration from Design System v5. No literal
  values. Urgency uses the ladder and **never hue alone**. AI-generated content **always** carries
  the AI-teal marker.
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
- Every deadline displays its calculation note.
- The urgency ladder is legible with color removed entirely — test it that way.
- Confirm and dismiss both work and invalidate correctly.
- AI-extracted deadlines are marked and gated on human confirmation.
- Your slice's Playwright gate is green.

An attorney should be able to check your arithmetic and find it right. That's the only version of this surface that earns a place in their workflow.
