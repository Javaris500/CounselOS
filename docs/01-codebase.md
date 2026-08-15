# CounselOS — Codebase & Development Process
### How this project is built: module by module, proven by E2E

> This is the doc that explains **how we develop**, not just what to build. We build one module at a time, in dependency order, and a module is not done until its **end-to-end test passes against the real stack**. This document is the codebase map plus the module-by-module playbook. Read it before you write code, and return to it every time you start a new module.

---

## Part 1 — How We Develop

### The core loop

We do not build the whole app and test at the end. We build **one module**, prove it **end-to-end**, then move to the next. Every module goes through the same loop:

```
1. READ      the module's checklist section + its data in schema.ts
2. CONTRACT  confirm the module's inputs, outputs, and dependencies (this doc, Part 3)
3. BUILD     controller → service → repository → dto, in that order
4. UNIT      test the deterministic logic in isolation (mocked repo)
5. INTEGRATE test the DB + queue paths against real Postgres/Redis (testcontainers)
6. E2E       prove the module end-to-end through the HTTP stack with a real JWT
7. GATE      the E2E test is the exit criterion — it passes or the module isn't done
8. MERGE     small PR, layer-scoped, CI green
```

### Two E2E layers — know which one you're writing

| Layer | Tool | Location | Proves | Gates |
|---|---|---|---|---|
| **API E2E** | supertest | `apps/api/**/__tests__/*.e2e-spec.ts` | The backend module works through the real request lifecycle | A **module** |
| **Browser E2E** | Playwright | `apps/web/e2e/*.spec.ts` | The feature works for a human, front to back | A **slice** |

Both are required and they catch different things. API E2E catches a broken status transition; Playwright catches a button that never fires it.

### We build in vertical slices

Because Playwright tests a UI, "all backend then all frontend" doesn't work — you'd accrue no browser tests until the frontend exists, then write forty at once. Instead each **slice** is a feature's backend *and* frontend built together, gated by a Playwright test.

The full slice order, each with its Playwright gate, is in `00-developer-guide.md`. The short version:

```
0  Foundation      L1 + L2 + 8G access guard + 8L health endpoint + frontend shell + demo seed
1  Transactions    L3 + pipeline + detail shell
2  Documents       L4 + upload UI (brings in queues + SSE)
3  Deadlines       L6 + M1 TREC engine + deadline UI (brings in notifications)
4  Case mgmt       8A notes + 8B communications + 8C checklist
5  Chat            L5 + streaming UI
6  Drafts          L7 + section review + attestation
7  Business ops    8D + 8H passive capture + morning dashboard
8  Leads           L8 + conflict check
9  Client portal   L10 + 8J messaging
10 Wire fraud      M2
11 Search + palette 8I + 8I-2 command palette + 8K import
```

**Service honesty (8L) is woven, not a slice.** The `/v1/health/services` endpoint ships in slice 0. Each later slice adds *its* dependency to the probe list and its own disabled-state UI — slice 2 adds Voyage and storage, slice 3 adds Resend, slice 5 adds Anthropic. A service is never reported as working before the slice that uses it exists.

**The command palette lands in slice 11, not earlier.** It shares the search backend, and it's an accelerator for a system that already has data in it — not a foundation piece. Resist pulling it forward.

**Matter-level access (8G) is in slice 0, not late.** It's a guard on every transaction-scoped route — retrofitting it means touching every controller.

**The E2E test is the gate.** A module is "done" when a request enters the real HTTP server, flows through guards → pipe → controller → service → repository → database, and returns the correct response with the correct side effects — and a test proves it, including the failure cases. "It compiles" and "it runs on my machine" are not done.

### Why module-by-module + E2E

- **Each module is independently provable.** You never wonder if module 5 broke module 3, because module 3 has a passing E2E test that still runs.
- **Dependencies are explicit.** A module can only be built after the modules it depends on are E2E-green. That's what keeps the build order honest.
- **The E2E suite becomes the regression net.** By the time you reach the moat features, you have a full E2E suite that catches anything you break in the layers below.

### The three test tiers (and what each proves)

| Tier | Runs against | Proves | Speed |
|---|---|---|---|
| **Unit** | Nothing (mocked repo) | Deterministic logic: status transitions, urgency tiers, TREC date math, token budget, magic-bytes | Milliseconds |
| **Integration** | Real Postgres + Redis (testcontainers), mocked external APIs | DB queries, queue jobs, cache behavior, soft-delete filters | Seconds |
| **E2E** | Full HTTP stack + real JWT, mocked external APIs only | The module works through the real request lifecycle, including auth, validation, and side effects | Seconds |

