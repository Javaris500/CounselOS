---
# WRITTEN BY: the operator, before an agent starts a slice.
# FILENAME:   {agent}-{slice}-dispatch.md

agent:            # documents | deadlines | chat | drafts | case-ops
slice:            # matches the slice name in 01-codebase.md
dispatch_id:      # {agent}-{slice} — the completion report MUST reuse this exactly
branch:           # the worktree branch, e.g. feat/drafts-review
issued:           # YYYY-MM-DD

scope: >
  One sentence. What this agent builds this round.

file_boundary:
  may_edit: []            # explicit paths — never implied by the feature name
  may_append_only: []     # lib/api/queryKeys.ts, lib/api/mutations.ts — add entries, never modify
  must_not_touch: []      # components/ui/, stores/, lib/api/client.ts

builds_against: mock      # mock | live  — mock (MSW per 04-data-contracts) until the backend slice lands
exit_condition: >
  The slice's Playwright gate from 01-codebase.md. This defines done — not "it renders."

slice_hard_stops: []      # slice-specific only; universal rules live in CLAUDE.md
---

## Assignment

What to build, in plain prose. What "done" looks like beyond the gate. Anything unusual about this slice — a compliance surface, a streaming state, a high-frequency interaction.

## Out of scope

What this agent explicitly does NOT build. State it — five parallel agents drift into each other's slices when scope is only implied.

---

## Standing notes — copy the relevant ones into every dispatch

These are things an agent will otherwise rediscover at its own cost. They are not slice-specific,
and they are not in `CLAUDE.md` because they are consequences of how this stack is wired rather
than rules anyone chose.

### Auth in a browser test — do NOT specify a storageState FILE

**Added 2026-08-24, from the nemi slice 1 dispatch.** That dispatch asked for the textbook shape:
log in once per role in a setup project, write `.auth/{role}.json`, point every later test at it.
It cannot work against this API, and it fails in the worst available way — **test one passes, test
two lands on `/auth/login`, and it reads as a flake** rather than as a design error. Budget an
hour lost per agent that meets it cold.

**Why.** The refresh token **rotates on use**. `AuthService.refresh()` hands the presented token to
Supabase, which deletes it and issues a successor, and the API sets that successor as the cookie.
The access token lives in memory in the Zustand store and never in localStorage, so the cookie is
the only durable half of a session — and a captured cookie is therefore a **single-use credential**.
The first test to load a protected page consumes it; the successor is written into that test's
context and discarded with it; the file still holds the dead token.

**Rotation is correct and is not the thing to change.** A refresh token that survives its own use is
a replayable credential.

**What to write instead:** one login per test, through `POST /v1/auth/login` rather than the form,
returned as a `storageState` **object** — Playwright accepts one exactly where it accepts a path.
The rule that actually matters, *no test drives the login UI*, holds. The file was never the point.

The working harness is `apps/web/e2e/fixtures/auth.ts` (`role` option, `storageState` fixture,
`openSecondSession()`). **Point the agent at it; do not let it rebuild one.**

Phrase the clause in a dispatch as: *"Auth comes from the `storageState` fixture in
`e2e/fixtures/auth.ts`. Never drive the login form; never write a storageState file."*

### Seeded IDs cannot be imported directly from `seed.ts`

`seed.ts` imports `PG_CLIENT_OPTIONS` from `database.module.ts`, so importing one constant drags a
NestJS module — and its parameter decorators — through Playwright's Babel, which does not enable
the legacy decorator transform. It fails with `Decorators cannot be used to decorate parameters`.

`apps/web/e2e/fixtures/seed.ts` already works around it by reading the values out of a `tsx`
subprocess. The IDs still come from the seed and nowhere else, which is what the
never-hardcode-a-UUID rule is protecting. **The real fix is upstream** — `PG_CLIENT_OPTIONS` is a
plain object and does not belong in a file that also defines a NestJS module — and until someone
makes it, every slice inherits the workaround.

### An illegal state transition is only reachable from a stale second view

The status control only ever offers moves the server called legal, so a browser cannot request an
illegal one from a freshly-loaded page. Any test of a refusal path needs two sessions: one moves
the matter, the other holds its old ladder. `openSecondSession()` in the auth fixture exists for
this. A dispatch that asks for a refusal to be tested without saying this sends the agent looking
for a bug in its own test.

---
---

# WORKED EXAMPLE — drafts slice

---
agent: drafts
slice: draft-review
dispatch_id: drafts-draft-review
branch: feat/drafts-review
issued: 2026-08-17

scope: >
  Section-by-section draft review with the attestation modal and approve/send gating.

file_boundary:
  may_edit:
    - apps/web/src/app/(attorney)/transactions/[id]/drafts/
    - apps/web/src/components/drafts/
  may_append_only:
    - lib/api/queryKeys.ts
    - lib/api/mutations.ts
  must_not_touch:
    - components/ui/
    - stores/
    - lib/api/client.ts

builds_against: mock
exit_condition: >
  Playwright: attorney opens a draft, reviews every section, attestation modal appears,
  approve enables ONLY after the last section is marked, approval fires, draft state updates.

slice_hard_stops:
  - Approve is disabled by sectionsReviewed.size === sections.length in component state — never a CSS class
  - No dev bypass, no query-param shortcut, no "approve all" affordance, for any reason including testing
  - Every AI-generated section carries the AI-teal marker
---

## Assignment

Build the draft review surface. An attorney opens a generated draft and reviews it section by
section; each section is individually marked reviewed. Only when every section is marked does the
Approve control become genuinely enabled, and approval requires the stored attestation.

This is the highest-compliance-stakes surface in the app. The gate is a Texas Opinion 705
requirement, not a UX preference — an attorney is signing that they reviewed something.

## Out of scope

Draft *generation* (worker-side). Sending to counterparties. The drafts list beyond what's needed
to open one. Do not touch the deadlines or chat surfaces.
