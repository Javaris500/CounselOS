# CounselOS

AI-native case management for real estate law firms. Deadline intelligence, document RAG, and wire-fraud protection — built around Texas Bar Opinion 705 compliance.

**The OS your firm runs on.**

---

## The problem

A real estate attorney bills $300–500/hour and spends most of the day not billing. Industry utilization sits around 38% — three billable hours out of eight. After realization and collection, roughly 30% of working time becomes revenue.

Meanwhile the failure modes are brutal and specific:

- **Missed deadlines** are the single largest category of legal malpractice claims. Texas TREC contracts run on strict calendar-day math with traps that are easy to get wrong by hand.
- **Wire fraud** took $275.1M across 12,368 complaints in 2025 (FBI IC3), growing year over year. It's the largest catastrophic-loss vector in the practice area.
- **Institutional memory** walks out the door when a paralegal leaves, because the context lives in their inbox.

Existing case management software mostly stores things. It doesn't understand them.

---

## What makes this different

Most legal AI products are a chat box over an LLM API. Some of the more interesting decisions here were about where **not** to use AI.

**I deleted the AI document classifier.** It sent 500 tokens to Claude and got back one word from a list of eleven. Texas real estate runs on standardized TREC forms with the form number printed on the page. A keyword function does the same job in ~1ms, at zero cost, with zero failure modes — and it's testable with exact assertions instead of "probably returns the right word."

**The deadline engine doesn't trust the model's arithmetic.** Claude extracts "closing is 30 days after the effective date." A deterministic engine computes what that actually means under Texas rules — including the trap that the earnest-money deadline rolls to the next business day if it lands on a weekend, but the option-fee deadline does not. Same offset, same weekend, two different dates. Getting it wrong forfeits a client's money.

**Chat refuses to answer when it has no data.** If zero document chunks clear the relevance threshold, the model is never called — a fixed "not in your documents" response is returned instead. Stanford's RegLab found purpose-built legal research tools hallucinate on 17–33% of queries. In a legal context, a confident wrong answer isn't a bug, it's malpractice exposure.

**Nothing the AI produces auto-executes.** Extracted deadlines stage for attorney confirmation. Drafts require section-by-section review and a stored attestation. That's Texas Opinion 705 — law, not preference.

The test applied throughout: *is this genuinely intelligence, or pattern matching wearing an AI costume?*

---

## Status

**Pre-customer, building in public.** No firm has signed yet — the design partner conversation is in progress. The architecture, schema, and compliance work are complete and documented; the build is underway slice by slice.

Being upfront about that is deliberate. A repo implying traction it doesn't have is exactly the kind of thing this project is trying not to be.

---

## Architecture

A modular monolith running as **two processes off one codebase**.

```
Browser (Next.js)
      │  HTTPS + SSE
      ▼
┌─────────────────────────────────────┐
│  main.ts            worker.ts       │
│  HTTP server        BullMQ worker   │
│  REST + SSE         doc pipeline    │
│  enqueues           draft gen       │
│                     deadline cron   │
└──────┬──────────────────┬───────────┘
       ▼                  ▼
  Supabase          Upstash Redis        External
  Postgres+pgvector  queues, cache       Anthropic
  Auth, Storage      rate limits         Voyage AI
                                         Resend
```

A document upload returns immediately and processes asynchronously — convert, extract, classify, chunk, embed — reporting progress over SSE. One upload triggers deadline extraction, checklist auto-checking, and vector indexing.

**Stack:** NestJS · Drizzle ORM · PostgreSQL + pgvector (Supabase) · Next.js App Router · Anthropic Claude via Vercel AI SDK · Voyage AI `voyage-law-2` embeddings · BullMQ · Resend

Full system overview: [`docs/01-codebase.md`](docs/01-codebase.md)

---

## Prerequisites

- **Node.js 24 LTS** — `nvm use` (pinned in `.nvmrc`)
- **pnpm** — `npm i -g pnpm` (pnpm workspaces, not npm)
- **Docker** — required, not optional. Testcontainers boots real Postgres and Redis for the integration and E2E tiers. On WSL2, enable Docker Desktop → Settings → Resources → WSL Integration for your distro.
- **A Supabase project** (auth and storage have no local equivalent). Anthropic, Voyage AI, and Resend keys are only needed at the slice that uses them — slices 5, 2, and 3 respectively. Blank is a supported state until then.

