# CounselOS — Developer Guide (START HERE)
### Day-One Runbook for the Engineering Team

> This is the first document you read. It gets you from a fresh machine to a running backend, tells you where everything lives, and defines how we work. The deep specs are linked throughout — this doc is the map, not the territory.

---

## 0. The 60-Second Orientation

CounselOS is an **AI-native case management platform for one real estate law firm in Austin** (Phase 1). Backend is a **NestJS modular monolith** running as **two processes** (HTTP server + BullMQ worker) against **Postgres + pgvector** via Supabase. Frontend is **Next.js (App Router)**. We build **case management first, AI second** — the operational spine is the product; AI amplifies it.

**The one rule that matters most:** modules import each other's **services**, never their **repositories**. Everything else is convention. That one is architecture.

---

## 1. The Documentation Map

> In the repo these live in `docs/` with numeric prefixes (`03-schema.md`, `05-backend-checklist.md`, …). Full index and the ships/doesn't-ship split: `docs/README.md`.


You do not read all 19 docs. You read what your task needs. Here's the map:

| If you're… | Read |
|---|---|
| Starting on day one | **This doc**, then `14-module-notes.md` |
| Building any backend layer | `05-backend-checklist.md` + `03-schema.md` |
| Working on the database | `03-schema.md` |
| Writing an AI feature | `08-prompts.md` |
| Understanding a module's purpose | `14-module-notes.md` |
| Confirming file placement | `02-repo-structure.md` |
| Writing tests | `10-tdd-guide.md` |
| Seeding / testing with data | `11-test-data.md` |
| Anything AI + legal | `09-legal-compliance.md` |
| Building the two moat features | `12-moat-features.md` |
| Access, time capture, search, messaging, import | `13-adoption-features.md` |
| Frontend architecture (data flow, state, SSE) | `06-frontend-architecture.md` |
| Frontend visual design | `07-design-handoff.md` + `design-system-v5.html` |
| The build checklist to work through | `05-backend-checklist.md` |

**Rule of thumb:** the checklist is your task list, `FullBackend.md` is your reference, the schema is your source of truth for data. When they disagree, the schema wins for data shape and the checklist wins for behavior — and you flag the drift.

---

## 2. Prerequisites

Install before you start:

- **Node.js 24 LTS** ("Krypton") — `.nvmrc` pins it, run `nvm use`. *Changed from Node 20, which reached end-of-life; 24 and 22 are the active LTS lines. `@types/node` tracks 24 deliberately rather than npm's `latest`, which follows Node current.*
- **pnpm** (`npm i -g pnpm`) — we use pnpm workspaces, not npm
- **Docker** — required, not optional. Testcontainers boots real Postgres and Redis for the integration and E2E tiers, so **every module's E2E gate needs it from Module 1 onward**. `docker-compose.yml` also gives you local dev services. On WSL2: install Docker Desktop on Windows, then enable **Settings → Resources → WSL Integration** for your distro, or `docker` won't resolve inside WSL.
- **Git**
- A **Supabase account** (free tier) for the shared dev project
- An **Anthropic API key**, a **Voyage AI key**, an **Upstash Redis** URL, and a **Resend** key — ask the lead for the shared dev credentials

---

## 3. First-Run Setup

```bash
# 1. Clone and enter
git clone <repo-url> counselos && cd counselos

# 2. Use the pinned Node version
nvm use

# 3. Install all workspaces (api, web, shared)
pnpm install

# 4. Start local Postgres (pgvector) + Redis
docker compose up -d
docker compose ps            # both must read "healthy" before step 7

# 5. Copy env templates — NEVER commit the filled versions
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 6. Fill apps/api/.env with the shared dev credentials (see §4)

# 7. Run migrations against your dev database
pnpm --filter api db:migrate

# 8. Seed the Austin test fixtures (5 transactions + documents)
pnpm --filter api db:seed

# 9. Start everything (HTTP server + worker + web, parallel via turbo)
pnpm dev
```

**Step 4 is optional if you point `DATABASE_URL` and `REDIS_URL` at the hosted Supabase and Upstash dev instances instead.** Local is the default because it's faster, works offline, and doesn't spend the shared free-tier budgets. Two things differ from hosted, and env validation accounts for both:

