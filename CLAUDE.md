# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This file is the standing rules — how to build.** Project context (what CounselOS is, what's decided, why) lives in `memory/Context.md`, and working preferences in `memory/Memory.md`. Don't duplicate those here; this file is the rulebook.

---

## Current State of This Repo

**The workspace is scaffolded and verified** (2026-08-15). `pnpm install` / `lint` / `typecheck` / `build` all pass, and `GET /v1/health` returns `{"status":"ok"}` against a live boot. What exists: pnpm catalog + turbo, `packages/config`, `packages/shared` (9 enum files, error codes, SSE events, limits), `apps/api` (CoreModule / AppModule / WorkerModule, both entrypoints, the `DRIZZLE` token, env validation, health module, 3-project jest config), `apps/web` (Next shell).

**`apps/api/src/database/schema.ts` currently contains enums only — no tables.** This is deliberate. Tables land in one pass, reading `docs/03-schema.md` alongside `docs/16-compliance-gaps.md`, because the columns that can't be honestly backfilled must exist in the first migration. **Do not add tables piecemeal as modules need them.** This is the next task before any module work.

**Not yet real:** the Supabase project (placeholder `SUPABASE_*` values in `apps/api/.env`) and every external API key. Nothing in Module 1 needs them; Module 2 (Auth) does.

Practical consequence, still in force: **never claim a file, table, endpoint, or command exists because this doc or a spec doc mentions it.** Check the filesystem. The docs describe the target design, not the current tree.

---

## What This Project Is

CounselOS is an AI-native case management platform for **one real estate law firm in Austin, Texas** (Phase 1). Backend is a **NestJS modular monolith** running as **two processes** (HTTP server + BullMQ worker) against **PostgreSQL + pgvector** via Supabase. Frontend is **Next.js (App Router)**. Guiding principle: **case management first, AI second** — the operational spine is the product; AI amplifies it.

Phase 1 is single-firm. No multi-tenancy, billing tiers, or onboarding in scope. `firm_id` is handled server-side.

Full product context, the four AI features, the data model, and the decision history: `memory/Context.md`.

---

## Architecture Rules — Never Violate

1. **Layering: Controller → Service → Repository.** Controller is HTTP only (routes, DTO validation, no business logic). Service holds business rules and has **no direct database access**. Repository holds Drizzle queries and **no business logic**.
2. **Module boundary: a module may import another module's *service*, never another module's *repository*.** Cross-module data access goes through the owning service. This is the one rule that is architecture rather than convention — it's what makes modules extractable in Phase 2. **Enforced mechanically:** a repository never appears in a module's `exports` array (violation = bootstrap crash), backed by an ESLint `no-restricted-imports` rule in `packages/config/eslint/nest.js`.
3. **`instrument.ts` is the first import in `main.ts` and `worker.ts`** — Sentry must initialize before NestJS or bootstrap errors are lost.
4. **Two processes, three module graphs.** `CoreModule` (config, DB, Redis, logger, CLS) is imported by both; `AppModule` → `main.ts`, `WorkerModule` → `worker.ts`. The worker bootstraps with `NestFactory.createApplicationContext()`, never `create()`. Anything stateful — rate limits, caches, SSE fan-out — must be **Redis-backed, never in-memory**; in-memory state is wrong by construction with two processes.
5. **`rediss://`, not `redis://`.** TLS required outside development; `validateEnvVars()` enforces it, along with `sslmode=require` on `DATABASE_URL`.
6. **Soft delete on legal data.** Never a hard `DELETE`. Every list query filters `deleted_at IS NULL` via the `notDeleted` helper.
7. **Graceful shutdown on the worker** (`OnApplicationShutdown`) — without it, documents strand in `PROCESSING` when Railway kills the process. It **only fires if `worker.ts` calls `app.enableShutdownHooks()`**.
8. **Globals register as providers** (`APP_GUARD`, `APP_INTERCEPTOR`, `APP_PIPE`, `APP_FILTER`), never `app.useGlobal*()` — a filter built outside the DI container cannot inject Sentry or the correlation ID. Registration order is execution order.
9. **No request-scoped providers.** `Scope.REQUEST` rebuilds the injection chain per request and doesn't exist in the worker. Per-request context is AsyncLocalStorage (`nestjs-cls`); job payloads carry the correlation ID across the Redis boundary.
10. **`SseService` fans out through Redis pub/sub in Phase 1** — the worker produces `document.ready` / `draft.ready` / deadline alerts, the HTTP process holds the EventSource connections. An in-memory `Subject` works locally and delivers nothing on Railway.
11. **The `/v1` prefix comes from `setGlobalPrefix('v1')` alone — never also call `enableVersioning()`.** URI versioning adds its own `v1` segment, so using both silently serves everything at `/v1/v1/...` while Nest logs the route as `/v1/health (version: 1)`, which looks correct. There is no `exclude` list: health lives at `/v1/health`, one documented URL, and Railway's healthcheck path points there.