**Mock only the true externals** — Anthropic, Voyage AI, Resend, Supabase Auth. Never mock your own database, your own queue, or your own services in an E2E test. The whole point of E2E is that the real wiring is exercised.

Full standards are in `10-tdd-guide.md`. This doc tells you *when* each tier applies in the module loop; the TDD guide tells you *how* to write them.

### Definition of Done (per module)

A module is done when **all** of these are true:

- [ ] Every checklist item for the module is ticked in `05-backend-checklist.md`
- [ ] Unit tests cover the deterministic logic, including boundaries and failures
- [ ] Integration tests cover every DB and queue path the module touches
- [ ] **The module's E2E test passes** — the endpoint(s) work through the full stack with a real JWT
- [ ] The negative cases are E2E-tested: invalid input → 422, wrong role → 403, expired token → 401, not-found → 404
- [ ] Errors return the standard envelope with a typed code — never a raw stack trace
- [ ] Anything AI-touched obeys `09-legal-compliance.md` (no auto-send, staged review, fallback on empty context)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all green
- [ ] PR reviewed against the checklist in Part 4

---

## Part 2 — The Codebase Map

### Top level

```
counselos/
├── apps/
│   ├── api/        # NestJS backend — 2 processes (HTTP server + BullMQ worker)
│   └── web/        # Next.js frontend (App Router)
├── packages/
│   └── shared/     # enums, error codes, event types, field limits — the sync contract
└── docs/           # the spec set
```

`packages/shared` is the contract both sides import. An enum or error code lives there once, so the frontend and backend can never drift. Change it there, both sides get it.

### Backend internals

```
apps/api/src/
├── main.ts                  # HTTP entrypoint — instrument.ts is the FIRST import
├── worker.ts                # BullMQ worker entrypoint (separate process, same modules)
├── database/
│   ├── schema.ts            # THE source of truth for data shape
│   ├── db.ts                # Drizzle client
│   ├── helpers.ts           # notDeleted.*, pagination
│   └── migrations/          # drizzle-kit generated + hand-written (HNSW, partial indexes)
├── common/                  # cross-cutting: guards, filters, interceptors, pipes, prompts
└── modules/                 # one folder per domain — the units we build and E2E-gate
```

### Every module has the same shape

This uniformity is the point. Once you've built one module, you've built them all — the structure never surprises you.

```
modules/<name>/
├── <name>.module.ts         # wires the module together
├── <name>.controller.ts     # HTTP layer ONLY — routes in, DTOs validated, no logic
├── <name>.service.ts        # business logic — the rules live here, NO database access
├── <name>.repository.ts     # Drizzle queries — data access, NO business logic
├── dto/                     # Zod schemas + inferred types (request shapes + field limits)
├── constants/               # e.g. the status-transition map, if the module has one
└── __tests__/
    ├── <name>.service.spec.ts     # unit — mocked repository
    ├── <name>.repository.spec.ts  # integration — real Postgres
    └── <name>.e2e-spec.ts         # E2E — the gate
```

**The layering rule, restated because it matters most:**
Controller → Service → Repository. The controller never touches Drizzle. The service never writes SQL. The repository never holds a business rule. This is what makes the service unit-testable with a mocked repo, and it's what makes the module extractable in Phase 2.

**The boundary rule:** a module may import another module's **service**. It may **never** import another module's **repository**. Cross-module data access always goes through the owning service. This is checked in every PR.

---

## Part 3 — The Module Build Order & Contracts

Build in this order. A module may only start once everything in its **Depends on** column is E2E-green. This is the dependency graph made linear.

### Foundation tier — build first, nothing works without it

**Module 1 · Foundation** — `[no dependencies]`
The bootstrap: Drizzle client, config + `validateEnvVars()` (fails fast at boot), global exception filter (the error envelope), correlation-id interceptor, response interceptor, Zod validation pipe, `/v1/health`.
*E2E gate:* `GET /v1/health` returns `{status:'ok'}`; a deliberately malformed request returns the standard error envelope with a typed code, not a stack trace.

**Module 2 · Auth** — depends on: Foundation
JWT guard, Redis user hydration (5-min TTL), roles guard, `@CurrentUser()` / `@Roles()` / `@Public()` decorators, deactivation busts cache.
*E2E gate:* valid JWT → 200 on a protected route; expired JWT → 401 `TOKEN_EXPIRED`; deactivated user → 401 `USER_INACTIVE`; wrong role → 403; no token → 401.

### Spine tier — the central entity