| | Local (compose) | Hosted (Supabase / Upstash) |
|---|---|---|
| Postgres TLS | `?sslmode=disable` | `?sslmode=require` |
| Redis scheme | `redis://localhost:6379` | `rediss://` — **TLS required** |

`validateEnvVars()` enforces `rediss://` and `sslmode=require` whenever `NODE_ENV !== 'development'`, and permits the plain-scheme localhost forms only in development. That keeps the non-negotiable intact in every environment that matters without making local dev generate certificates.

Auth and Storage always come from the hosted Supabase project — compose doesn't replace those. If you want the full stack locally, use the Supabase CLI (`supabase start`) instead of the `postgres` service.

If step 9 succeeds you'll have:
- API on `http://localhost:3001`
- Web on `http://localhost:3000`
- The BullMQ worker attached and logging

**Smoke test:** `curl http://localhost:3001/v1/health` should return `{ "status": "ok" }`.

---

## 4. Environment Variables

Full annotated list lives in `11-test-data.md`. The essentials in `apps/api/.env`:

```bash
# Supabase (DB + auth + storage — one platform)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=          # scoped to 2 modules only — never import elsewhere
SUPABASE_STORAGE_BUCKET=documents
DATABASE_URL=                 # postgres://... must include ?sslmode=require

# Redis (Upstash) — note the double-s, TLS required
REDIS_URL=                    # rediss:// NOT redis://

# AI
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=               # voyage-law-2 embeddings

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Observability
SENTRY_DSN=

# Security — generate with: openssl rand -base64 32
JWT_SECRET=
HMAC_SECRET=                  # signs client-portal tokens

# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000
CLIENT_PORTAL_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
FIRM_ID=                      # the single Phase-1 firm UUID
```

`validateEnvVars()` runs at boot and **fails fast** if any required var is missing. A missing env var should never surface as a runtime error three requests deep.

---

## 5. Everyday Commands

```bash
pnpm dev                       # run api + worker + web in parallel
pnpm --filter api dev          # api + worker only
pnpm --filter web dev          # web only

pnpm --filter api db:generate  # drizzle-kit: generate migration from schema.ts
pnpm --filter api db:migrate   # apply pending migrations
pnpm --filter api db:seed      # load Austin test fixtures
pnpm --filter api db:studio    # Drizzle Studio — inspect the DB visually

pnpm test                      # all tests
pnpm --filter api test:unit    # fast, no I/O
pnpm --filter api test:int     # integration — spins up testcontainers
pnpm --filter api test:e2e     # full HTTP stack

pnpm lint                      # eslint across workspaces
pnpm typecheck                 # tsc --noEmit everywhere
pnpm build                     # production build
```

---

## 6. Where Things Live

Full tree is in `02-repo-structure.md`. The shape you need in your head:

```
counselos/
├── apps/
│   ├── api/src/
│   │   ├── main.ts              # HTTP entrypoint (instrument.ts imported FIRST)
│   │   ├── worker.ts            # BullMQ worker entrypoint
│   │   ├── database/schema.ts   # THE source of truth for data
│   │   ├── common/              # guards, filters, pipes, prompts
│   │   └── modules/             # one folder per domain
│   └── web/src/
│       ├── app/(attorney)/      # authed dashboard
│       ├── app/(client)/        # signed-token status page
│       ├── lib/ stores/ components/
├── packages/shared/             # enums, error codes, types — the sync contract
└── docs/                        # the 19 spec docs
```

**Every backend module has the same shape:**
```
modules/<name>/
├── <name>.module.ts
├── <name>.controller.ts    # HTTP only — no logic
├── <name>.service.ts       # business logic — no DB access
├── <name>.repository.ts    # Drizzle queries — no business logic
├── dto/                    # Zod schemas + inferred types
└── __tests__/              # unit + integration + e2e beside the code
```

Controller → Service → Repository. No shortcuts. The controller never touches Drizzle; the repository never holds business rules.

---

## 7. Build Order — Vertical Slices (Where to Start Tomorrow)

We do **not** build all backend then all frontend. Each **slice** is a feature's backend *and* frontend built together, gated by a Playwright test. That's the only shape where browser E2E accrues continuously instead of arriving all at once at the end.

