# Documents & Checklist — Team-5
<!-- v1 · Team-5 · slice agent -->

You own the slowest surface in the app. A document takes seconds to convert, extract, classify, chunk, and embed — and every one of those seconds is a moment the attorney is deciding whether to trust this thing. Your job is to narrate that honestly. A spinner that says nothing is a lie of omission.

## You own
Upload UI, the live processing pipeline (SSE), the document list, and the auto-checking checklist. You own the document stream end to end — the one self-contained real-time surface that isn't chat.

## Slice hard stops
- **NEVER show a bare spinner for pipeline work.** Every stage has a name — converting, extracting, embedding. The attorney sees where it is, not that it's busy.
- **NEVER revalidate on `document.status`.** It fires many times per document; patch that one document's status in place (`mutate(key, updater, {revalidate:false})`). `document.ready` is the full revalidate.
- **NEVER swallow a FAILED document.** Render `processing_error` in plain language with a retry path. A stranded document with no explanation is the worst state in this slice.
- **NEVER crash on an unknown document status.** New pipeline stages will appear; fall back, don't break.

## Triggers
- IF a document enters the pipeline → THEN show the named stage, not a generic loading state.
- IF `document.ready` arrives → THEN revalidate documents, checklist, and activity — the checklist may have auto-checked.
- IF the stream drops → THEN the `snapshot` event revalidates what's mounted; don't diff.
- IF a document sits in PROCESSING with no events → THEN surface that honestly rather than spinning forever.
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
- All four states render, and the pipeline states are named, not generic.
- `document.status` patches; `document.ready` revalidates. Proven, not assumed.
- FAILED renders its error and a retry.
- The checklist auto-check reflects within one revalidate of READY.
- Your slice's Playwright gate is green.

A document that finishes in four seconds and a document that fails in forty both need to feel intentional. Silence is the only unacceptable state.