Full detail and the banned list: `docs/18-nestjs-conventions.md`. Read it before writing any NestJS wiring.

### Every module has the same shape

```
modules/<name>/
├── <name>.module.ts
├── <name>.controller.ts     # HTTP only, no logic
├── <name>.service.ts        # business rules, no DB
├── <name>.repository.ts     # Drizzle only, no rules
├── dto/                     # Zod schemas + inferred types
├── constants/               # e.g. status-transition maps
└── __tests__/               # unit + integration + e2e, beside the code
```

Modules with extra structure: `documents/` (classifiers, processors, validators, `chunks.repository.ts`), `deadlines/` (extraction, superseding, urgency calculator, ics, schedulers), `queues/` (processors). `dashboard/` owns no table — it is pure aggregation over other modules' services. `health/` also owns no table, for the different reason that a liveness probe has no business rules.

No `utils/`, `helpers/`, or `services/` folder outside modules. No hand-written `types/` folder — contract types live in `packages/shared`, entity types are inferred (`typeof transactions.$inferSelect`).

---

## Data & Types

- **`apps/api/src/database/schema.ts` is the single source of truth for data shape.** Never hand-write an entity type; infer it.
- **Enums, error codes, SSE event types, field limits, and shared Zod schemas live in `packages/shared`.** Both apps import them, so they cannot drift. Never redefine one locally.
- **Any data-shape change ships with a migration.** drizzle-kit generates; HNSW and partial-unique indexes are hand-written SQL migrations.
- **DTOs are Zod schemas with inferred types** — validation, typing, and OpenAPI from one definition. Canonical schema in `packages/shared`, wrapped by `createZodDto()` from `nestjs-zod` so controllers and Swagger reference the same object. **`class-validator` and `class-transformer` are never installed.**
- **`process.env` is read in exactly three files:** `instrument.ts` (runs before DI exists), `config/env.validation.ts` (owns the environment boundary), and `drizzle.config.ts` (runs outside Nest entirely). Everything else goes through `ConfigService`. ESLint enforces this.

## Error Handling

- Success envelope: `{ success: true, data, meta? }`. Error envelope: `{ success: false, error: { code, message, details, requestId } }`.
- **The frontend switches on `error.code` (a typed constant), never on `message`.** Changing a message is free; changing a code is a breaking change.
- Validation failures return **422 at the Zod pipe**, before the service runs, with field-level `details`.
- Unknown errors return `INTERNAL_ERROR` with zero internal detail — never a stack trace, SQL, or internal field name to a client. Full detail goes to Sentry with the correlation ID.
- No raw `HttpException` from service code; no empty catch blocks.

---

## AI Rules (legal compliance — not optional)

These implement Texas State Bar Opinion 705. Full detail in `docs/09-legal-compliance.md`; load it when touching any AI path.