**Module 3 · Transactions** — depends on: Auth
The central entity, the status pipeline, enforced transitions, parties, the activity log.
*E2E gate:* create → 201 with auto transaction number; valid status transition → 200; invalid transition → 422 `INVALID_STATUS_TRANSITION`; list excludes soft-deleted; every mutation writes an activity-log row.

### Document & intelligence tier

**Module 4 · Documents** — depends on: Transactions
Upload with the three validation gates (MIME whitelist → magic bytes → size), the async pipeline (convert → extract → classify → chunk → embed → store), deterministic classifier, signed download URLs.
*E2E gate:* upload a valid PDF → pipeline runs to READY; upload `.exe` renamed `.pdf` → 422 `FILE_TYPE_NOT_ALLOWED` (magic bytes); 51MB file → 422 `FILE_TOO_LARGE`; download URL is signed and 15-min-expiring; a scanned no-text PDF → FAILED with a human-readable error.

**Module 5 · Chat (RAG)** — depends on: Documents
Query embed, pre-filtered vector search (0.70 threshold, 6k token budget), SSE token stream, citations, the no-hallucination fallback, matter-notes + communications in context.
*E2E gate:* question answerable from a document → cited answer; question with no relevant chunks → the exact deterministic fallback string, and Anthropic is never called; vector search scoped to transaction A returns zero of transaction B's chunks (firm isolation).

**Module 6 · Deadlines** — depends on: Documents
Extraction (staged PENDING_REVIEW), amendment superseding, confirmation flow, urgency calculator, tiered alerts, .ics download.
*E2E gate:* upload contract → deadlines extracted as PENDING_REVIEW; confirm → ACTIVE; amendment supersedes without deleting the old deadline (chain intact); alert fires once per urgency tier, not twice.

**Module M1 · TREC Deadline Engine** — depends on: Deadlines
Pure `computeDeadline()` with Texas counting rules, holidays table, the earnest-money-rolls / option-fee-doesn't divergence. See `12-moat-features.md`.
*E2E gate:* the test suite covering every Texas holiday, leap years, and the earnest-money vs option-fee divergence on the same weekend — this suite *is* the deliverable.

> **M1 ships with Module 6, in slice 3 — it is not deferred to the moat tier.** Slice 3's Playwright gate (`00-developer-guide.md` §7) requires the earnest-money vs option-fee weekend divergence to render as two different dates, each explained. That gate is unpassable without the engine, so the slice cannot close without it. M2 (wire fraud) genuinely is post-core; M1 is not.

**Module 7 · Drafts** — depends on: Transactions
Async section-by-section generation, the seven types, review + attestation, PDF download. The Opinion 705 gate.
*E2E gate:* generate → GENERATING → READY via worker; approve without reviewing all sections → 422 `DRAFT_SECTIONS_NOT_REVIEWED`; approve with attestation → stored verbatim; no code path sets `sent_at` before `approved_at`.

### Lead & case-management tier

**Module 8 · Leads** — depends on: Transactions
Public intake (rate-limited, dup-prevented), conflict check, assignment, conversion.
*E2E gate:* duplicate idempotency key → one lead, second returns `isDuplicate:true`; matching party name → `conflict_check_status FLAGGED`; convert a FLAGGED lead before review → 422; 11th submission from an IP in an hour → 429.

**Module 8A · Matter Notes** — depends on: Transactions
Immutable timestamped journal; feeds chat context.
*E2E gate:* create → appears newest-first; immutable (no update endpoint); OWNER soft-delete works; last 10 notes appear in chat context.

**Module 8B · Communication Log** — depends on: Transactions
Quick-add call/email/meeting log, free-text contact name; feeds chat context.
*E2E gate:* create → appears newest-first by `occurred_at`; last 14 days appear in chat context; OWNER soft-delete works.

**Module 8C · Document Checklist** — depends on: Documents
Auto-populated per transaction type, auto-checked on matching upload.
*E2E gate:* create PURCHASE transaction → default checklist populated; upload a TITLE_COMMITMENT → the title-commitment item auto-flips to RECEIVED with the document linked; system items can't be deleted, only WAIVED/NOT_APPLICABLE.

**Module 8D · Business Operations** — depends on: Transactions
Tasks, time tracking (invoiced = locked), invoicing (PDF from entries), and the morning dashboard aggregation.
*E2E gate:* invoiced time entry → edit/delete returns 422 `ENTRY_ALREADY_INVOICED`; invoice creation locks its entries transactionally; `GET /v1/dashboard` returns the four aggregates scoped correctly to the requesting user.

### Infrastructure tier — woven through, proven at the edges

