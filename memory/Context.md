# Context.md
### CounselOS — Project Context | Layer 2 Memory System

> The stable facts. What this is, what's decided, where things live, what state the build is in. Read this with `Memory.md` before asking anything that's already been answered.
>
> **Context vs Memory:** this file holds *what the project is*. `Memory.md` holds *how we work together* — preferences, corrections, decisions as they happen. This one changes when the project changes; that one changes almost every session.

---

## The Product

**CounselOS** — AI-native case management for a real estate law firm in Austin, Texas.

- **Phase 1:** one firm, single-tenant. No multi-tenancy, billing tiers, or onboarding in scope. `firm_id` is handled server-side.
- **Phase 2:** multi-tenant SaaS. The architecture accommodates it without a rewrite; nothing is built for it now.
- **The thesis:** *case management first, AI second.* The operational spine is the product; AI amplifies a system the firm already can't leave. If the AI carried the product alone, a competitor with better AI could take the firm.
- **The tagline:** *The OS your firm runs on.*

**Why the boring modules matter most.** The communication log, matter notes, checklist, and morning dashboard are what make an attorney open CounselOS before their email. The AI features are what impress in a demo. Adoption research was blunt that adoption failure, not missing features, kills legal software.

---

## Stack

| Layer | Choice |
|---|---|
| Backend | NestJS modular monolith — **two processes**, one codebase: HTTP server + BullMQ worker |
| ORM | Drizzle (chosen over Prisma specifically for pgvector — vector search is a typed query, not `$queryRaw`) |
| Database | PostgreSQL + pgvector via Supabase |
| Cache / queue | Upstash Redis (`rediss://`, TLS) + BullMQ |
| Frontend | Next.js App Router · SWR for all server data · Zustand for two ephemeral stores only |
| AI | Anthropic Claude via Vercel AI SDK · Voyage AI `voyage-law-2` embeddings |
| Email | Resend + React Email |
| Observability | Sentry |
| Deploy | Railway (two services, one repo) + Vercel |
| Runtime | Node 24 LTS · pnpm workspaces · turbo · TypeScript 5.9.3 |

---

## Architecture Rules That Never Bend

1. **Controller → Service → Repository.** Controller is HTTP only. Service holds business rules, no DB access. Repository holds Drizzle queries, no business rules.
2. **A module imports another module's *service*, never its *repository*.** The one rule that is architecture rather than convention — it's what makes modules extractable in Phase 2. Enforced by the `@Module.exports` array (violation = bootstrap crash) and by ESLint.
3. **`instrument.ts` is the first import** in both entrypoints, or Sentry misses bootstrap errors.
4. **Two processes, three module graphs.** `CoreModule` is shared; `AppModule` → `main.ts`, `WorkerModule` → `worker.ts`. The worker uses `createApplicationContext()`, never `create()`.
5. **Anything stateful is Redis-backed** — rate limits, caches, SSE fan-out. In-memory state is wrong by construction with two processes.
6. **Soft delete on legal data.** Never a hard `DELETE`.
7. **Graceful shutdown on the worker**, and it only fires if `enableShutdownHooks()` is called.

**The AI rules (Texas Opinion 705 — law, not preference):** the AI never auto-sends or auto-confirms. Deadlines stage `PENDING_REVIEW`. Drafts need per-section review plus a stored attestation. Chat returns a deterministic fallback when no chunks clear 0.70 similarity — never call the model with empty context and let it guess.

---

## Where Things Live

```
counselos/
├── CLAUDE.md               standing rules for Claude Code — MUST stay at repo root
├── memory/                 this Layer 2 system (Instructions · Context · Memory · README)
├── docs/                   19 numbered docs, 00–18 — see docs/README.md for the index
├── apps/api/               NestJS backend
├── apps/web/               Next.js frontend
├── packages/shared/        the sync contract — enums, error codes, SSE events, limits
├── packages/config/        shared tsconfig, eslint, prettier
├── docker-compose.yml      LOCAL DEV ONLY — Postgres + Redis
└── docker/postgres/init/   pgvector, pgcrypto, pg_trgm
```

**Which doc to load** (don't load everything — several are large):

| Task | Doc |
|---|---|
| Any backend module | that module's section of `05-backend-checklist.md` + its tables in `03-schema.md` |
| Module order / E2E gates | `01-codebase.md` Part 3 |
| Slice order / setup / commands | `00-developer-guide.md` |
| File placement | `02-repo-structure.md` |
| **Any NestJS wiring** | `18-nestjs-conventions.md` |
| AI paths | `08-prompts.md` + `09-legal-compliance.md` |
| Frontend | `06-frontend-architecture.md`, `07-design-handoff.md`, `design-system-v5.html` |
| Tests / seeds | `10-tdd-guide.md` + `11-test-data.md` |

**Known doc drift:** `04-data-contracts.md` and `10-tdd-guide.md` still reference Prisma and R2 throughout — they predate the Drizzle decision and need a dedicated rewrite. **Resolution rule:** schema wins for data shape, checklist wins for behavior, and flag the conflict rather than silently picking one.

---

## How We Build

**Vertical slices, not backend-then-frontend.** Each slice is a feature's backend *and* frontend, gated by one Playwright test. Slice 0 ships completely before slice 1 starts. Order and gates: `00-developer-guide.md` §7.

**Per module:** write the E2E test first (it's the gate and the spec) → controller → service → repository → dto → make it pass *including negative cases* → small module-scoped PR.

**Test tiers:** unit (mocked repo, no I/O) · integration (real Postgres/Redis via testcontainers) · E2E (full HTTP stack, real JWT). Mock only true externals — Anthropic, Voyage, Resend, Supabase Auth. Never mock our own database, queue, or services.

**Always test the negative cases.** Invalid input → 422, wrong role → 403, expired token → 401, not-found → 404, invalid transition → 422.

---

## Current State (2026-08-15)

**Scaffolded and verified.** `install` / `lint` / `typecheck` / `build` all pass. `GET /v1/health` returns `{"status":"ok"}` against a live boot. Local Postgres (pgvector 0.8.2) and Redis are healthy in Docker.

**Local ports are non-standard** — Postgres **5434**, Redis **6381**, set in a gitignored root `.env`. The defaults are taken by other projects on this machine (`cliniciq`, `avelcc`, `businessos`), which must not be stopped.

**Next task: write `schema.ts` tables in one pass**, reading `03-schema.md` alongside `16-compliance-gaps.md`. Enums are done and derive from `packages/shared`. Tables are deliberately not started, because the columns that can't be honestly backfilled must exist in the first migration.

**Then slice 0:** Module 1 Foundation → Module 2 Auth → frontend shell → Playwright gate.

**Not yet real:** the Supabase project (placeholder values in `apps/api/.env`), and every external API key. Blank keys are a supported state — the service reports `not_configured` and its feature renders a disabled state with a plain explanation, never a spinner that never resolves. Fill them at the slice that needs them: Voyage → slice 2, Resend → slice 3, Anthropic → slice 5.