- **The AI never auto-sends or auto-confirms anything.** Extracted deadlines stage as `PENDING_REVIEW`. Drafts require per-section review plus a stored attestation before approval. No code path sets `sent_at` before `approved_at`.
- **Chat returns the deterministic fallback when no chunks clear the 0.70 similarity threshold.** Never call Claude with empty context and let it guess — a confident wrong answer is a malpractice risk.
- **Never fake a working integration.** `not_configured` is a first-class state for any external dependency (Anthropic, Voyage, Resend, storage), never disguised as an error or as working. Never render a spinner for a service known to be down — render a disabled state with a plain explanation. Partial outages never block the whole app. A blank optional key in `.env` means *off*, not *broken* — `blankAsUnset()` in `env.validation.ts` is what makes that true.
- **AI-generated content is flagged** (`was_ai_assisted`, the AI-teal marker in the UI). Attorneys must always know what came from the machine.
- **Prompts are canonical and versioned** in `docs/08-prompts.md` and live in `apps/api/src/common/prompts/`. Never inline a system prompt in a service.
- **The document classifier is deterministic** (keyword scoring, ~1ms, zero AI). Do not replace it with an LLM call.
- **Claude's arithmetic is never trusted.** The deterministic Texas business-day engine sits between any extracted date and the stored one.

## Security Rules

- **Never trust `Content-Type`.** Upload validation is three gates in order: MIME whitelist → magic bytes → size.
- **Rate limiting and caching are Redis-backed** — per-user on authenticated routes, per-IP on public ones.
- **Never log PII or response bodies.** Names, emails, phones mask to `[REDACTED]`. Sentry runs `sendDefaultPii: false` with request bodies and cookies stripped in `beforeSend`.
- **The Supabase service key is scoped to two modules only** (Auth, Storage). Do not import it elsewhere.
- **Client portal tokens:** store only the SHA-256 hash, never the raw token. Any access failure returns **404**, never 401/403 — never reveal that a transaction exists.
- **Field limits enforce at the Zod pipe** (chat 4,000 chars, draft instructions 2,000, matter notes 2,000, communication summary 500) — a 422 before anything reaches the service.

---

## How We Build

**One module at a time, in dependency order, each gated by an end-to-end test.** A module is not done until its E2E test passes against the real HTTP stack. The module order, each module's dependencies, and each module's specific E2E gate are in `docs/01-codebase.md` Part 3 — that is the authoritative process doc.

The loop for every module:

1. Read the module's checklist section in `docs/05-backend-checklist.md` + its tables in `schema.ts`
2. **Write the E2E test first** — it is the gate and the spec
3. Build controller → service → repository → dto, in that order
4. Unit-test deterministic logic; integration-test DB/queue paths
5. Make the E2E test pass, **including the negative cases**
6. Small, module-scoped PR

**When asked to build a module or slice, default to writing its test first.**

### Two E2E layers

- **API E2E** (supertest, `apps/api`) gates a **module** — real HTTP stack, real JWT.
- **Browser E2E** (Playwright, `apps/web/e2e`) gates a **slice** — real browser, real UI, real backend.

We build in **vertical slices**: a feature's backend and frontend together, then Playwright-tested. Slice order and each slice's Playwright gate are in `docs/00-developer-guide.md` §7. Slice 0 (foundation) ships completely before slice 1 starts.

### Test tiers

| Tier | Filename | Runs against | Proves |
|---|---|---|---|
| Unit | `*.spec.ts` | Nothing (mocked repo) | Deterministic logic: transitions, urgency tiers, TREC date math, token budget, magic bytes |
| Integration | `*.repository.spec.ts` | Real Postgres + Redis (testcontainers), mocked external APIs | DB queries, queue jobs, cache behavior, soft-delete filters |
| E2E | `*.e2e-spec.ts` | Full HTTP stack + real JWT, mocked externals only | The module works through the real request lifecycle |

Selected with `jest --selectProjects <unit|integration|e2e>`; see `apps/api/jest.config.ts`.

**Mock only the true externals: Anthropic, Voyage AI, Resend, Supabase Auth.** Never mock our own database, queue, or services in an E2E test.

**Always test the negative cases:** invalid input → 422, wrong role → 403, expired token → 401, not-found → 404, invalid state transition → 422. A PR without negative-case tests is incomplete.

### Playwright rules

- **Add `data-testid` in the same commit as the component.** Convention `{domain}-{element}-{action?}`, kebab-case (`deadline-confirm-btn`). Never select on text content or CSS classes.
- **Import seeded IDs from the seed module.** Never hardcode a UUID; never click through the UI to find a fixture.
- **Don't log in inside a test** — auth comes from `storageState` per role; the login flow itself is tested once, in slice 0.
- **AI is mocked in CI** (`E2E_MOCK_AI=true`). Never assert on live model output.
- **Pin the clock** with `page.clock.setFixedTime()` in any test asserting deadline urgency.