**Module 9 · Notifications** — depends on: Auth · deadlines/leads/drafts emit events
Resend + React Email, centralized `NotificationService`, no module sends email directly.
*E2E gate:* a deadline alert enqueues and "sends" (mocked Resend) with the right template and recipient; failures land in Sentry, not a crash.

**Module 10 · Client Portal** — depends on: Transactions · Documents
Signed-token access, read-only status page, revocation.
*E2E gate:* valid token → correct shape, only client-visible documents; wrong/expired/revoked token → 404 (never 401/403, never reveals existence); revoke → immediate denial.

**Module 11 · Real-Time (SSE)** — depends on: Documents · Chat
Global event stream, document stream, chat stream; heartbeat; snapshot-on-reconnect.
*E2E gate:* document upload pushes a `document.status` event to a connected client; reconnect gets a snapshot, not a replay; heartbeat interval cleans up on disconnect (no leaked intervals).

**Module 12 · Queues** — depends on: Documents · Drafts
BullMQ registration, processors, graceful shutdown, stalled-job detection.
*E2E gate:* SIGTERM mid-job → the job finishes, no new jobs picked up, clean Redis disconnect, nothing stranded in PROCESSING.

**Module 13 · Caching** — depends on: Auth · Transactions
User hydration cache, transaction summary cache, embedding cache; bust-after-write.
*E2E gate:* deactivating a user busts the cache within TTL and the next request is 401; a transaction update busts its summary cache.

**Module 14 · Security** — cross-cutting, proven per module
Magic bytes, Redis rate limiting, PII masking, Helmet, input length limits, storage rules.
*E2E gate:* rate limit returns 429 with `retryAfter`; logs never contain PII; length limits return 422 at the pipe before the service runs.

### Moat tier — after Phase 1 core is fully E2E-green

*(M1 · TREC Deadline Engine is listed with Module 6 above — it ships in slice 3, not here.)*

**Module M2 · Wire-Fraud Verification** — depends on: Documents · Communications
Verified-instructions baseline, mismatch detection, block-and-confirm, audit trail. See `12-moat-features.md`.
*E2E gate:* verify a baseline → upload matching instructions → no flag; upload differing instructions → `MISMATCH` flag + CRITICAL alert; unverified instructions → `NO_BASELINE` flag; every flag writes an immutable audit row.

---

## Part 4 — The PR Review Checklist

Every backend PR is reviewed against this. If any box fails, the PR doesn't merge.

- [ ] **Layering** — controller has no business logic; service has no DB access; repository has no business rules
- [ ] **Boundary** — no module imports another module's repository, and no repository appears in a module's `exports` array
- [ ] **Framework conventions** — nothing off the banned list in `18-nestjs-conventions.md`: no `class-validator`, no `Scope.REQUEST`, no `app.useGlobalFilters()`, no in-memory cache or rate limit, no unexplained `forwardRef()`, no `process.env` outside `env.validation.ts`
- [ ] **Migration** — any data-shape change has a migration committed with it
- [ ] **Tests** — unit + integration + **E2E** present; the negative cases are tested, not just the happy path
- [ ] **E2E gate** — the module's E2E test actually passes in CI
- [ ] **Errors** — standard envelope, typed code, no stack trace to the client
- [ ] **Compliance** — AI paths obey Opinion 705 (no auto-send, staged review, fallback on empty context)
- [ ] **Hygiene** — no secrets, no PII in logs, no `console.log`, lint + typecheck green
- [ ] **Scope** — PR is one module or one feature; it's reviewable in one sitting

---

## Part 5 — Quick Reference

| Need | Go to |
|---|---|
| The module I'm building and its E2E gate | This doc, Part 3 |
| The checklist items to tick | `05-backend-checklist.md` |
| Data shape / source of truth | `03-schema.md` |
| Why a module exists | `14-module-notes.md` |
| How to wire it in NestJS | `18-nestjs-conventions.md` |
| How to write the tests | `10-tdd-guide.md` |
| Test fixtures + seed data | `11-test-data.md` |
| AI prompt content | `08-prompts.md` |
| Full backend reference | `05-backend-checklist.md` + `04-data-contracts.md` |
| Access / time capture / search / messaging | `13-adoption-features.md` |
| Frontend data flow & state | `06-frontend-architecture.md` |
| Setup / env / commands | `00-developer-guide.md` |
| The two moat modules | `12-moat-features.md` |

**When docs disagree:** schema wins for data shape, checklist wins for behavior, and you flag the drift to the lead.

---

*Build one module. Prove it end-to-end. Then the next. The E2E suite you accumulate is the thing that lets you move fast without breaking what's below you.*
