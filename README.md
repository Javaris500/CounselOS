# CounselOS

**AI-native case management for real estate law firms.** Deadline intelligence, document RAG, and wire-fraud protection — built around Texas Bar Opinion 705 compliance.

> *The OS your firm runs on.*

---

## What this is

A case management platform for a real estate law firm in Austin, Texas (Phase 1: one firm; Phase 2: multi-tenant SaaS). The guiding principle is **case management first, AI second** — the operational spine is the product; AI amplifies a system the firm already can't leave.

**Stack:** NestJS modular monolith (two processes: HTTP server + BullMQ worker) · PostgreSQL + pgvector via Supabase · Next.js App Router · Anthropic Claude via Vercel AI SDK · Voyage AI `voyage-law-2` embeddings · Resend.

---

## Prerequisites

- **Node.js 24 LTS** — `nvm use` (pinned in `.nvmrc`)
- **pnpm** — `npm i -g pnpm` (we use pnpm workspaces, not npm)
- **Docker** — required, not optional. Testcontainers boots real Postgres and Redis for the integration and E2E tiers, so every module's gate needs it. On WSL2, enable Docker Desktop → Settings → Resources → WSL Integration for your distro.
- A **Supabase** project (auth and storage have no local equivalent). Anthropic, Voyage AI, and Resend keys are only needed at the slice that uses them — slice 5, 2, and 3 respectively. Blank is a supported state until then.

---

## Setup

```bash
git clone <repo-url> counselos && cd counselos
nvm use
pnpm install

cp .env.example .env                         # host ports for the docker services
docker compose up -d                         # local Postgres (pgvector) + Redis
docker compose ps                            # both must read "healthy"

cp apps/api/.env.example apps/api/.env       # fill with your credentials
cp apps/web/.env.example apps/web/.env.local

pnpm db:migrate
pnpm dev
```

> **Ports.** Local Postgres is on **5434** and Redis on **6381**, not the
> defaults — set by the root `.env` you just copied, and already matched by
> `apps/api/.env.example`. The defaults collide with instances people commonly
> have running, and a connection that silently reaches the wrong database is a
> bad afternoon. To use different ports, change them in the root `.env` and
> point `DATABASE_URL` / `REDIS_URL` in `apps/api/.env` at whatever you chose.

- API → `http://localhost:3001`
- Web → `http://localhost:3000`

**Smoke test:** `curl http://localhost:3001/v1/health` should return `{"status":"ok"}`.

---

## Everyday commands

```bash
pnpm dev                        # api + worker + web
pnpm --filter api db:generate   # generate migration from schema.ts
pnpm --filter api db:migrate    # apply migrations
pnpm --filter api db:seed       # Austin test fixtures
pnpm --filter api db:reset      # truncate + reseed (run before Playwright)
pnpm --filter api test:unit     # fast, no I/O
pnpm --filter api test:int      # integration (testcontainers)
pnpm --filter api test:e2e      # API E2E — the module gate
pnpm --filter web test:e2e      # Playwright — the slice gate
pnpm lint && pnpm typecheck     # must be green before any PR
```

> **Docker is required for `test:int` and `test:e2e`** — they boot a real
> Postgres and Redis through testcontainers, migrate, and tear them down
> (`apps/api/test/setup/containers.ts`). First run is slower while the images
> pull.
>
> **Not wired yet:** `db:seed`, and therefore `db:reset`, which chains it. Both
> wait on `schema.ts` gaining tables — there is nothing to seed until then.

---

## How we build

**Vertical slices, gated by end-to-end tests.** Each slice is a feature's backend *and* frontend built together, then proven with Playwright. We do not build all backend then all frontend.

Slice order and the gate for each: **[`docs/00-developer-guide.md`](docs/00-developer-guide.md)**
Process, the two E2E layers, PR checklist: **[`docs/01-codebase.md`](docs/01-codebase.md)**

**Start with Slice 0.** Ship it completely before touching Slice 1.

---

## The rules that matter most

1. **Controller → Service → Repository.** Controllers hold no business logic; services touch no database; repositories hold no rules.
2. **Modules import each other's *services*, never their *repositories*.** This is what keeps modules extractable in Phase 2.
3. **`instrument.ts` is the first import in `main.ts`** — Sentry must init before NestJS.
4. **`schema.ts` is the source of truth for data.** Never hand-write an entity type; infer it.
5. **The AI never auto-sends or auto-confirms anything.** Texas Opinion 705 — not a preference.
6. **`data-testid` on every interactive element, in the same commit as the component.**

Full standing rules: **[`CLAUDE.md`](CLAUDE.md)** (Claude Code reads this automatically).

---

## Project Memory (`memory/`)

Separate from `docs/`. `memory/Instructions.md`, `memory/Memory.md`, and `memory/Context.md` are Claude's persistent working memory for this project — preferences, corrections, decisions, and condensed context — usable across any conversation, not just coding sessions.

`memory/Memory.md` is expected to change often as Claude learns; treat edits to it like a running log, not a reviewed doc.

## Documentation

Everything lives in [`docs/`](docs/), numbered for reading order.
**Start at [`docs/README.md`](docs/README.md)** — it tells you which two or three docs your task actually needs.

| Doing this? | Read |
|---|---|
| Day one | `docs/00-developer-guide.md` → `docs/14-module-notes.md` |
| A backend module | `docs/05-backend-checklist.md` + `docs/03-schema.md` |
| An AI feature | also `docs/08-prompts.md` + `docs/09-legal-compliance.md` |
| Frontend | `docs/06-frontend-architecture.md` + `docs/07-design-handoff.md` |
| Tests | `docs/10-tdd-guide.md` + `docs/11-test-data.md` |

---

## License

Proprietary. All rights reserved.