Process detail is in `01-codebase.md`. This is the order and the gate for each.

**Slice 0 — Foundation.** Backend L1 + L2 + 8G access guard + 8L `/v1/health/services`. Frontend shell: layouts, route groups, `apiFetch` with single-flight refresh, both Zustand stores, design primitives off the v5 tokens. Demo seed working.
*Gate:* login → dashboard · expired token silently refreshes · deactivated user lands on `/auth/deactivated` · paralegal denied an unassigned matter sees the **explaining** error, not a bare 403.

**Slice 1 — Transactions.** L3 + pipeline + detail shell with tab nav.
*Gate:* create → appears in the right pipeline column → open detail → change status → invalid transition blocked with a visible reason.

**Slice 2 — Documents.** L4 + upload UI. Brings in queues (L12) and SSE (L11) — first feature that needs them. Adds Voyage + storage to the health probe.
*Gate:* drag-drop upload → status advances live to READY → download works · renamed `.exe` rejected with a visible error.

**Slice 3 — Deadlines.** L6 + M1 TREC engine + deadline UI. Brings in notifications (L9) and adds Resend to the health probe.
*Gate:* upload contract → deadlines staged → confirm → appears on dashboard **with its calculation note visible** · earnest-money vs option-fee weekend divergence renders two different dates, each explained.

**Slice 4 — Case management.** 8A notes + 8B communications + 8C checklist.
*Gate:* log a communication in under ten seconds from the transaction page, **and on a mobile viewport** · upload a title commitment → checklist item auto-checks.

**Slice 5 — Chat.** L5 + streaming UI. Adds Anthropic to the health probe.
*Gate:* ask a question → tokens stream → citations land after completion · ask something absent from all documents → the fallback renders, never a fabricated answer.

**Slice 6 — Drafts.** L7 + section review + attestation.
*Gate:* generate → each section reviewable → approve disabled until all reviewed → attestation modal → approved. The Opinion 705 gate, proven in a browser.

**Slice 7 — Business operations.** 8D tasks/time/invoicing + 8H passive capture + morning dashboard.
*Gate:* dashboard shows deadlines, tasks, overdue, stale · suggested time entries render and confirm in a batch · an invoiced entry is visibly read-only.

**Slice 8 — Leads.** L8 + conflict check.
*Gate:* submit the public intake form → lead appears flagged → conversion blocked until an attorney clears the conflict.

**Slice 9 — Client portal.** L10 + 8J two-way messaging.
*Gate:* signed-token URL opens the status page · a bad token shows the generic not-found · client sends a message → attorney sees it and it lands in the communication log.

**Slice 10 — Wire-fraud verification.** M2.
*Gate:* verify a baseline → upload the fraudulent instructions → CRITICAL block-and-confirm appears. The best demo moment in the product.

**Slice 11 — Search, palette, import.** 8I + 8I-2 command palette + 8K CSV import.
*Gate:* ⌘K opens from anywhere, finds a transaction by property address, Enter navigates · search returns results across communications, notes, and documents, respecting matter access.

**Two things that are woven, not sliced.** Service honesty (8L) ships its endpoint in slice 0, then each slice adds its own dependency to the probe and its disabled-state UI. Caching (L13), security (L14), and observability (L16) arrive with the first slice that needs them — the rate limiter with the first public endpoint, Sentry in slice 0.

**Ship slice 0 completely before touching slice 1.** A shaky foundation makes every later slice inherit the bug.

---

## 8. Git Workflow

- **Branch naming:** `slice-1/transaction-status-transitions`, `fix/deadline-urgency-boundary`, `slice-10/wire-verification`
- **Commits:** conventional style — `feat(deadlines): add TREC business-day calculator`, `fix(auth): bust cache on deactivation`, `test(chat): add no-results fallback case`
- **PRs:** small and slice-scoped. One slice or one feature per PR. A 2,000-line PR is unreviewable and will sit.
- **Every PR must pass:** lint, typecheck, and the full test suite in CI before merge. No exceptions, no "I'll fix the test after."
- **The review checklist** for every backend PR:
  - Controller has no business logic
  - Service has no direct DB access
  - No module imports another module's repository — and no repository appears in an `exports` array
  - New/changed data has a migration
  - Tests cover the negative case, not just the happy path
  - No secrets, no PII in logs, no `console.log`
  - Nothing off the banned list in `18-nestjs-conventions.md` (`class-validator`, `Scope.REQUEST`, `useGlobalFilters`, in-memory state, unexplained `forwardRef`)

