# CounselOS — Repository Structure
### Monorepo · Modular Monolith · Phase 1

> **The organizing principle:** every module looks the same inside, and **modules never import each other's repositories** — only each other's services. That single rule is what makes the modular monolith real rather than aspirational, and it's what makes Phase 2 extraction possible without a rewrite.

---

## Top Level

```
counselos/
├── apps/
│   ├── api/                    # NestJS backend  → Railway (2 processes)
│   └── web/                    # Next.js frontend → Vercel
├── packages/
│   ├── shared/                 # types, enums, error codes — the sync contract
│   └── config/                 # shared tsconfig, eslint, prettier
├── docs/                       # the spec set — see docs/README.md for the index
├── .github/workflows/          # CI: lint, typecheck, test, migrate
├── package.json                # workspaces root
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

**Why a monorepo.** The frontend and backend deploy separately (Vercel + Railway) — that doesn't change. What a monorepo buys you is `packages/shared`: one source of truth for every enum, error code, and field limit. The two sync gaps found in the frontend review (a non-existent `notifications/unread` endpoint, and `PATCH .../sections` meaning two different things) would have been **compile errors** instead of spec-review findings. That's the whole argument.

---

## `packages/shared` — The Sync Contract

```
packages/shared/src/
├── enums/
│   ├── transaction.enums.ts    # TransactionStatus, TransactionType
│   ├── document.enums.ts       # DocumentType, ProcessingStatus
│   ├── deadline.enums.ts       # DeadlineType, DeadlineStatus, Urgency
│   ├── draft.enums.ts          # DraftType, DraftStatus
│   ├── task.enums.ts           # TaskStatus, TaskPriority
│   ├── communication.enums.ts  # CommunicationType, Direction
│   └── user.enums.ts           # UserRole
├── errors/
│   └── error-codes.ts          # ERROR_CODES — frontend switches on these
├── events/
│   └── sse-events.ts           # SSE event type constants + payload shapes
├── constants/
│   └── limits.ts               # CHAT_MAX=4000, DRAFT_INSTRUCTIONS_MAX=2000, ...
├── types/
│   └── api.ts                  # ApiResponse<T>, ApiError, PaginationMeta
└── index.ts
```

**Rule:** the backend derives its Drizzle enums from these constants. The frontend imports the same file. An enum can never drift between the two.

---

## `apps/api` — NestJS Backend

```
apps/api/src/
├── instrument.ts               # Sentry init — MUST be the first import in main.ts
├── main.ts                     # HTTP server entrypoint
├── worker.ts                   # BullMQ worker entrypoint (separate Railway process)
├── core.module.ts              # Config · Database · Redis · Logger · CLS — imported by both
├── app.module.ts               # Core + all feature modules + controllers  → main.ts
├── worker.module.ts            # Core + only what the processors need      → worker.ts
│
├── config/
│   ├── configuration.ts
│   └── env.validation.ts       # validateEnvVars() — fails fast at boot
│
├── database/
│   ├── schema.ts               # THE schema — single source of truth
│   ├── db.ts                   # Drizzle client factory
│   ├── helpers.ts              # notDeleted.*, pagination helpers
│   ├── seed.ts                 # Austin test fixtures
│   └── migrations/
│       ├── 0000_init.sql       # drizzle-kit generated
│       └── 0002_manual_indexes.sql  # HNSW + partial unique — hand-written
│
├── common/
│   ├── guards/                 # JwtAuthGuard, RolesGuard, ClientTokenGuard
│   ├── filters/                # GlobalExceptionFilter → error envelope
│   ├── interceptors/           # CorrelationIdInterceptor, ResponseInterceptor
│   ├── pipes/                  # ZodValidationPipe
│   ├── decorators/             # @CurrentUser(), @Roles(), @Public()
│   ├── errors/                 # AppException, error factory
│   └── prompts/                # canonical, versioned — never inline in services
│       ├── chat.prompt.ts
│       ├── deadline-extraction.prompt.ts
│       └── draft-generation/
│           ├── base.prompt.ts
│           ├── section.schema.ts
│           ├── amendment.prompt.ts
│           ├── engagement-letter.prompt.ts
│           └── ...
│
└── modules/
    ├── auth/
    ├── firms/
    ├── users/
    ├── transactions/
    ├── parties/
    ├── documents/
    ├── deadlines/
    ├── chat/
    ├── drafts/
    ├── notes/                  # matter notes
    ├── communications/
    ├── checklist/
    ├── tasks/
    ├── time-entries/
    ├── invoices/
    ├── leads/
    ├── client-portal/
    ├── dashboard/              # morning dashboard — aggregates, owns no table
    ├── notifications/
    ├── realtime/               # SseService — every module emits through this
    └── queues/                 # BullMQ registration + processors
