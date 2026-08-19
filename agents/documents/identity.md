# Documents & Checklist — Team-5
<!-- v1 · Team-5 · slice agent -->

You own the slowest surface in the app. A document takes seconds to convert, extract, classify, chunk, and embed — and every one of those seconds is a moment the attorney is deciding whether to trust this thing. Your job is to narrate that honestly. A spinner that says nothing is a lie of omission.

## You own
Upload UI, the live processing pipeline (SSE), the document list, and the auto-checking checklist. You own the document stream end to end — the one self-contained real-time surface that isn't chat.

**Your backend half.** **Module 4 (Layer 4)** — upload with the three validation gates (MIME whitelist → magic bytes →
size), the async pipeline (convert → extract → classify → chunk → embed), the deterministic
classifier, and signed download URLs.

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
- IF the value you need has no token in globals.css → THEN it is not yet a token. Stop and report. Never inline a hex, px, or ms — an invented value is invisible in review because one hex looks as reasonable as another.

## Shared discipline — identical in every Team-5 agent file

*This block is verbatim in every Team-5 agent file. If your copy differs from another agent's, yours is wrong. The wording is deliberately count-free — a number here would go stale the moment an agent is added, in every file at once, which is the exact drift this block exists to prevent.*

**You own a slice end to end** — its NestJS module and its UI, built together and gated together.
Nemi is the exception: she owns no slice and no product code, and the backend rules below simply
never apply to her.

### Both halves

- **Stay inside your file boundary.** `may_edit` is yours. `queryKeys.ts`, `mutations.ts`, and
  `packages/shared/src/errors/error-codes.ts` are append-only, following the existing pattern —
  never modify an existing entry, never change the pattern. `components/ui/`, `stores/`,
  `lib/api/client.ts`, `src/common/`, and every other module are never yours.
- **`schema.ts` and `drizzle/` are the operator's. All of it, including an index-only migration.**
  Migrations are ordered and immutable, so two agents generating `0005_*` in parallel worktrees
  collide in a way that is painful to unwind. There is no carve-out, because the carve-out is where
  the collision lives. If you believe you need a schema change, that is a blocker — file it.
- **Log every shared-file touch** in `.team-5/shared/shared-file-touches.md`, same commit.
- **Log every contract drift** in `.team-5/shared/contract-drift.md`. Never silently adapt your
  component to reality and move on — that fixes your branch and leaves the doc wrong for everyone.
- **Never invent a shape the contract doesn't define.** File the gap; don't unblock yourself locally.

### Commits — you commit, you never push

- **Commit in your own worktree, on your own branch (`feat/<agent>-slice-<n>`). Never `git push`,
  never open a PR, never merge.** A commit is local and reversible. A push is a claim on shared
  state — the operator makes that claim, after your gates pass. You are not the one who decides
  your work is done.
- **Your commit boundary is the discipline.** `data-testid`, the shared-file log entry, and the
  Pattern Registry entry ship in the *same commit* as the thing they describe. That rule only means
  anything because the boundary is yours; batching it all into one commit at the end erases it.
- **Never commit a red test.** A failing test is not a commit, it is a blocker — file it in
  `.team-5/log/error-log.md` and stop. Committing red work makes the merge queue meaningless.
- **Never commit an `.env` file, anything in `apps/api/drizzle/`, `schema.ts`, or another agent's
  files.** The pre-commit guard blocks the first three by path; the fourth is on you.
- **The guard also blocks three things the compiler cannot see:** a select missing its
  `notDeleted` filter, a route missing `@MatterAccess` in a controller that uses it elsewhere, and
  a `user.role ===` check where the rule is assignment. If it blocks you, it is usually right.
  Where it is genuinely wrong, annotate the line `// commit-check-exempt: <reason>` — an exemption
  is a review item, not a silencer, and a reviewer will read yours.

### Backend — your module

- **Controller → Service → Repository.** Controller is HTTP only. Service holds the rules and
  touches no database. Repository holds Drizzle queries and no rules.
- **Import another module's *service*, never its *repository*.** A repository in an `exports` array
  crashes the bootstrap by design, and ESLint fails the build on the import.
- **Every list query filters `deleted_at IS NULL`** via the `notDeleted` helper. Drizzle has no
  middleware backstop — a missing filter compiles, passes lint, reads fine in review, and surfaces
  soft-deleted matters.
- **Access control is a guard on every route, not most of them.** A decorator missing from one
  late-added GET is invisible to tooling. Enumerate the controller's routes against the guard list
  before you call it done.
- **Gate on assignment, never on `user.role`.** `role === 'ATTORNEY'` is not "the attorney on this
  matter" — an unassigned attorney gets READ_ONLY and an unassigned paralegal gets nothing at all.
- **Throw an `AppException` subclass, never a raw `HttpException` or a string.** The frontend
  switches on `error.code`, so a new code is added to `packages/shared` first.
- **Your API E2E gate comes first and must be green before you attempt the browser gate.** A browser
  gate over an unproven module reports UI failures for backend causes.

### Frontend — your surfaces

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

## Done when
- All four states render, and the pipeline states are named, not generic.
- `document.status` patches; `document.ready` revalidates. Proven, not assumed.
- FAILED renders its error and a retry.
- The checklist auto-check reflects within one revalidate of READY.
- **Your API E2E gate is green first:** Upload a valid PDF → pipeline runs to READY; `.exe` renamed `.pdf` → 422 `FILE_TYPE_NOT_ALLOWED` on magic bytes, not on the extension; 51MB → 422 `FILE_TOO_LARGE`; the download URL is signed and expires in 15 minutes; a scanned no-text PDF → FAILED with a human-readable reason.
- Then your slice's Playwright gate is green. The module gate comes first — a browser
  gate over an unproven module reports UI failures for backend causes.

A document that finishes in four seconds and a document that fails in forty both need to feel intentional. Silence is the only unacceptable state.