---

## 9. Definition of Done

A layer or feature is **done** when:

- [ ] All checklist items for it are ticked in `05-backend-checklist.md`
- [ ] Unit tests cover the deterministic logic (including boundaries and failure cases)
- [ ] Integration tests cover the DB and queue paths
- [ ] At least one e2e test proves the endpoint end-to-end with a real JWT
- [ ] The negative cases are tested (invalid transition throws, wrong role gets 403, expired token gets 401)
- [ ] Errors return the standard envelope with a typed code — never a raw stack trace
- [ ] Anything AI-touched respects the compliance rules in `09-legal-compliance.md`
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass
- [ ] The PR is reviewed against the §8 checklist

"It runs on my machine" is not done. "The tests prove it, including when it should fail" is done.

---

## 10. The Non-Negotiables (Pin These)

These come up in review constantly. Internalize them now:

1. **Modules import services, never repositories.** The extraction path for Phase 2 depends on it. Enforced by the `exports` array (bootstrap crash) and lint — not by memory.
2. **`instrument.ts` is the first import in `main.ts`.** Sentry must init before NestJS, or bootstrap errors vanish.
3. **`rediss://` not `redis://`.** The extra `s` is TLS. Cached user records and chat history travel encrypted.
4. **Rate limiting and caching are Redis-backed, not in-memory.** Two processes means in-memory state is wrong by construction.
5. **Graceful shutdown is required on the worker.** `OnApplicationShutdown` lets a document finish processing before Railway kills the process. Without it, documents get stranded in `PROCESSING`. **It never fires unless `worker.ts` calls `app.enableShutdownHooks()`** — one line, and it only reproduces under a real SIGTERM.
6. **`SseService` fans out through Redis pub/sub, in Phase 1.** The worker produces the events; the HTTP process holds the connections. An in-memory subject works flawlessly on your laptop and delivers nothing on Railway.
7. **Globals register as `APP_GUARD` / `APP_PIPE` / `APP_FILTER` providers**, never `app.useGlobalFilters()`. A filter constructed outside the DI container can't inject Sentry or the correlation ID.
8. **No request-scoped providers.** `Scope.REQUEST` rebuilds the injection chain per request and doesn't exist in the worker. Per-request context is AsyncLocalStorage (`nestjs-cls`).
9. **Soft delete everywhere on legal data.** Never a hard `DELETE`. Every list query filters `deleted_at IS NULL` via the `notDeleted` helper.
10. **The AI never auto-sends or auto-confirms anything.** Extracted deadlines stage as PENDING_REVIEW; drafts require section review + attestation. This is law (Opinion 705), not preference.
11. **Chat returns the deterministic fallback when no chunks clear the threshold.** It must never call Claude with empty context and let it guess. A confident wrong answer is a malpractice risk.
12. **Never trust `Content-Type`.** Validate uploads by magic bytes.
13. **Field limits enforce at the Zod pipe.** Chat 4,000, draft instructions 2,000, etc. — a 422 before anything reaches the service.

Items 1 and 5–8 are framework mechanics. The full set, with the code, is `18-nestjs-conventions.md` — read it before writing your first provider.

---

## 11. When You're Stuck

- **Data shape question** → `03-schema.md`
- **"What should this endpoint do?"** → `05-backend-checklist.md`, then `04-data-contracts.md`
- **"Why does this module exist?"** → `14-module-notes.md`
- **"What does this NestJS term mean?"** → the NestJS Vocabulary appendix in `14-module-notes.md`
- **"How do I wire this in NestJS?"** → `18-nestjs-conventions.md`
- **AI prompt content** → `08-prompts.md`
- **Docs disagree with each other** → schema wins for data, checklist wins for behavior, and you flag it to the lead so we fix the drift

---

*Build the foundation like it's the product. It is. Start with Layer 1 tomorrow.*