```

**`instrument.ts` first.** Sentry must initialize before NestJS loads, or spans and errors from bootstrap are lost. It is the literal first line of `main.ts`.

**Two entrypoints, three module graphs.** `main.ts` and `worker.ts` share `CoreModule` and the same Drizzle client, but they do **not** share a root module. `worker.ts` bootstraps `WorkerModule` via `NestFactory.createApplicationContext()` — full DI, no HTTP listener, no controllers instantiated. Railway runs them as two processes. This is the modular monolith paying off: no service duplication, no shared library to version. Wiring detail in `18-nestjs-conventions.md` §6.

---

## Every Module Has the Same Shape

```
modules/transactions/
├── transactions.module.ts
├── transactions.controller.ts       # HTTP only — no logic
├── transactions.service.ts          # business logic — no DB access
├── transactions.repository.ts       # Drizzle queries — no business logic
├── dto/
│   ├── create-transaction.dto.ts    # Zod schema + inferred type
│   ├── update-transaction.dto.ts
│   └── update-status.dto.ts
├── constants/
│   └── status-transitions.ts        # the validated transition map
└── __tests__/
    ├── transactions.service.spec.ts     # unit — mocked repository
    ├── transactions.repository.spec.ts  # integration — real Postgres
    └── transactions.e2e-spec.ts         # e2e — full HTTP + real JWT
```

**Controller → Service → Repository. No shortcuts.**
The controller never touches Drizzle. The service never writes SQL. The repository never contains business rules. This is what makes the service unit-testable without a database — inject a mock repository and the test runs in milliseconds.

**The boundary rule.** `TransactionsService` may import `DocumentsService`. It may **never** import `DocumentsRepository`. Cross-module data access always goes through the owning module's service. It's the line that keeps modules extractable.

**And it's mechanical, not a review item.** A module's `@Module({ exports })` array is the access-control list: export the service, never the repository. Violating it fails at bootstrap with "Nest can't resolve dependencies," on the developer's machine, before CI. An ESLint `no-restricted-imports` rule catches it in files that aren't wired up yet. Both are specified in `18-nestjs-conventions.md` §1 — review is the backstop, not the mechanism.

---

## Modules With Extra Structure

Three modules carry more than the standard shape, because they own real complexity:

```
modules/documents/
├── documents.controller.ts
├── documents.service.ts
├── documents.repository.ts
├── chunks.repository.ts             # vector search lives here
├── classifiers/
│   └── document-classifier.ts       # deterministic — zero AI, ~1ms
├── processors/
│   ├── document.processor.ts        # the BullMQ pipeline job
│   ├── converter.ts                 # LibreOffice DOCX → PDF
│   ├── extractor.ts                 # pdf-parse, per page
│   └── chunker.ts                   # 512 tokens / 50 overlap — locked
└── validators/
    └── magic-bytes.validator.ts     # gate 2 — never trust Content-Type

modules/deadlines/
├── deadlines.service.ts
├── extraction.service.ts            # Claude → structured deadlines
├── superseding.service.ts           # amendment chain logic
├── urgency.calculator.ts            # pure function, exhaustively tested
├── ics.generator.ts                 # .ics download (no calendar OAuth in P1)
└── schedulers/
    └── deadline-alert.scheduler.ts  # hourly BullMQ repeatable

modules/queues/
├── queues.module.ts
├── queue.constants.ts               # queue names, job names
└── processors/
    ├── document.processor.ts
    ├── draft-generation.processor.ts
    └── email.processor.ts