---

## Frontend Architecture

Full detail in `docs/06-frontend-architecture.md`. The load-bearing decisions:

- **Server data lives in SWR and only SWR.** Zustand holds two stores of ephemeral state only (`auth.store.ts`, `realtime.store.ts`). No transaction store, no document store, no cached server entities in Zustand.
- **The SWR key IS the literal API path**, built only in `lib/api/queryKeys.ts`.
- **Invalidation is declared on the mutation**, in `lib/api/mutations.ts` — not at the call site.
- **SSE events invalidate SWR keys; they do not patch state.** The one exception is `document.status`, which patches in place with `revalidate: false` because it fires many times per document. Never trust an event payload as truth.
- **`apiFetch` owns the entire auth lifecycle** with **single-flight refresh**. `USER_INACTIVE` routes to `/auth/deactivated`, not login. `bumpTokenVersion()` after refresh is what re-establishes the SSE connection (EventSource can't set headers, so the token is in the URL and `tokenVersion` is a load-bearing effect dependency).
- **Access token lives in memory in the Zustand auth store — never localStorage.**
- **Default to client components.** Exceptions: static chrome, and `(client)/status/[id]`, which is server-rendered so the token never touches client JS.
- **Optimistic updates only for creates on a list the user is currently watching** (communication, note, task, time entry). Never for status transitions, deadline confirm, draft approval, invoicing, or lead conversion.
- Route groups `(attorney)` and `(client)` are two different products sharing one deploy — different layouts, auth, and visual language.

Visual design: `docs/07-design-handoff.md` + `docs/design-system-v5.html` (Design System v5 "Paper & Ink" tokens → `styles/globals.css`).

---

## Commands

Node 24 LTS (`.nvmrc` — run `nvm use`), pnpm workspaces + turbo, TypeScript pinned at 5.9.3.

```bash
pnpm dev                        # api + worker + web (turbo, parallel)
pnpm --filter @counselos/api dev # api + worker only
pnpm --filter @counselos/web dev # web only

pnpm services:up                # docker compose: local Postgres + Redis
pnpm db:generate                # drizzle-kit: generate migration from schema.ts
pnpm db:migrate                 # apply pending migrations
pnpm db:seed                    # load the 5 Austin test fixtures
pnpm db:reset                   # truncate + reseed — run before Playwright
pnpm db:studio                  # Drizzle Studio

pnpm --filter @counselos/api test:unit   # fast, no I/O
pnpm --filter @counselos/api test:int    # integration (testcontainers — needs Docker)
pnpm --filter @counselos/api test:e2e    # API E2E — the module gate
pnpm --filter @counselos/web test:e2e    # Playwright — the slice gate

pnpm lint && pnpm typecheck     # must be green before any PR
pnpm build
```

API on `:3001`, web on `:3000`. Smoke test: `curl http://localhost:3001/v1/health` → `{"status":"ok"}`.

**Local Docker ports are non-standard: Postgres `5434`, Redis `6381`**, set via `POSTGRES_PORT` / `REDIS_PORT` in a gitignored root `.env`. The defaults are taken by other projects on this machine that must not be stopped. `DATABASE_URL` and `REDIS_URL` in `apps/api/.env` point at those ports.

Env vars are listed in `docs/00-developer-guide.md` §4, `apps/api/.env.example`, and `docs/11-test-data.md`. `validateEnvVars()` runs at boot and **fails fast, reporting every problem at once** — a missing env var must never surface as a runtime error three requests deep.

---

## Which Docs to Load for a Task

Docs are in `docs/`, numbered for reading order. **Don't load everything — several are very large** (`05-backend-checklist.md` is ~2,500 lines, `03-schema.md` ~2,000, `design-system-v5.html` ~350KB). Load by task:

| Task | Load |
|---|---|
| Any backend module | that module's section of `05-backend-checklist.md` + its tables in `03-schema.md` |
| The process / a module's E2E gate | `01-codebase.md` (Part 3) |
| Slice order / setup / commands | `00-developer-guide.md` |
| File placement | `02-repo-structure.md` |
| An AI module (chat, deadlines, drafts) | also `08-prompts.md` + `09-legal-compliance.md` |
| A moat module (wire fraud, TREC engine) | also `12-moat-features.md` |
| Access control, time capture, search, client messaging, CSV import | `13-adoption-features.md` |
| Tests / seeds | `10-tdd-guide.md` + `11-test-data.md` |
| Frontend | `06-frontend-architecture.md`, then `07-design-handoff.md` + `design-system-v5.html` |
| Why a module exists / NestJS vocabulary | `14-module-notes.md` |
| **Any NestJS wiring** — a module, provider, guard, pipe, filter, the worker, a test seam | `18-nestjs-conventions.md` |
| Columns that can't be backfilled later, TDPSA | `16-compliance-gaps.md` |
| Product/market framing, Phase 2 boundary | `15-project-context.md`, `17-ai-principles.md` |

`memory/` is a sibling of `docs/`, not part of it: `Instructions.md` (how to work on this project), `Context.md` (what the project is and what's decided), `Memory.md` (running log of preferences and decisions).

---

## When Things Conflict

The docs are a spec set written over time and they contain known drift. Resolution rules:

- **Schema wins for data shape; the checklist wins for behavior.** Flag the drift rather than silently picking one.
- **A doc references an endpoint, table, or field that isn't in the schema:** trust the schema and say so. **Do not invent a table or column to satisfy a doc.**
- **Never write a cross-reference to content that doesn't exist yet.** A doc pointing at a section that was never written has already caused two real bugs here. `/gap-check` exists to catch these.
- **Known drift, already identified:** `04-data-contracts.md` and `10-tdd-guide.md` predate the Drizzle decision and still reference **Prisma** (and R2 for storage) — the stack is **Drizzle + Supabase Storage**. `10-tdd-guide.md`'s Jest config also uses `*.unit.spec.ts` / `*.integration.spec.ts`, while `01-codebase.md`, `02-repo-structure.md`, and the live `jest.config.ts` use `<name>.spec.ts` / `<name>.repository.spec.ts` / `<name>.e2e-spec.ts` — the latter is the intended convention.
- **Docs change in the same PR as the code they describe.** A schema change without an `03-schema.md` update is an incomplete PR. `docs/README.md` is the index and the ships/doesn't-ship list.

---

## What NOT to Do

- Don't put business logic in controllers or SQL in services.
- Don't import another module's repository.
- Don't invent endpoints, tables, or fields that aren't in the schema/checklist.
- Don't add tables to `schema.ts` piecemeal — they land in one pass against `03-schema.md` + `16-compliance-gaps.md`.
- Don't inline system prompts — they live in `src/common/prompts/`.
- Don't replace the deterministic classifier with an LLM call.
- Don't let the AI auto-send, auto-confirm, or answer chat from empty context.
- Don't use in-memory state for rate limits, caches, or SSE fan-out.
- Don't call `app.enableVersioning()` — `setGlobalPrefix('v1')` already owns the prefix.
- Don't reach for `Scope.REQUEST`, `class-validator`, `app.useGlobalFilters()`, or an unexplained `forwardRef()` — each has a specified replacement in `18-nestjs-conventions.md`.
- Don't log PII or leak stack traces.
- Don't write a module without its E2E test.
- Don't open a PR spanning multiple modules — one module or one feature, reviewable in one sitting.

---

## Git & PR Conventions

- **The user runs `git commit` and `git push` themselves.** Stage changes and suggest a commit message; don't commit or push unless explicitly asked in that message.
- **Branches:** `slice-1/transaction-status-transitions`, `fix/deadline-urgency-boundary`.
- **Commits:** conventional — `feat(deadlines): add TREC business-day calculator`.
- **Every PR passes** lint, typecheck, and the full suite in CI before merge.
- **Review checklist:** layering intact · no cross-module repository import · migration committed with any data-shape change · unit + integration + E2E present with negative cases · E2E gate actually passing · standard error envelope with typed code · AI paths obey Opinion 705 · no secrets, no PII in logs, no `console.log` · scope is one module or one feature.