---

## Setup

```bash
git clone https://github.com/Javaris500/CounselOS.git counselos && cd counselos
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

**Ports.** Local Postgres is on **5434** and Redis on **6381**, not the defaults — set by the root `.env` you just copied and already matched by `apps/api/.env.example`. The defaults collide with instances people commonly have running, and a connection that silently reaches the wrong database is a bad afternoon. To change them, edit the root `.env` and point `DATABASE_URL` / `REDIS_URL` in `apps/api/.env` at whatever you chose.

- API → `http://localhost:3001`
- Web → `http://localhost:3000`

Smoke test: `curl http://localhost:3001/v1/health` should return `{"status":"ok"}`.

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

Docker is required for `test:int` and `test:e2e` — they boot a real Postgres and Redis through testcontainers, migrate, and tear them down (`apps/api/test/setup/containers.ts`). First run is slower while images pull.

---

## How we build

**Vertical slices, gated by end-to-end tests.** Each slice is a feature's backend and frontend built together, then proven with Playwright. Not all backend then all frontend.

There are two E2E layers, and they gate different things:

| Layer | Tool | Gates |
|---|---|---|
| API E2E | supertest | a **module** — real HTTP stack, real JWT |
| Browser E2E | Playwright | a **slice** — real browser, real UI, real backend |

Slice order and each gate: [`docs/00-developer-guide.md`](docs/00-developer-guide.md)
Process, the two E2E layers, PR checklist: [`docs/01-codebase.md`](docs/01-codebase.md)

Start with **Slice 0**. Ship it completely before touching Slice 1.

### The rules that matter most

- **Controller → Service → Repository.** Controllers hold no business logic; services touch no database; repositories hold no rules.
- **Modules import each other's services, never their repositories.** This is what keeps modules extractable in Phase 2.
- **`instrument.ts` is the first import in `main.ts`** — Sentry must init before NestJS.
- **`schema.ts` is the source of truth for data.** Never hand-write an entity type; infer it.
- **The AI never auto-sends or auto-confirms anything.** Texas Opinion 705 — not a preference.
- **`data-testid` on every interactive element**, in the same commit as the component.

Full standing rules: [`CLAUDE.md`](CLAUDE.md) — Claude Code reads this automatically.

---

## Documentation

Everything lives in `docs/`, numbered for reading order. Start at [`docs/README.md`](docs/README.md) — it tells you which two or three docs your task actually needs.

| Doing this? | Read |
|---|---|
| Orienting on the system | [`docs/01-codebase.md`](docs/01-codebase.md) |
| Day one as a contributor | [`docs/00-developer-guide.md`](docs/00-developer-guide.md) → [`docs/14-module-notes.md`](docs/14-module-notes.md) |
| A backend module | [`docs/05-backend-checklist.md`](docs/05-backend-checklist.md) + [`docs/03-schema.md`](docs/03-schema.md) |
| An AI feature | also [`docs/08-prompts.md`](docs/08-prompts.md) + [`docs/09-legal-compliance.md`](docs/09-legal-compliance.md) |
| Frontend | [`docs/06-frontend-architecture.md`](docs/06-frontend-architecture.md) + [`docs/07-design-handoff.md`](docs/07-design-handoff.md) |
| NestJS wiring | [`docs/18-nestjs-conventions.md`](docs/18-nestjs-conventions.md) |
| Tests | [`docs/10-tdd-guide.md`](docs/10-tdd-guide.md) + [`docs/11-test-data.md`](docs/11-test-data.md) |
| Why the AI works this way | [`docs/17-ai-principles.md`](docs/17-ai-principles.md) |

### Project memory (`memory/`)

Separate from `docs/`. `memory/Instructions.md`, `memory/Memory.md`, and `memory/Context.md` are persistent working memory for this project — preferences, corrections, decisions, and condensed context — usable across any Claude conversation, not just coding sessions.

`memory/Memory.md` changes often as decisions accumulate; treat it as a running log, not a reviewed doc.

---

## License

Proprietary. All rights reserved.