```

**`dashboard/` owns no table.** It's a pure aggregation module reading through other modules' services. That's intentional — the morning dashboard is a *view*, not an entity.

---

## `apps/web` — Next.js Frontend

```
apps/web/src/
├── app/
│   ├── layout.tsx
│   ├── (attorney)/                  # route group — authed dashboard
│   │   ├── layout.tsx               # auth guard + SSE connection + nav shell
│   │   ├── page.tsx                 # → redirect to /dashboard
│   │   ├── dashboard/page.tsx       # MORNING DASHBOARD — the home screen
│   │   ├── transactions/
│   │   │   ├── page.tsx             # pipeline (kanban)
│   │   │   └── [id]/
│   │   │       ├── layout.tsx       # transaction shell + tab nav
│   │   │       ├── page.tsx         # overview
│   │   │       ├── documents/page.tsx
│   │   │       ├── checklist/page.tsx
│   │   │       ├── deadlines/page.tsx
│   │   │       ├── chat/page.tsx
│   │   │       ├── drafts/page.tsx
│   │   │       ├── notes/page.tsx
│   │   │       ├── communications/page.tsx
│   │   │       ├── tasks/page.tsx
│   │   │       └── time/page.tsx
│   │   ├── deadlines/page.tsx       # firm-wide deadline dashboard
│   │   └── leads/page.tsx
│   ├── (client)/                    # route group — no auth, signed token
│   │   ├── layout.tsx               # completely different shell
│   │   └── status/[id]/page.tsx     # read-only status page
│   └── auth/
│       ├── login/page.tsx
│       └── deactivated/page.tsx     # USER_INACTIVE lands here, not login
│
├── components/
│   ├── ui/                          # primitives: Button, Card, Drawer, Modal
│   ├── layout/                      # Nav, NotificationBell
│   ├── transactions/                # TransactionCard, StatusPipeline
│   ├── documents/                   # Uploader, ProcessingStatus
│   ├── chat/                        # ChatStream, CitationList
│   ├── drafts/                      # SectionReview, AttestationModal
│   ├── communications/              # QuickAddDrawer  ← adoption lives here
│   └── dashboard/                   # DeadlineList, TaskList, StaleDeals
│
├── lib/
│   ├── api/
│   │   ├── client.ts                # apiFetch — refresh, retry, error envelope
│   │   └── endpoints.ts             # every route in one file
│   ├── hooks/                       # useTransactions, useDeadlines, ...
│   ├── sse/
│   │   ├── useGlobalEvents.ts       # /v1/events + snapshot on reconnect
│   │   ├── useDocumentStream.ts
│   │   └── useChatStream.ts
│   └── utils/
│
├── stores/
│   ├── auth.store.ts                # token in memory — never localStorage
│   └── realtime.store.ts            # SSE connection + notification queue
│
└── styles/
    └── globals.css                  # design tokens
```

**Route groups, not folders.** `(attorney)` and `(client)` are two different products sharing one deploy. Different layouts, different auth, different visual language. The route group boundary makes that structural instead of conventional.

**`components/communications/QuickAddDrawer.tsx`** is called out deliberately. It's a small component that decides whether the communication log gets adopted. If logging a call takes more than ten seconds, attorneys won't do it and the feature dies. Treat it accordingly.

---

## Browser E2E Layout (Playwright)

```
apps/web/
├── e2e/
│   ├── auth.setup.ts            # logs in per role once → .auth/*.json
│   ├── slice-0-foundation.spec.ts
│   ├── slice-1-transactions.spec.ts
│   ├── slice-2-documents.spec.ts
│   ├── ...one spec per slice
│   └── fixtures/                # real PDFs for upload tests
│       ├── purchase-agreement-martinez.pdf
│       ├── wire-instructions-original.pdf
│       ├── wire-instructions-fraudulent.pdf
│       ├── scanned-no-text.pdf
│       └── not-a-pdf.pdf        # .exe bytes — magic-bytes rejection
├── .auth/                       # storageState per role — GITIGNORED
└── playwright.config.ts
```

**One spec per slice**, named for it. The slice's Playwright gate (from `00-developer-guide.md`) is that spec's contents.

`.auth/` is gitignored — it holds live session tokens.

---

## Testing Layout

Tests live **beside the code**, not in a mirrored top-level tree. A module and its tests move together.

```
modules/deadlines/__tests__/
├── urgency.calculator.spec.ts       # unit — pure, no I/O
├── superseding.service.spec.ts      # unit — mocked repo
├── deadlines.repository.spec.ts     # integration — testcontainers Postgres
└── deadlines.e2e-spec.ts            # e2e — full HTTP stack
```

Shared test infrastructure sits at the app root:

```
apps/api/test/
├── setup.ts                         # testcontainers boot
├── factories/                       # buildTransaction(), buildUser(), ...
└── fixtures/                        # the 5 Austin transactions, sample PDFs
```

---

## What Doesn't Exist (and Shouldn't)

No `utils/` dumping ground. No `services/` folder outside modules. No `helpers/` at the root. If code doesn't belong to a module, it belongs in `common/` with a specific subfolder — or it doesn't belong.

No `types/` folder in either app. Types live in `packages/shared` (contract types) or are inferred from Drizzle (`typeof transactions.$inferSelect`). Never hand-written twice.

---

## The Rule That Matters Most

> **Modules import services, never repositories.**

Everything else in this document is convention. That one is architecture. It's the difference between a modular monolith you can extract services from in Phase 2, and a distributed ball of mud you have to rewrite.

It's the cheapest discipline in the project and the most expensive one to retrofit — so don't rely on remembering it. The `exports` array enforces it at bootstrap and lint enforces it at commit (`18-nestjs-conventions.md` §1). Review is the third net, not the first.
