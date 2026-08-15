# CounselOS — Backend Flow Checklist
### Phase 1: Single Real Estate Firm | Phase 2: Multi-Tenant SaaS

> **How to read this document:** Items marked `[PHASE 2]` are designed and documented but not being built right now. They exist here so the team knows they are coming and can architect Phase 1 to accommodate them without a rewrite. Build Phase 1 items only until the first client is signed and paying.

---

## Architecture Decision — Modular Monolith `[LOCKED]`

**CounselOS is a modular monolith. This is a deliberate, documented decision — not a shortcut.**

Microservices (with Kafka, API gateway, and distributed event streaming) were evaluated and rejected for Phase 1 and Phase 2. The reason is not technical capability — it is engineering cost vs. value.

**Why not microservices yet:**
Microservices are an organizational scaling solution. They exist so independent teams can deploy independent services without coordination. We do not have that problem. Adding Kafka, a schema registry, service discovery, distributed tracing, inter-service auth, and separate deployment pipelines would consume 40%+ of engineering bandwidth before a single feature ships. Every network call between services is a new failure mode. Every distributed transaction is a consistency bug waiting to happen.

**What modular monolith means in practice:**
One NestJS codebase. One deployment (plus a separate worker process for BullMQ). Strict module boundaries enforced by code — modules never import each other's repositories, only each other's service interfaces. Internal events use NestJS EventEmitter2, not Kafka. This gives clean separation without distributed systems overhead.

**The extraction path when we actually need it:**
Because module boundaries are strict from day one, extracting a service later is surgical. When document processing is consuming resources that starve the HTTP server — measure it, then extract it. When you have 3+ services that all react to the same events — measure it, then add Kafka. The monolith becomes the source, not the problem.

**Signals that trigger re-evaluation:**
- Document pipeline CPU/memory spikes measurably degrading API response times
- AI/chat service needs independent rate limit management and model routing
- Multiple teams deploying independently to production
- BullMQ single-consumer model creating measurable throughput bottlenecks

Until those signals appear with measurements attached, the architecture stays as designed.

**Two processes, one codebase:**
```
Railway deployment
  ├── NestJS HTTP server    ← handles all API requests
  └── NestJS BullMQ worker ← handles all async jobs
      Both share the same Postgres, Redis, and Supabase Storage.
      Both deployed from the same codebase via separate Railway services.
      HTTP server never processes queue jobs. Worker never handles HTTP.
```

---

---

## Layer 1 — Project Foundation `[PHASE 1]`

### 1A — Project Scaffold

- [ ] NestJS project initialized with TypeScript strict mode
- [ ] Folder structure scaffolded **exactly** to `02-repo-structure.md` — that doc is the authority on file placement; it is not duplicated here. Locked and agreed by the team before any code is written.
- [ ] Framework conventions read and agreed before the first provider is written — `18-nestjs-conventions.md`. DI wiring, the validation stack, global registration, provider scope, and the two-entrypoint module graph are decided there, once, and not re-litigated per module.
- [ ] `pnpm` workspaces + turbo configured; `packages/shared` importable from both apps
- [ ] Environment config module validates all env vars on boot with a Zod schema — server refuses to start if anything is missing, and reports **every** missing key at once, not the first one
- [ ] `.env.example` committed with every variable documented before first line of feature code

### 1B — Database Setup (Drizzle — must exist before any module is built)

**ORM: Drizzle** — chosen over Prisma specifically for pgvector. Every RAG vector search in CounselOS is a first-class typed Drizzle query. In Prisma the same query requires untyped `$queryRaw`. Drizzle's SQL-first design also makes Phase 2 RLS integration natural. Prisma 7 narrowed the performance gap significantly but the pgvector DX difference is the deciding factor.

- [ ] Drizzle installed: `npm install drizzle-orm postgres` and `npm install -D drizzle-kit`
- [ ] `src/database/schema.ts` created — single file defining all tables and enums. Source of truth for all entities. Reviewed by the whole team before any migration runs.
- [ ] `src/database/db.ts` — creates the Drizzle client: `drizzle(postgres(process.env.DATABASE_URL))`
- [ ] `DrizzleModule` created — provides the Drizzle client globally. No module re-imports it individually.
- [ ] pgvector extension enabled in Supabase dashboard — Database → Extensions → vector. Required for `vector` column type in schema.
- [ ] Drizzle schema principles applied before any table is written:
  - UUIDs everywhere — `uuid('id').primaryKey().defaultRandom()`, never serial integers
  - Timestamps on every table — `createdAt: timestamp().defaultNow().notNull()` and `updatedAt: timestamp().defaultNow().notNull().$onUpdate(() => new Date())`
  - Soft delete on legal entities — `deletedAt: timestamp()` nullable. Never hard delete transactions, documents, deadlines, drafts.
  - Enums defined in schema.ts using Drizzle `pgEnum()` — enforced at DB level
  - Explicit `references()` with `onDelete` on every foreign key — documented, not defaulted
  - JSONB only for data that is stored and read back, never filtered or sorted
- [ ] Soft delete query utility — `isNull(table.deletedAt)` helper function in `src/database/helpers.ts`. Used in every list query consistently. Not a Drizzle middleware — explicit in every repository method.
- [ ] `drizzle.config.ts` created with schema path, migrations output path, and DB credentials
- [ ] Baseline migration: `npx drizzle-kit generate` then `npx drizzle-kit migrate`
- [ ] `src/database/seed.ts` created — runs without error against dev database, loads all Phase 1 test fixtures

> **Note on Drizzle migrations:** Complex schema changes (column renames, data migrations) sometimes require manual SQL. When renaming a column: create a new column, backfill data, drop the old column as three separate migrations. Never rename in a single step. This is a conscious tradeoff for better pgvector ergonomics.

### 1C — Infrastructure Connections

- [ ] Supabase PostgreSQL connection confirmed — a `SELECT 1` through the Drizzle client succeeds on boot
- [ ] Supabase Storage bucket created — `documents` bucket, private access (no public URLs). Verified private in Supabase dashboard → Storage → Policies.
- [ ] Redis (Upstash) connection confirmed — test SET/GET succeeds. `rediss://` (TLS), never `redis://`.
- [ ] BullMQ connected to Redis — test job enqueue + process succeeds. BullMQ's connection sets `maxRetriesPerRequest: null`; ioredis defaults to 20 and BullMQ's blocking commands exceed it, producing intermittent job failures that read as network flakiness.
- [ ] Redis pub/sub connection opened **separately** from the cache connection — a connection in subscriber mode cannot issue other commands. Required by `SseService` (Layer 11).

### 1D — Global Middleware & Infrastructure

- [ ] **Every global registers as a provider** — `APP_GUARD`, `APP_INTERCEPTOR`, `APP_PIPE`, `APP_FILTER` in `app.module.ts`. Never `app.useGlobalFilters()` / `useGlobalPipes()` in `main.ts`: those construct the instance outside the DI container, so the exception filter can't inject Sentry or the correlation ID. Registration order is execution order. Full list and ordering in `18-nestjs-conventions.md` §3.
- [ ] **Request context via AsyncLocalStorage** (`nestjs-cls`) — not a request-scoped provider. `Scope.REQUEST` instantiates the whole injection chain per request and does not exist in the worker at all. One singleton, identical behavior in both processes.
- [ ] **Correlation ID interceptor** — first interceptor to run. Generates a UUID per request (`x-request-id`), writes it into the CLS store, injects into all response headers and log lines. Every log, queue job, and SSE event spawned from a request carries this ID. Required for production debugging.
- [ ] **Queue jobs carry the correlation ID in their payload** — AsyncLocalStorage does not cross the Redis boundary. The enqueuing request reads it from CLS and writes it into the job data; the processor seeds its own CLS context from it. This is what makes an upload traceable from HTTP request through to `document.ready`.
- [ ] **Global exception filter** — catches ALL exceptions. AppExceptions return structured error envelope. ZodErrors return 422 with field details. Unknown errors return 500 with INTERNAL_ERROR code and zero internal details leaked. Full unknown errors sent to Sentry with correlation ID.
- [ ] **Error codes file** (`common/errors/error-codes.ts`) — typed constant object containing every error code the system can return. Frontend switches on these codes, never on error messages. No raw strings thrown anywhere in service code.
- [ ] **Custom exception classes** (`common/errors/app.exception.ts`) — `AppException` base class plus `NotFoundException`, `ForbiddenException`, `UnprocessableException`, `ConflictException`. Every throw in service code uses one of these. Never throws raw `HttpException`.
- [ ] **Zod validation pipe** — global, runs on every request body, param, and query before reaching the controller. Throws our `UnprocessableException` (**422**) built from `error.flatten().fieldErrors`, not NestJS's default 400. No unvalidated data ever reaches the service layer. A malformed UUID in a path 422s at the pipe — it never surfaces as a Postgres cast error in a repository.
- [ ] **Zod is the only schema language** — canonical schemas in `packages/shared`, wrapped by `createZodDto()` from `nestjs-zod` so controllers and OpenAPI reference the same object. `class-validator` and `class-transformer` are never installed. `patchNestJsSwagger()` runs once at bootstrap or generated OpenAPI silently omits every body schema. See `18-nestjs-conventions.md` §2.
- [ ] **Audit log interceptor** — runs after every mutating request (POST, PATCH, DELETE). Logs: user ID, firm ID, method, path, status code, duration, correlation ID. Written to structured logger, not to the database directly.
- [ ] **Request logging interceptor** — logs every incoming request: method, path, user ID, correlation ID, response status, duration. INFO level for normal requests, WARN for 4xx, ERROR for 5xx.

### 1E — Repository Pattern (required for testability)

- [ ] Every module has a repository class between the service and Drizzle
- [ ] Services never import the Drizzle client directly — only their own repository
- [ ] Repositories only contain database query logic — no business rules, no HTTP concerns
- [ ] Repository interface defined per module — allows mock injection in unit tests
- [ ] Every repository list method explicitly includes `isNull(table.deletedAt)` in WHERE clause — never relies on a global middleware
- [ ] Pattern enforced in code review — PRs that query Drizzle from a service are rejected

### 1F — API Versioning `[CRITICAL — must be set before first endpoint ships]`

- [ ] `app.setGlobalPrefix('v1', { exclude: ['/health'] })` in `main.ts`
- [ ] All routes are `/v1/{resource}` from day one — cannot be added after the law firm integrates their intake form
- [ ] `/health` stays at root — Railway uses it for health monitoring and must not be versioned
- [ ] All documented routes in this checklist understood to be prefixed `/v1/` — `/transactions/:id` means `/v1/transactions/:id`
- [ ] `[PHASE 2]` Enable `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })` when introducing breaking v2 routes. Add `Deprecation` and `Sunset` headers to v1 responses.

### 1F — Health Check

- [ ] `GET /health` endpoint returns:
  ```json
  {
    "status": "ok",
    "checks": {
      "database": "ok",
      "redis": "ok",
      "storage": "ok"
    },
    "version": "1.0.0",
    "uptime": 12345
  }
  ```
- [ ] Returns 503 with `"status": "degraded"` if any check fails — Railway uses this for health monitoring
- [ ] `GET /health` is public — no auth required

---

## Layer 2 — Auth `[PHASE 1 — simplified single-tenant]`

### How Auth Works — Two Separate Records, One Flow

Supabase Auth manages credentials. Your Postgres `users` table manages application identity. These are two different things that stay synchronized.

- **Supabase Auth user** — lives in Supabase's `auth.users`. Has UUID, email, hashed password, session tokens. You do not own this table.
- **Your application User** — lives in your `users` table. Has `auth_id` FK pointing to the Supabase Auth UUID. Has all application fields: `role`, `firm_id`, `full_name`, `is_active`, `bar_number`.

On every authenticated request:
```
Bearer token arrives
  → JwtAuthGuard validates JWT against Supabase JWT secret
  → Extract sub (Supabase Auth UUID) from validated token
  → Redis check: get('user:{sub}')
      hit  → return cached User object (5-min TTL)
      miss → query users WHERE auth_id = sub
               → is_active = false → throw 401 USER_INACTIVE immediately
               → cache result with 5-min TTL
               → attach to request.user
  → @CurrentUser() reads request.user in any controller
```

### Two Auth Flows — Document Both Separately

- [ ] **Attorney flow** — email + password via Supabase Auth. Standard login. Returns access token + refresh token. Frontend stores both.
- [ ] **Client flow** — magic link only. Attorney triggers invitation from CounselOS. Supabase sends magic link email. Client clicks link, gets authenticated, gets JWT. Client User record already exists (created by attorney invitation). Clients never set a password.

### JWT Strategy

- [ ] Supabase JWT secret configured in NestJS passport-jwt strategy
- [ ] JWT validated on every protected request — signature, expiry, issuer
- [ ] `sub` claim extracted from validated token — this is the Supabase Auth UUID
- [ ] User hydration from `sub` → Redis cache → Postgres, in that order
- [ ] **Token expiry handling** — expired token returns `error.code: "TOKEN_EXPIRED"` not generic 401, so frontend knows to refresh rather than redirect to login
- [ ] **Deactivated user handling** — `is_active = false` checked on User record during hydration. Returns 401 with `error.code: "USER_INACTIVE"` immediately. Does not wait for JWT expiry. Access revoked within one cache TTL (5 minutes maximum).
- [ ] **Token refresh** — frontend responsibility. On 401 TOKEN_EXPIRED, frontend calls Supabase refresh endpoint silently, gets new access token, retries original request transparently. Backend never sees the refresh — it just receives a valid new token.
- [ ] `[PHASE 2]` Add `firm_id` as a claim in the JWT payload itself. Eliminates DB lookup for firm scoping on every request. Issued at login time.

### Guards & Decorators

- [ ] `JwtAuthGuard` — applied globally via `APP_GUARD`. Public routes decorated with `@Public()` explicitly. Protected by default.
- [ ] `RolesGuard` — applied globally via `APP_GUARD` after JwtAuthGuard. Routes decorated with `@Roles(UserRole.ATTORNEY)` enforce role check.
- [ ] `@CurrentUser()` decorator — reads `request.user`. Always populated by JwtAuthGuard before any controller runs. Never undefined on protected routes.
- [ ] `@Public()` decorator — marks routes that skip JWT validation. Intake form submission, health check, client magic link callback.

### Role Hierarchy — Enforced, Not Assumed

Every role's permissions documented and enforced by RolesGuard. No engineer decides role access ad hoc.

```
OWNER
  → Everything. Manage users, access all transactions,
    all settings, all data.

ATTORNEY
  → Create and edit transactions
  → Upload and manage documents
  → Generate and approve drafts
  → Confirm and dismiss deadlines
  → Access chat on any transaction
  → View and manage leads
  → Cannot manage other users (OWNER only)

PARALEGAL
  → Upload documents
  → View transactions and deadlines
  → Request draft generation (cannot approve)
  → View chat sessions (cannot create new sessions)
  → Cannot create transactions
  → Cannot confirm deadlines
  → Cannot approve drafts

CLIENT
  → Read-only access to their own transaction status page only
  → Download documents marked client_visible
  → No access to any attorney-facing surface
  → No access to other transactions — enforced at query level
```

### User Table Fields — Finalized

- [ ] `id` — UUID PK
- [ ] `auth_id` — UUID, unique, FK to Supabase Auth UUID. Indexed. Used for every JWT lookup.
- [ ] `firm_id` — UUID FK → firms. Hardcoded in Phase 1, dynamic in Phase 2.
- [ ] `email` — string, unique
- [ ] `full_name` — string
- [ ] `role` — enum: OWNER, ATTORNEY, PARALEGAL, CLIENT
- [ ] `phone` — string, nullable
- [ ] `bar_number` — string, nullable (attorneys only)
- [ ] `is_active` — boolean, default true. Setting false immediately revokes access within cache TTL.
- [ ] `last_seen_at` — DateTime, nullable. Updated on each authenticated request via interceptor.
- [ ] `invited_by_id` — UUID?, FK → users. Set when attorney invites a client. Null for attorneys.
- [ ] `transaction_id` — UUID?, FK → transactions. Set for CLIENT role — the only transaction they can access.
- [ ] `created_at`, `updated_at` — standard timestamps

> `[PHASE 2]` Full multi-tenancy: enforce RLS, add `@CurrentFirm()` decorator, remove hardcoded firm_id, implement two-firm isolation tests across all endpoints. Add `firm_id` to JWT payload at login.

---

## Layer 3 — Transaction Management `[PHASE 1]`

Real estate transactions, not generic cases. Entity names, status enums, and party types are all real estate specific. Parties are a separate table — never a column on the transaction.

### 3A — Transaction Entity

All fields and justification. `src/database/schema.ts` is the source of truth.

- [ ] `id` — UUID PK
- [ ] `firm_id` — UUID FK → firms. Hardcoded in Phase 1.
- [ ] `transaction_number` — string, unique per firm. Auto-generated on creation: `RE-2025-0042`. Human-readable identifier attorneys use in emails, calls, and documents. UUID alone is not usable in conversation.
- [ ] `title` — string. Auto-generated: "Martinez / Chen — 2847 Manor Rd". Attorney can override.
- [ ] `property_address` — string. Full street address.
- [ ] `property_city` — string. Default "Austin".
- [ ] `property_state` — string. Default "TX".
- [ ] `property_zip` — string.
- [ ] `transaction_type` — enum: PURCHASE, SALE, REFINANCE, LEASE, COMMERCIAL
- [ ] `status` — enum: INTAKE, UNDER_CONTRACT, DUE_DILIGENCE, TITLE_REVIEW, CLOSING_PREP, CLOSED, FALLEN_THROUGH. Most queried field after firm_id. Indexed.
- [ ] `effective_date` — DateTime, nullable. **The anchor date.** All contractual deadline calculations start from this date. Without it deadlines cannot be auto-computed. Most important date field on the transaction.
- [ ] `contract_date` — DateTime, nullable. When contract was signed. May differ from effective date.
- [ ] `option_period_expiry` — DateTime, nullable. Computed from effective_date + option period days when known.
- [ ] `financing_deadline` — DateTime, nullable.
- [ ] `inspection_deadline` — DateTime, nullable.
- [ ] `title_deadline` — DateTime, nullable.
- [ ] `closing_date` — DateTime, nullable. Indexed — dashboard sorts by this.
- [ ] `possession_date` — DateTime, nullable.
- [ ] `purchase_price` — Decimal, nullable.
- [ ] `earnest_money_amount` — Decimal, nullable. Attorneys reference this constantly. Belongs on root entity not buried in a document.
- [ ] `option_fee` — Decimal, nullable.
- [ ] `assigned_attorney_id` — UUID FK → users. Required. Indexed.
- [ ] `assigned_paralegal_id` — UUID FK → users. Nullable.
- [ ] `internal_notes` removed — replaced by `matter_notes` table. See Layer 3G.
- [ ] `tags` — string array. `['cash_purchase', 'estate_sale', 'new_construction']`. Simple array column, no separate tags table.
- [ ] `is_archived` — boolean, default false. Archived transactions hidden from active dashboard but remain queryable.
- [ ] `deleted_at` — DateTime, nullable. Soft delete. Drizzle has no middleware equivalent — every list query adds `WHERE deleted_at IS NULL` explicitly via the `notDeleted` helper.
- [ ] `created_at` — DateTime @default(now())
- [ ] `updated_at` — DateTime @updatedAt
- [ ] `closed_at` — DateTime, nullable. Set automatically when status transitions to CLOSED or FALLEN_THROUGH.

### 3B — Party Entity (Separate Table — Not a Column)

Parties are their own table with FK to transactions. One transaction has 8–10 parties. You cannot store them as a column. Separate table enables querying "all transactions where Independence Title is the title company."

- [ ] `id` — UUID PK
- [ ] `transaction_id` — UUID FK → transactions, CASCADE delete
- [ ] `firm_id` — UUID FK → firms
- [ ] `role` — enum: BUYER, SELLER, BUYERS_AGENT, SELLERS_AGENT, TITLE_COMPANY, LENDER, INSPECTOR, SURVEYOR, OPPOSING_COUNSEL, HOA, OTHER
- [ ] `type` — enum: PERSON, ORGANIZATION
- [ ] `name` — string. Full name or company name.
- [ ] `email` — string, nullable
- [ ] `phone` — string, nullable
- [ ] `company_name` — string, nullable. For agents: their brokerage. For title: company name.
- [ ] `license_number` — string, nullable. TREC license for agents, bar number for attorneys.
- [ ] `address` — string, nullable
- [ ] `notes` — string, nullable. Role-specific context: lender loan number and rate, title company file number and closer name, HOA management company contact.
- [ ] `created_at`, `updated_at` — standard timestamps

### 3C — Status Transitions (Enforced in Service Layer)

Status transitions are validated before any status update persists. Invalid transitions throw `INVALID_STATUS_TRANSITION`. This lives in `src/modules/transactions/transaction-status.transitions.ts`.

```
INTAKE           → UNDER_CONTRACT, FALLEN_THROUGH
UNDER_CONTRACT   → DUE_DILIGENCE, FALLEN_THROUGH
DUE_DILIGENCE    → TITLE_REVIEW, UNDER_CONTRACT, FALLEN_THROUGH
TITLE_REVIEW     → CLOSING_PREP, DUE_DILIGENCE, FALLEN_THROUGH
CLOSING_PREP     → CLOSED, FALLEN_THROUGH
CLOSED           → (terminal — no exits)
FALLEN_THROUGH   → (terminal — no exits)
```

- [ ] `VALID_TRANSITIONS` map defined in `transaction-status.transitions.ts`
- [ ] `validateTransition(current, next)` utility function — throws `UnprocessableException` with `INVALID_STATUS_TRANSITION` error code if transition not in map
- [ ] `validateTransition` called in `TransactionsService.updateStatus()` before any DB write
- [ ] `closed_at` set automatically in `updateStatus()` when transitioning to CLOSED or FALLEN_THROUGH
- [ ] Status transition logged to activity log automatically in `updateStatus()` — never relies on caller to log it

### 3D — Activity Log Entity

Immutable append-only log of everything that happens on a transaction. No `updated_at`. No `deleted_at`. Facts cannot be edited or deleted.

- [ ] `id` — UUID PK
- [ ] `transaction_id` — UUID FK → transactions, CASCADE delete
- [ ] `firm_id` — UUID FK → firms
- [ ] `user_id` — UUID FK → users, nullable. Null for system-generated events (document processing completing, deadline alert firing).
- [ ] `event_type` — string. Typed constant from `EventType` enum. Never a raw freeform string.
- [ ] `description` — string. Human-readable. Written in code, not generated by AI. Shown in the activity feed. Examples: "Status changed from Under Contract to Due Diligence", "Purchase Agreement uploaded by Sarah Kim", "Option period deadline confirmed by James Okafor"
- [ ] `metadata` — JSON, nullable. Structured context per event type. Status change: `{ from, to }`. Document upload: `{ documentId, documentName, documentType }`. Deadline confirmed: `{ deadlineId, deadlineType, dueAt }`.
- [ ] `created_at` — DateTime @default(now()). Only timestamp. No updated_at. No deleted_at.

Event types defined as typed constants in `src/common/events/event-types.ts`:

```
transaction.created
transaction.status_changed
transaction.archived
transaction.notes_updated
document.uploaded
document.ready
document.failed
document.deleted
document.made_client_visible
deadline.extracted
deadline.confirmed
deadline.dismissed
deadline.completed
deadline.alert_sent
deadline.added_manually
draft.generated
draft.approved
draft.sent
party.added
party.updated
party.removed
client.invited
client.portal_accessed
chat.session_started
```

- [ ] `EventType` constant object exported from `event-types.ts` — all event types defined here, never as raw strings inline
- [ ] `ActivityLogService` created — single `log(params)` method. All modules use this service to write activity. Never write to activity_logs table directly from a feature module.
- [ ] `ActivityLogService` is a thin wrapper — no business logic, just write and return. Failures are caught and logged but never throw — a failed activity log write must never break the main operation.

### 3E — CRUD Endpoints & Queries

- [ ] `POST /transactions` — creates transaction, auto-generates `transaction_number` and `title`, logs `transaction.created` activity
- [ ] `GET /transactions` — paginated list. Filters: status, transaction_type, assigned_attorney_id, closing_date range. Sort: closing_date ASC (soonest closing first by default), updated_at DESC, status. Default excludes archived and deleted.
- [ ] `GET /transactions/:id` — single transaction with parties included. Excludes soft-deleted.
- [ ] `PATCH /transactions/:id` — partial update. Status changes routed through `updateStatus()` which enforces transition map.
- [ ] `PATCH /transactions/:id/status` — dedicated status endpoint. Calls `validateTransition`, updates status, sets `closed_at` if terminal, logs activity.
- [ ] `PATCH /transactions/:id/archive` — sets `is_archived = true`. Logs activity.
- [ ] `GET /transactions/:id/activity` — paginated activity log for a transaction, newest first.
- [ ] `GET /transactions/search` — Phase 1 uses Postgres `ILIKE` across `property_address`, party `name` columns, `internal_notes`. Returns transaction list. Not full-text search yet — that is Phase 2 with `tsvector`.

### 3F — Indexes Required

Defined in `schema.ts` using Drizzle's `.indexes()` on each table definition.

- [ ] `firm_id` — on all tables (future RLS enforcement, every query filters by this)
- [ ] `status` — on transactions (dashboard filters constantly by status)
- [ ] `closing_date` — on transactions (default sort order on dashboard)
- [ ] `assigned_attorney_id` — on transactions (filter by attorney view)
- [ ] `transaction_id` — on parties, activity_logs, documents, deadlines, chat_sessions (all child queries filter by this)
- [ ] `auth_id` — on users (JwtAuthGuard looks this up on every single request — must be indexed or every auth check is a full table scan)
- [ ] `event_type` — on activity_logs (filtering by event type in activity feed)
- [ ] `due_at` — on deadlines (deadline scheduler queries all active deadlines ordered by this hourly)
- [ ] `embedding` — HNSW index on document_chunks. Created via raw SQL in a migration: `CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`

> `[PHASE 2]` Rename/extend Transaction to Case entity. Add `practice_area` enum. PI-specific fields (incident_date, statute_of_limitations_date, contingency_rate) added as nullable columns. Party roles extended for PI: PLAINTIFF, DEFENDANT, INSURANCE_CARRIER, JUDGE, EXPERT_WITNESS, TREATING_PROVIDER.

---

## Layer 4 — Document Pipeline `[PHASE 1]`

The most critical layer. Every intelligent feature depends on this working correctly. Build this before chat, deadlines, or drafts — they all consume its output.

### 4A — Document Entity

- [ ] `id` — UUID PK
- [ ] `transaction_id` — UUID FK → transactions, CASCADE delete
- [ ] `firm_id` — UUID FK → firms
- [ ] `type` — enum: PURCHASE_AGREEMENT, LEASE, TITLE_COMMITMENT, SURVEY, INSPECTION_REPORT, CLOSING_DISCLOSURE, DEED, AMENDMENT, ADDENDUM, CORRESPONDENCE, OTHER. Set by classifier if not provided by uploader.
- [ ] `name` — string. Display name shown in UI. Defaults to original filename without extension.
- [ ] `original_filename` — string. Preserved exactly as uploaded.
- [ ] `mime_type` — string. Validated on upload against allowed list.
- [ ] `size_bytes` — integer. Stored for display and enforcement.
- [ ] `storage_key` — string. Supabase Storage object path. Format: `{firmId}/{transactionId}/{uuid}.{ext}`. Never a URL — signed URLs generated on demand via `supabase.storage.from('documents').createSignedUrl(key, 900)`.
- [ ] `processing_status` — enum: PENDING, PROCESSING, EXTRACTING, EMBEDDING, READY, FAILED
- [ ] `processing_error` — string, nullable. Set when status → FAILED. Human-readable. "LibreOffice failed to convert this file format" not a stack trace.
- [ ] `page_count` — integer, nullable. Set after extraction. Required for citation page validation.
- [ ] `is_client_visible` — boolean, default false. Attorney explicitly marks documents visible to client. Never automatic.
- [ ] `uploaded_by_id` — UUID FK → users
- [ ] `deleted_at` — DateTime, nullable. Soft delete.
- [ ] `created_at`, `updated_at` — standard timestamps

### 4B — Pre-Upload Validation (Before Anything Touches Supabase Storage)

These checks run at the API layer before any file is written to storage. Fail fast, fail clearly.

- [ ] **Allowed MIME types whitelist** — only these pass:
  ```
  application/pdf
  application/msword
  application/vnd.openxmlformats-officedocument.wordprocessingml.document
  application/vnd.ms-excel
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  image/jpeg
  image/png
  image/tiff
  ```
  Any other MIME type → 422 with `FILE_TYPE_NOT_ALLOWED` error code immediately.
- [ ] **Magic bytes validation** — MIME type from Content-Type header can be spoofed. Read the first 8 bytes of the file buffer and validate against the actual file signature. A renamed `.exe` will not pass this check even if sent as `application/pdf`.
- [ ] **File size limit** — maximum 50MB per file. Above this → 422 with `FILE_TOO_LARGE` error code. A 500MB scanned PDF must never reach the queue — it will silently timeout and leave the document stuck in PROCESSING forever.
- [ ] **Filename sanitization** — strip path traversal characters (`../`, `/`), control characters, and non-ASCII from original filename before storing.
- [ ] All three checks run synchronously in the upload controller before any async work begins.

### 4C — Upload Flow

- [ ] Upload endpoint `POST /transactions/:id/documents` — multipart/form-data
- [ ] Pre-upload validation runs (4B above) — any failure returns immediately, nothing written to storage
- [ ] File uploaded to Supabase Storage via service client: `supabase.storage.from('documents').upload(storageKey, buffer, { contentType: mimeType })`
- [ ] Storage key format: `{firmId}/{transactionId}/{uuid}.{ext}`
- [ ] Document record created in DB with status PENDING
- [ ] Processing job enqueued to BullMQ with document_id as payload
- [ ] Response returned immediately — `{ success: true, data: { id, status: 'PENDING' } }`. Do not wait for processing.
- [ ] `document.uploaded` activity logged

### 4D — Processing Pipeline (BullMQ Worker)

Each stage is discrete. If a stage fails, the error is stored on the document record and status → FAILED. The job does NOT retry into a bad stage — it retries from the beginning with backoff.

```
Stage 1 — Pick up job
  Update document status → PROCESSING
  Emit SSE: { type: 'document.status', documentId, status: 'PROCESSING' }

Stage 2 — Convert
  If DOCX/DOC: LibreOffice --headless --convert-to pdf
  If already PDF: skip conversion
  If image (JPEG/PNG/TIFF): wrap in PDF for consistent extraction
  Failure here → status FAILED, error: "Conversion failed — file may be corrupted"

Stage 3 — Extract text
  pdf-parse or pdfjs-dist extracts raw text per page
  Store page_count on document record
  Failure: if zero text extracted (scanned image PDF) → flag for OCR path [PHASE 2]
  Phase 1: if zero text extracted → status FAILED, error: "No extractable text found — document may be a scanned image"

Stage 4 — Classify
  DETERMINISTIC — no AI call. Zero cost, zero latency, zero failure mode.
  `classifyDocument(extractedText)` from `src/modules/documents/classifiers/document-classifier.ts`
  Checks TREC form number first (most reliable), then keyword scoring on first 2,000 characters.
  Returns one of the DocumentType enum values. Defaults to OTHER on no match.
  If uploader set the type explicitly → skip classifier, use provided type.
  Attorney can correct the classification in one click from the document list.
  Cost of misclassification: attorney sets a dropdown. No legal consequence.

Stage 5 — Chunk
  Split extracted text into overlapping chunks
  Parameters (locked — do not let engineers choose their own):
    chunk_size: 512 tokens
    chunk_overlap: 50 tokens
    splitter: paragraph-aware — prefer splitting at paragraph boundaries, 
              fall back to token count if paragraph exceeds chunk_size
  Result: array of { content, page_number, chunk_index, token_count }

Stage 6 — Embed
  For each chunk: call Voyage AI voyage-law-2 embedding API
  Batch chunks in groups of 8 — Voyage AI supports batch embedding
  Result: 1024-dimension vector per chunk
  Embedding cache check first: Redis key 'emb:{sha256(content)}'
    hit → use cached vector, skip API call
    miss → embed, cache with 7-day TTL

Stage 7 — Store chunks
  Bulk insert all DocumentChunk records in one transaction
  Each chunk: { document_id, transaction_id, firm_id, content, embedding, page_number, chunk_index, token_count }
  Update document status → READY
  Emit SSE: { type: 'document.status', documentId, status: 'READY', pageCount }
  Log 'document.ready' activity
```

- [ ] BullMQ queue config: concurrency 5, attempts 3, backoff exponential starting at 5s
- [ ] On all 3 attempts exhausted: status → FAILED, `processing_error` set, `document.failed` activity logged, Resend email to assigned attorney: "Document '{name}' failed to process"
- [ ] Dead letter queue receives exhausted jobs — never silently dropped

### 4E — DocumentChunk Entity

- [ ] `id` — UUID PK
- [ ] `document_id` — UUID FK → documents, CASCADE delete
- [ ] `transaction_id` — UUID FK → transactions. Denormalized for fast vector search filtering.
- [ ] `firm_id` — UUID FK → firms. Denormalized. Pre-filters vector search to this firm's chunks only.
- [ ] `content` — text. Raw chunk text. Returned in RAG results without a second query.
- [ ] `embedding` — vector(1024). The Voyage AI embedding. HNSW indexed.
- [ ] `page_number` — integer, nullable. Used in citations.
- [ ] `chunk_index` — integer. Position of this chunk within the document.
- [ ] `token_count` — integer. Used by RAG context assembler to respect token budget.
- [ ] `created_at` — DateTime @default(now())
- [ ] HNSW index: `CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`

### 4F — Remaining Endpoints

- [ ] `GET /transactions/:id/documents` — list all non-deleted documents for a transaction
- [ ] `GET /transactions/:id/documents/:docId` — single document metadata
- [ ] `GET /transactions/:id/documents/:docId/download` — generate Supabase Storage signed URL via `supabase.storage.from('documents').createSignedUrl(key, 900)`. Returns URL only — never streams file through backend.
- [ ] `DELETE /transactions/:id/documents/:docId` — soft delete only. Sets `deleted_at`. Logs `document.deleted`. Does NOT delete from Supabase Storage or remove chunks — data preserved for potential restore.

> `[PHASE 2]` Add PI-specific document types: MEDICAL_RECORD, COURT_FILING, POLICE_REPORT, INSURANCE_LETTER, DEMAND_LETTER, DEPOSITION, EXPERT_REPORT. Add OCR pipeline for scanned documents (Tesseract or AWS Textract). Document classifier extended for all practice areas. TREC form version detection added to classifier.

---

## Layer 5 — Transaction Intelligence Chat `[PHASE 1]`

### 5A — Entities

- [ ] **ChatSession** — `id`, `transaction_id`, `firm_id`, `created_by_id`, `title` (nullable, auto-generated from first message), `created_at`
- [ ] **ChatMessage** — `id`, `session_id`, `firm_id`, `role` (USER/ASSISTANT), `content`, `citations` (JSONB array), `tokens_used` (integer, nullable), `model_used` (string, nullable), `created_at`
- [ ] **Citation schema** (stored in JSONB on each message) — `document_id`, `document_name`, `page_number`, `chunk_id`, `relevance_score`, `excerpt` (max 200 chars of the cited chunk — enough to show context, not enough to reproduce the document)

### 5B — RAG Pipeline (Exact Spec)

Every engineer on the team builds this the same way. These numbers are not suggestions.

- [ ] **Query embedding** — user message embedded with `voyage-law-2` (same model as document chunks — required for cosine similarity to be meaningful)
- [ ] **Pre-filter before vector search** — `WHERE transaction_id = :transactionId AND firm_id = :firmId AND deleted_at IS NULL`. Vector search runs only against this transaction's chunks. Never runs across all chunks in the DB.
- [ ] **Vector search** — cosine similarity search against filtered chunks. `ef_search = 40` at query time. Returns top 20 candidates by similarity score.
- [ ] **Relevance threshold** — discard any chunk with cosine similarity below 0.70. If all 20 candidates fall below 0.70, no chunks pass. This is the no-results path (see 5C).
- [ ] **Token budget assembly** — assemble context from passing chunks in descending relevance order. Hard budget: **6,000 tokens** of retrieved context. Count `token_count` on each chunk cumulatively. Stop adding chunks when the budget would be exceeded. Never truncate a chunk — either include it fully or skip it. The 6,000 token budget leaves sufficient room for the system prompt, conversation history, and Claude's response within the model's context window.
- [ ] **Final K** — the number of chunks actually included is whatever fits within 6,000 tokens above the 0.70 threshold. Never a fixed K. Document this explicitly: K is not fixed, it is budget-constrained.

### 5C — No-Results Fallback (Required — Prevents Hallucination)

When zero chunks pass the 0.70 relevance threshold, the system must NOT pass an empty context to Claude and let it answer from training data. That path produces hallucinated legal information which is a liability.

- [ ] Threshold check runs before LLM call — if `passingChunks.length === 0`, skip the LLM entirely
- [ ] Return a deterministic fallback response — not generated by AI:
  ```
  "I could not find information about that in the uploaded documents for this transaction. 
   If the relevant document has not been uploaded yet, please upload it and ask again."
  ```
- [ ] Fallback response stored as a ChatMessage with `role: ASSISTANT` — session history is consistent
- [ ] Fallback includes no citations array — empty array, not null
- [ ] Fallback does NOT call Anthropic API — zero token cost, zero hallucination risk

### 5D — Prompt Construction

- [ ] **System prompt** — assembled server-side every time, never stored. Contains:
  - Firm name and assigned attorney name
  - Transaction summary: property address, transaction type, status, all party names and roles, all confirmed key dates
  - Explicit instruction: "Answer only from the provided document context. If the context does not contain the answer, say so. Never speculate or answer from general knowledge about real estate."
  - Instruction to cite: "For every factual claim, include the document name and page number in your response."
- [ ] **Conversation history** — last 10 messages loaded from Redis cache (`chat:{sessionId}:history`, 2-hour TTL). Injected after system prompt. Prevents re-reading DB on every message turn.
- [ ] **Retrieved context** — assembled chunks injected after conversation history, formatted as:
  ```
  [Document: Purchase Agreement — 2847 Manor Rd, Page 4]
  {chunk content}

  [Document: Amendment 1, Page 1]
  {chunk content}
  ```
- [ ] **User message** — appended last

### 5E — Streaming & Persistence

- [ ] Chat endpoint `POST /transactions/:id/chat/:sessionId/messages` — triggers RAG pipeline, streams response via SSE
- [ ] SSE events: `{ type: 'token', content: '...' }` per token, `{ type: 'citations', data: [...] }` after stream completes, `{ type: 'done' }` as final event
- [ ] On stream complete: full assistant message + citations persisted to DB as ChatMessage record
- [ ] Conversation history in Redis updated with both the user message and completed assistant message
- [ ] `POST /transactions/:id/chat` — creates new session, returns session id
- [ ] `GET /transactions/:id/chat` — list all sessions for transaction, newest first
- [ ] `GET /transactions/:id/chat/:sessionId` — session with all messages, used to restore a previous conversation
- [ ] `GET /transactions/:id/chat/:sessionId/messages?since={lastMessageId}` — chat reconnect recovery. Returns messages after the given ID. Each message includes `is_complete: boolean` and, when a message is still generating, `partial_content: string` with the tokens produced so far. This is how the frontend recovers a dropped chat stream — it polls this endpoint rather than replaying tokens. If `since` is omitted, returns all messages in the session.

> `[PHASE 2]` Extend RAG to query across multiple transactions for firm-wide intelligence. Add streaming abort — attorney can cancel mid-generation. Token usage tracked per firm per month for cost allocation and potential billing.

---

## Layer 6 — Deadline Intelligence `[PHASE 1 — highest priority for real estate]`

Missing a real estate deadline is a deal killer. This is the feature that closes the demo. Built and demoed before any other feature is polished.

### 6A — Deadline Entity

- [ ] `id` — UUID PK
- [ ] `transaction_id` — UUID FK → transactions, CASCADE delete
- [ ] `firm_id` — UUID FK → firms
- [ ] `title` — string. Human-readable. "Option Period Expiry", "Financing Contingency Deadline". Written by extraction logic or attorney — never generated freeform by LLM.
- [ ] `description` — string, nullable. Additional context. "Per Section 5 of the Purchase Agreement signed June 2, 2025."
- [ ] `due_at` — DateTime. The actual deadline. Indexed — scheduler queries by this every hour.
- [ ] `type` — enum: OPTION_PERIOD_EXPIRY, FINANCING_CONTINGENCY, INSPECTION_DEADLINE, CLOSING_DATE, TITLE_COMMITMENT_DEADLINE, SURVEY_DEADLINE, HOA_APPROVAL, POSSESSION_DATE, OTHER
- [ ] `status` — enum: PENDING_REVIEW, ACTIVE, COMPLETED, DISMISSED
- [ ] `urgency` — enum: INFO, WARNING, URGENT, CRITICAL. Computed by scheduler. Stored for dashboard sorting. Busted on each scheduler run.
  - INFO: 14+ days remaining
  - WARNING: 7–13 days remaining
  - URGENT: 3–6 days remaining
  - CRITICAL: 0–2 days remaining
- [ ] `source_document_id` — UUID FK → documents, nullable. The document this deadline was extracted from. NULL for manually added deadlines. Attorney can click through to see exactly which page triggered this deadline.
- [ ] `auto_extracted` — boolean. **TRUE = extracted by AI from a document. FALSE = manually added by attorney.** This is the single flag that distinguishes these two cases. The UI renders them differently: auto-extracted deadlines show a "Source: Amendment 1, Page 2" link. Manual deadlines show "Added manually by James Okafor." Never set TRUE on a deadline the attorney typed in.
- [ ] `superseded_by_id` — UUID FK → deadlines, nullable. **The amendment superseding field.** When a new amendment updates a deadline, the old deadline record is NOT deleted or dismissed — it is marked as superseded by pointing to the new deadline. Full history preserved. Attorney can see "Closing date was July 2, superseded by Amendment 1 to July 10, superseded by Amendment 2 to August 1."
- [ ] `supersedes_id` — UUID FK → deadlines, nullable. The inverse — the new deadline points back to the one it replaced.
- [ ] `confirmed_by_id` — UUID FK → users, nullable. Set when attorney confirms the deadline.
- [ ] `confirmed_at` — DateTime, nullable.
- [ ] `completed_at` — DateTime, nullable. Set when attorney marks deadline as done.
- [ ] `alerts_sent_at` — DateTime array. Every alert sent is logged here. Scheduler checks this before sending to prevent duplicates.
- [ ] `calendar_event_id` — string, nullable. External Google/Outlook event ID for sync.
- [ ] `deleted_at` — DateTime, nullable. Soft delete.
- [ ] `created_at`, `updated_at` — standard timestamps

### 6B — Extraction Flow

- [ ] Auto-extraction job triggered when document uploaded with type PURCHASE_AGREEMENT or AMENDMENT
- [ ] Extraction prompt sends document text to Claude — structured output only:
  ```json
  {
    "deadlines": [
      {
        "title": "Option Period Expiry",
        "type": "OPTION_PERIOD_EXPIRY",
        "due_at": "2025-06-09T23:59:59",
        "description": "Per Section 5, Paragraph B",
        "page_number": 3
      }
    ]
  }
  ```
- [ ] LLM returns structured JSON — never freeform text. `generateObject` from Vercel AI SDK with Zod schema enforcing the shape.
- [ ] **Source linking is required on every extraction.** Store `source_page`, `source_text` (the verbatim triggering sentence), and `extraction_confidence`. The review UI shows the attorney the source sentence beside the extracted date — verification becomes a glance instead of a re-read. This is the highest-leverage change available to the AI features; without it our AI *adds* a verification step rather than removing one.
- [ ] Review queue sorts low-confidence extractions first
- [ ] All extracted deadlines created with `status: PENDING_REVIEW`, `auto_extracted: true`, `source_document_id` set to the uploaded document
- [ ] Extracted deadlines are NOT active until attorney confirms — never fire alerts on PENDING_REVIEW

### 6C — Amendment Superseding Logic `[Critical — Transaction 2 in test data]`

When an amendment is uploaded that changes an existing deadline, the system must detect the superseding relationship and link records correctly. Closing date changed three times in Transaction 2 — the system must track all three and show only the current one as ACTIVE.

- [ ] On amendment extraction: for each extracted deadline, check whether a deadline of the same `type` already exists on this transaction with status ACTIVE or PENDING_REVIEW
- [ ] If match found — **do not create a duplicate and do not dismiss the old one**:
  - Create new deadline record with new `due_at` and `supersedes_id` pointing to old deadline
  - Update old deadline: set `superseded_by_id` pointing to new deadline, set `status: DISMISSED`
  - Log activity: "Closing date updated by Amendment 2 — previous date July 2 superseded, new date August 1 pending review"
- [ ] If no match found — create fresh deadline record as normal
- [ ] Superseding check is type-based — CLOSING_DATE supersedes CLOSING_DATE, FINANCING_CONTINGENCY supersedes FINANCING_CONTINGENCY
- [ ] Attorney still confirms the new superseding deadline before it becomes ACTIVE — the superseding detection does not auto-confirm
- [ ] Dashboard shows only non-superseded deadlines — `WHERE superseded_by_id IS NULL AND status != DISMISSED`
- [ ] Transaction history shows full chain: old deadline → new deadline linked via supersedes_id / superseded_by_id

### 6D — Manual Deadline Entry

Attorneys will add deadlines that come from no document — county permit deadlines, HOA board meeting dates, internal firm milestones.

- [ ] `POST /transactions/:id/deadlines` — accepts `title`, `type`, `due_at`, `description`. No `source_document_id` required.
- [ ] Records created with `auto_extracted: false`. Source document link never shown in UI for these.
- [ ] `superseded_by_id` check still runs — if attorney manually adds a CLOSING_DATE that matches an existing auto-extracted CLOSING_DATE, flag it for review rather than auto-superseding. Manual entries require explicit attorney action.
- [ ] Activity logged as `deadline.added_manually` — distinguishable from `deadline.extracted` in the feed

### 6E — Calendar Integration `[PHASE 1 — .ics download only]`

Phase 1 delivers .ics file download. Attorneys import the file into Google Calendar, Outlook, or Apple Calendar — the workflow they already use. Full Google Calendar OAuth sync is Phase 2.

- [ ] `GET /v1/transactions/:id/deadlines/:deadlineId/calendar` — generates .ics file for confirmed deadline
- [ ] .ics event format: `[CounselOS] {deadline.title} — {transaction.title}`, all-day event, description includes property address and transaction number
- [ ] `calendar_event_id` column kept on deadlines table for Phase 2 Google Calendar sync — NULL in Phase 1
- [ ] Deadline confirmation response includes the .ics download URL so attorney can import immediately

> `[PHASE 2]` Google Calendar OAuth: full push sync on confirm, update on amendment superseding, delete on dismiss. Microsoft Calendar. Two-way sync.

### 6F — Alert Scheduler & Endpoints

- [ ] Scheduler runs every hour via BullMQ repeatable job
- [ ] Query: all ACTIVE deadlines where `due_at > now()` and `deleted_at IS NULL`
- [ ] For each deadline: compute current urgency from `due_at - now()`
- [ ] If urgency changed since last run: update `urgency` field on deadline record
- [ ] Alert logic: send alert if urgency tier has not already been alerted. Check `alerts_sent_at` array — if no timestamp within the current urgency tier's window exists, send alert and append timestamp.
- [ ] Alert delivery: SSE push if attorney has open browser session + Resend email regardless
- [ ] OPTION_PERIOD_EXPIRY gets special handling — always CRITICAL once within 48 hours
- [ ] `POST /v1/transactions/:id/deadlines/:deadlineId/confirm` — transitions PENDING_REVIEW → ACTIVE. Returns .ics download URL for attorney to import. ATTORNEY or OWNER role only.
- [ ] `POST /v1/transactions/:id/deadlines/:deadlineId/complete` — transitions ACTIVE → COMPLETED. Sets `completed_at`.
- [ ] `POST /v1/transactions/:id/deadlines/:deadlineId/dismiss` — transitions PENDING_REVIEW → DISMISSED.
- [ ] `GET /v1/transactions/:id/deadlines` — all non-superseded deadlines for a transaction, ordered by `due_at` ASC
- [ ] `GET /v1/deadlines` — firm-wide deadline dashboard. All ACTIVE deadlines across all transactions. Sorted by urgency DESC then `due_at` ASC. This is the attorney's morning view.
- [ ] `GET /v1/transactions/:id/deadlines/:deadlineId/calendar` — .ics file fallback for attorneys without connected calendar

> `[PHASE 2]` Extend deadline types for PI: FILING, RESPONSE, DISCOVERY_CUTOFF, STATUTE_OF_LIMITATIONS, COURT_DATE, DEPOSITION, MEDIATION, EXPERT_DESIGNATION. 30-day INFO tier added for SoL tracking. SMS via Twilio for CRITICAL deadlines.

### 6G — TREC Business-Day Deadline Calculation Engine `[MOAT FEATURE — build after Phase 1 core]`

Upgrades extraction into correct Texas date math. The engine sits between Claude's extraction and attorney confirmation. This is a moat feature — the correctness is the barrier to entry. See `12-moat-features.md` for full spec.

- [ ] `holidays` table — Texas state + federal holidays, seeded a decade forward, columns: date, name, jurisdiction (FEDERAL / TX_STATE / COUNTY)
- [ ] Pure function `computeDeadline(effectiveDate, offsetDays, dayType, rollRule, holidays)` in `src/modules/deadlines/deadline-calculator.ts` — no I/O, exhaustively unit-tested
- [ ] `dayType`: CALENDAR (count every day) | BUSINESS (skip weekends/holidays) | TREC_DAYS (TREC-specific)
- [ ] `rollRule`: NONE (keep the date even on weekend/holiday) | NEXT_BUSINESS_DAY | PREVIOUS_BUSINESS_DAY
- [ ] TREC rule: effective date is "day zero" — counting starts the next day
- [ ] **The critical divergence:** EARNEST_MONEY_DELIVERY rolls to next business day; OPTION_FEE_DELIVERY does NOT roll. Same 3-day offset, same weekend, two different resulting dates.
- [ ] Deadline type → rule map applied on extraction (OPTION_PERIOD_EXPIRY = CALENDAR/NONE, OPTION_FEE_DELIVERY = TREC_DAYS/NONE, EARNEST_MONEY_DELIVERY = TREC_DAYS/NEXT_BUSINESS_DAY, etc.)
- [ ] New deadline types added: OPTION_FEE_DELIVERY, EARNEST_MONEY_DELIVERY
- [ ] `deadlines` table columns added: `day_type`, `roll_rule`, `calculation_note`
- [ ] `calculation_note` shows the attorney the math: "7 calendar days from effective date (June 2) = June 9"
- [ ] Extraction service calls `computeDeadline()` to convert Claude's relative deadline into a correct absolute date — never trusts Claude's arithmetic
- [ ] Computed deadlines still stage as PENDING_REVIEW with the calculation note visible
- [ ] Amendment changes effective date → engine recomputes all derived deadlines → existing superseding chain records the change
- [ ] **Test suite is the deliverable:** every Texas holiday, every leap year, every boundary (deadline landing on Saturday/Sunday/Juneteenth), and the earnest-money vs option-fee divergence on the same weekend

---

## Layer 7 — Document Draft Generation `[PHASE 1]`

### 7A — Entities (Two Tables, Not One)

**`drafts` table — the container, no content here:**
- [ ] `id` — UUID PK
- [ ] `transaction_id` — UUID FK → transactions, CASCADE delete
- [ ] `firm_id` — UUID FK → firms
- [ ] `type` — enum: AMENDMENT, EXTENSION_ADDENDUM, EARNEST_MONEY_DEMAND, LEASE_MODIFICATION, CLOSING_INSTRUCTION_LETTER, STATUS_UPDATE, OTHER
- [ ] `title` — string. Human-readable. "Amendment to Extend Closing Date — Martinez / Chen"
- [ ] `status` — enum: GENERATING, READY, IN_REVIEW, APPROVED, SENT, FAILED
- [ ] `current_version_id` — UUID FK → draft_versions, nullable. Points to the active version. Updated on every edit and rollback.
- [ ] `instructions` — string, nullable. Attorney's instructions to the AI before generation. "Extend the closing date by 30 days due to financing delay. Reference Section 9."
- [ ] `created_by_id` — UUID FK → users
- [ ] `approved_by_id` — UUID FK → users, nullable
- [ ] `approved_at` — DateTime, nullable
- [ ] `sent_at` — DateTime, nullable. Written manually by attorney when they mark it as sent. Phase 2 replaces with delivery confirmation.
- [ ] `generation_error` — string, nullable. Set when status → FAILED.
- [ ] `deleted_at` — DateTime, nullable. Soft delete.
- [ ] `created_at`, `updated_at` — standard timestamps

**`draft_versions` table — immutable content, append-only:**
- [ ] `id` — UUID PK
- [ ] `draft_id` — UUID FK → drafts, CASCADE delete
- [ ] `version_number` — integer. Starts at 1, increments on every save.
- [ ] `content` — text. Full markdown content of this version.
- [ ] `sections` — JSONB array. Structured section objects (see 7C below). Used by frontend to render sections individually.
- [ ] `generated_by` — enum: AI, USER. AI for first version, USER for every attorney edit.
- [ ] `edited_by_id` — UUID FK → users, nullable. Set when generated_by = USER.
- [ ] `created_at` — DateTime. Immutable once set. No `updated_at` — versions never change.

> Why two tables and not JSONB on drafts: Draft content can be 3,000–10,000 words. Storing multiple large versions in a JSONB array creates records that bloat to hundreds of KB, makes individual version queries painful, and cannot be indexed. Separate table with individual rows is the correct model for append-only versioned content.

### 7B — Async Generation Flow (Never Synchronous)

Draft generation takes 15–25 seconds for large documents. The HTTP endpoint returns immediately. The attorney's browser listens on SSE for completion.

- [ ] `POST /transactions/:id/drafts` — validates inputs, creates Draft record with `status: GENERATING`, enqueues to draft generation queue, returns `{ id: draftId, status: 'GENERATING' }` immediately
- [ ] BullMQ draft generation queue — concurrency 3, retry 2x, backoff 10s then 30s
- [ ] Worker assembles context (see 7D), calls Claude via `generateText` from Vercel AI SDK
- [ ] Worker parses response into structured sections (see 7C)
- [ ] Worker creates `draft_versions` record (version 1, `generated_by: AI`)
- [ ] Worker updates Draft: `current_version_id` set, `status → READY`
- [ ] SSE event emitted: `{ type: 'draft.ready', draftId, transactionId }`
- [ ] Activity logged: `draft.generated`
- [ ] On failure after all retries: `status → FAILED`, `generation_error` set, `draft.generation_failed` activity logged

### 7C — Section Schema (Structured, Not a Text Blob)

Each draft type has a defined section schema. Sections are stored in `draft_versions.sections` as a JSONB array. The frontend renders sections individually — attorney edits section by section, not the whole document at once.

- [ ] Section object shape:
  ```
  {
    key: string           — 'PARTIES', 'AMENDMENT_TERMS', 'SIGNATURES', etc.
    title: string         — human-readable section header
    content: string       — the section text
    ai_generated: boolean — true on first version
    attorney_edited: boolean — set true when attorney edits this section
  }
  ```
- [ ] Section schemas defined per draft type:
  - AMENDMENT: EFFECTIVE_DATE, PARTIES, PROPERTY, AMENDMENT_TERMS, SURVIVING_TERMS, SIGNATURES
  - EXTENSION_ADDENDUM: PARTIES, PROPERTY, ORIGINAL_DATE, NEW_DATE, CONSIDERATION, SIGNATURES
  - EARNEST_MONEY_DEMAND: PARTIES, PROPERTY, DEMAND_BASIS, AMOUNT, DEADLINE, SIGNATURES
  - LEASE_MODIFICATION: PARTIES, PROPERTY, ORIGINAL_TERM, MODIFICATION, EFFECTIVE_DATE, SIGNATURES
  - CLOSING_INSTRUCTION_LETTER: PARTIES, PROPERTY, TITLE_REQUIREMENTS, FUNDING_INSTRUCTIONS, SIGNATURES
  - STATUS_UPDATE: SALUTATION, CURRENT_STATUS, NEXT_STEPS, CONTACT
- [ ] Section schemas live in `src/modules/drafts/section-schemas.ts` — not hardcoded in the prompt

### 7D — Context Injection (Exact Spec)

The prompt assembler pulls from three sources. All three are assembled server-side in the worker before the LLM call.

- [ ] **Source 1 — Transaction record (always included, structured text):**
  Property address, transaction type, status, all confirmed party names and roles with contact info, all key dates (effective, closing, option expiry, financing deadline), purchase price, earnest money amount
- [ ] **Source 2 — Active confirmed deadlines (always included):**
  All ACTIVE deadlines formatted as: "Financing Contingency: June 23, 2025 (WARNING — 4 days remaining)"
- [ ] **Source 3 — RAG over uploaded documents (draft-type specific):**
  - AMENDMENT / EXTENSION_ADDENDUM: retrieve from PURCHASE_AGREEMENT and existing AMENDMENTs
  - EARNEST_MONEY_DEMAND: retrieve from PURCHASE_AGREEMENT only
  - CLOSING_INSTRUCTION_LETTER: retrieve from TITLE_COMMITMENT
  - LEASE_MODIFICATION: retrieve from LEASE
  - STATUS_UPDATE: no RAG — transaction context only
  - Token budget for draft RAG: 3,000 tokens (smaller than chat — draft itself is the main output)
  - Relevance threshold: 0.65 (slightly lower than chat — draft benefits from broader context)
- [ ] **Attorney instructions injected last** — if provided, appended before the generation prompt
- [ ] System prompt includes: firm name, draft type, section schema, instruction to output valid JSON matching section schema, instruction to use parties' correct legal names exactly as they appear in the contract, instruction never to invent dates or amounts not present in the provided context

### 7E — Edit and Version Flow

- [ ] Attorney edits a section in the UI → `PATCH /transactions/:id/drafts/:draftId/sections/:sectionKey`
- [ ] On section edit: create new `draft_versions` record with `version_number` incremented, `generated_by: USER`, `edited_by_id` set, sections updated with edited content and `attorney_edited: true` on changed section
- [ ] Draft `current_version_id` updated to new version
- [ ] `GET /transactions/:id/drafts/:draftId/versions` — list all versions for rollback UI
- [ ] `POST /transactions/:id/drafts/:draftId/versions/:versionId/restore` — sets `current_version_id` to specified version, creates new version that is a copy (preserves the restore action in history)
- [ ] Draft status → IN_REVIEW when attorney opens a READY draft for the first time

### 7F — Approval and Download (Phase 1 Send Flow)

- [ ] `POST /transactions/:id/drafts/:draftId/approve` — sets `approved_by_id`, `approved_at`, status → APPROVED. ATTORNEY or OWNER role only. Cannot approve own draft (approved_by_id must differ from created_by_id — enforced in service).
- [ ] `GET /transactions/:id/drafts/:draftId/download` — generates PDF from approved draft content using `pdf-lib`, uploads to Supabase Storage with a temp key (`drafts/{firmId}/{draftId}-approved.pdf`), returns signed 15-minute URL for download. Attorney downloads and emails themselves.
- [ ] `PATCH /transactions/:id/drafts/:draftId/mark-sent` — attorney manually marks as sent after emailing. Sets `sent_at`. Status → SENT. No automated delivery in Phase 1.
- [ ] Draft NEVER sent by the system in Phase 1. The `sent_at` field exists but is only written by explicit attorney action.

> `[PHASE 2]` Add: tracked changes diff format for line-by-line accept/reject review. Integrated email delivery with delivery confirmation. DocuSign or Adobe Sign integration for e-signatures. PI draft types: DEMAND_LETTER, LEGAL_MEMO, SETTLEMENT_OFFER, COMPLAINT, MOTION.

---

## Layer 8 — Simple Lead Intake `[PHASE 1 — simplified]`

### 8A — Lead Entity (Complete)

- [ ] `id` — UUID PK
- [ ] `firm_id` — UUID FK → firms
- [ ] `first_name` — string
- [ ] `last_name` — string
- [ ] `email` — string, nullable. Normalized to lowercase and trimmed on write.
- [ ] `phone` — string, nullable. Normalized to E.164 format on write (strip all formatting).
- [ ] `transaction_type` — enum: PURCHASE, SALE, REFINANCE, LEASE, COMMERCIAL, nullable. Set by attorney after review if not provided by lead.
- [ ] `property_address` — string, nullable. What the lead provided — may be informal ("house on Manor Rd").
- [ ] `inquiry_description` — text. What the lead told us. Preserved verbatim.
- [ ] `source` — string. Required. `'intake_form'`, `'phone'`, `'referral'`, `'walk_in'`. Set on creation.
- [ ] `referral_name` — string, nullable. If source is referral, who referred them.
- [ ] `status` — enum: NEW, REVIEWED, CONVERTED, REJECTED, DUPLICATE
- [ ] `assigned_attorney_id` — UUID FK → users, nullable. Defaults to firm owner if not specified.
- [ ] `duplicate_of_id` — UUID FK → leads, nullable. Set when this submission is detected as a duplicate of an existing lead. Linked to the original.
- [ ] `converted_transaction_id` — UUID FK → transactions, nullable. Set when status → CONVERTED.
- [ ] `ip_address` — string, nullable. Stored for rate limiting reference and fraud detection.
- [ ] `idempotency_key` — string, nullable. Frontend-generated UUID sent with submission. Stored to detect replay.
- [ ] `deleted_at` — DateTime, nullable. Soft delete.
- [ ] `created_at`, `updated_at` — standard timestamps

### 8B — Duplicate Detection (Two-Layer System)

Duplicate detection runs before any lead record is created. Two layers handle two different scenarios.

**Layer 1 — Idempotency key (prevents double-click duplicates):**
- [ ] Frontend generates a UUID when the intake form loads and includes it as header: `Idempotency-Key: {uuid}`
- [ ] On intake request: check Redis `GET intake:idempotency:{key}`
  - Cache hit → return cached response immediately, no DB touch
  - Cache miss → proceed to Layer 2
- [ ] After creating or finding a lead: `SET intake:idempotency:{key} {response} EX 86400` (24-hour TTL)
- [ ] If `Idempotency-Key` header missing: generate one server-side and proceed — do not reject

**Layer 2 — Time-window deduplication (prevents re-submission duplicates):**
- [ ] On every new submission, normalize email (lowercase + trim) and phone (E.164)
- [ ] Query: `SELECT id FROM leads WHERE firm_id = :firmId AND deleted_at IS NULL AND status NOT IN ('REJECTED') AND created_at > NOW() - INTERVAL '48 hours' AND (email = :email OR phone = :phone)`
- [ ] 48-hour window — covers Sunday night submissions seen Monday morning
- [ ] If match found:
  - Do NOT create a new lead record
  - Update existing lead's `updated_at`
  - Append resubmission metadata to a `resubmissions` JSONB field: `[{ submitted_at, ip_address }]`
  - Return HTTP 200 with `{ isDuplicate: true, originalLeadId: 'xxx', message: 'We already have your inquiry. Our team will be in touch shortly.' }`
  - Log no activity — this is not a new event
- [ ] If no match found: create new lead record, return HTTP 201

**Layer 3 — Attorney-flagged duplicates:**
- [ ] Attorney can manually mark a lead as DUPLICATE and link it to an existing lead via `duplicate_of_id`
- [ ] `PATCH /leads/:id` accepts `{ status: 'DUPLICATE', duplicate_of_id: 'uuid' }`
- [ ] Linked leads visible in the lead detail view — "This is a duplicate of lead #xxx submitted June 1"

### 8C — Public Intake Endpoint

- [ ] `POST /v1/leads` — unauthenticated, rate limited
- [ ] Rate limiting: 10 submissions per IP per hour (NestJS throttler)
- [ ] Global rate limit: 100 submissions per hour across all IPs (circuit breaker for spam attacks)
- [ ] Run idempotency check (8B Layer 1)
- [ ] Run duplicate detection (8B Layer 2)
- [ ] Validate required fields: at minimum one of (email, phone) must be present — cannot contact a lead with neither
- [ ] **Capture `referral_source_type` and `referral_source_name` at intake.** Free-text name deliberately — a dropdown kills capture rate. Copied to the transaction on conversion so attribution survives lead archival. Referral ROI is the highest-value analytics output and this is unrecoverable after the fact.
- [ ] Normalize email (lowercase + trim) and phone (E.164 format) before writing to DB
- [ ] Conflict check runs on creation — searches lead party names against all existing transaction parties. Sets `conflict_check_status` to CLEAR or FLAGGED.
- [ ] Resolve assigned attorney (see 8D below) — `assigned_attorney_id` always set on creation, never null
- [ ] Create lead record with `lead_status: NEW`, `source`, `ip_address`, `conflict_check_status`, `assigned_attorney_id`
- [ ] Enqueue email notification job → assigned attorney receives new lead email with conflict check status
- [ ] Emit SSE event on global firm stream: `{ type: 'lead.new', leadId, conflictCheckStatus }`
- [ ] Return 201 on new lead, 200 on duplicate (see above)
- [ ] Never return which attorney is assigned or any internal data in the public response

### 8D — Lead Assignment Logic

**Decision: configurable default in firm settings with fallback to OWNER.**
No round-robin. No complex routing. One setting, one service method.

- [ ] `firms.settings` JSONB includes `defaultLeadAttorneyId: string | null`
  - Set by OWNER via `PATCH /v1/firms/me/settings`
  - Defaults to null on firm creation
- [ ] `LeadAssignmentService.resolveAssignee(firmId)` runs on every new lead:
  ```
  1. Load firm settings from Redis cache (user:firmId:settings, 15-min TTL)
  2. If settings.defaultLeadAttorneyId is set:
       a. Verify user exists, role = ATTORNEY or OWNER, is_active = true
       b. If valid → return that user's ID as assigned_attorney_id
       c. If invalid (deactivated, wrong role) → log warning, fall to step 3
  3. Query users WHERE firm_id = firmId AND role = 'OWNER' AND is_active = true LIMIT 1
  4. Return that OWNER's ID
  5. If no active OWNER found → throw INTERNAL_ERROR
     (A firm must always have at least one active owner — this should never happen)
  ```
- [ ] If configured default attorney is deactivated: silently falls back to OWNER, logs a WARNING in Sentry. Firm admin is not auto-notified — they will see leads assigned to the wrong person and update settings.
- [ ] `PATCH /v1/firms/me/settings` accepts `defaultLeadAttorneyId` — OWNER role only. Validates the target user is ATTORNEY or OWNER and is_active = true before saving.

### 8E — Internal Endpoints

- [ ] `GET /v1/leads` — all leads, ordered by `created_at DESC`. Filterable by `lead_status`, `source`, `conflict_check_status`, date range. OWNER and ATTORNEY roles only.
- [ ] `GET /v1/leads/:id` — single lead detail including conflict check status and notes
- [ ] `PATCH /v1/leads/:id` — update status, assign attorney, add conflict check notes. OWNER and ATTORNEY roles only.
- [ ] `POST /v1/leads/:id/convert` — creates Transaction record from lead data, runs conflict check one final time, sets `converted_transaction_id`, updates `lead_status → CONVERTED`. Blocked if `conflict_check_status = FLAGGED` and not yet REVIEWED. Transactional — both writes succeed or both fail. Returns the new transaction ID.

> `[PHASE 2]` Full AI intake agent: multi-turn qualification conversation, AI-generated attorney brief, consultation booking integration, lead qualification score.

---

## Layer 8A — Matter Notes `[PHASE 1]`

Replaces the single `internal_notes` text field on transactions. Individual timestamped journal entries build the institutional memory of a matter. When a paralegal leaves, their knowledge stays.

- [ ] `matter_notes` table — `id`, `transaction_id`, `firm_id`, `author_id`, `content` (max 2,000 chars), `created_at`, `deleted_at`
- [ ] Notes are immutable — no `updated_at`. Mistakes get a new note, not an edit.
- [ ] `GET /v1/transactions/:id/notes` — list all notes, newest first, paginated 25
- [ ] `POST /v1/transactions/:id/notes` — create note. OWNER, ATTORNEY, PARALEGAL roles. Body: `{ content: string }`
- [ ] `DELETE /v1/transactions/:id/notes/:noteId` — OWNER only soft delete. Mistakes can be removed.
- [ ] Notes included in AI chat context — last 10 notes included in the transaction summary injected into the system prompt. Attorneys can ask "what did we discuss about the title issue?" and get an answer that includes both document content and communication/note history.
- [ ] Activity event: `note.added` — shown in activity feed as "Note added by James Okafor"

---

## Layer 8B — Communication Log `[PHASE 1]`

Every call, email, meeting, and text logged against a transaction. The institutional memory that survives when people leave. Also feeds into the AI chat context.

### 8B-1 — Entity

- [ ] `communications` table — `id`, `transaction_id`, `firm_id`, `logged_by_id`, `type` (enum), `direction` (enum), `contact_name` (text, max 100 chars), `summary` (text, max 500 chars), `occurred_at` (timestamp, defaults to now), `created_at`, `deleted_at`
- [ ] `contact_name` is free text — not a FK to parties or contacts. Reason: attorneys communicate constantly with people not in the system (opposing counsel's paralegal, a county clerk). Forcing a dropdown here kills adoption.
- [ ] Communications are immutable — no `updated_at`. OWNER can soft delete mistakes.
- [ ] Displayed newest first by `occurred_at`, not `created_at` (attorney may log retroactively)

### 8B-2 — Quick-Add Flow (Determines Adoption)

- [ ] Entry point: floating button visible on every transaction page. One click — not a navigation.
- [ ] Opens a drawer (not a new page): type selector → direction toggle → contact_name → summary → occurred_at (defaults to now). Four fields. Submit closes drawer.
- [ ] Response is optimistic — entry appears immediately in the log without waiting for server confirmation.
- [ ] This UX is defined in the frontend spec. The backend just needs the endpoint fast.

### 8B-3 — Endpoints

- [ ] `GET /v1/transactions/:id/communications` — list, newest first by `occurred_at`, paginated 25
- [ ] `POST /v1/transactions/:id/communications` — create. OWNER, ATTORNEY, PARALEGAL only.
- [ ] `DELETE /v1/transactions/:id/communications/:id` — OWNER only, soft delete

### 8B-4 — AI Context Integration

- [ ] Last 14 days of communications included in the transaction summary for chat context
- [ ] Format injected into system prompt:
  ```
  Recent Communications (last 14 days):
  [June 18, 2:15pm] Phone call — Outbound — Maria Webb (Independence Title)
  "Confirmed wire instructions received. Closing still on track for July 2."
  
  [June 16, 11am] Email — Inbound — Tom Bradley (Seller's Agent)
  "Seller requesting 7-day extension. Providing reason in writing by EOD."
  ```
- [ ] Activity event: `communication.logged` — shown in feed as "Phone call with Maria Webb logged"

---

## Layer 8C — Document Checklist `[PHASE 1]`

Tracks expected vs received documents per transaction. Auto-populated on creation. Auto-checked when a matching document finishes processing. Answers "what are we still waiting on?" in one glance.

### 8C-1 — Entity

- [ ] `document_checklist_items` table — `id`, `transaction_id`, `firm_id`, `name`, `document_type` (nullable enum), `is_required`, `is_system_item`, `status` (enum), `received_at`, `received_document_id` (FK → documents), `notes` (max 300 chars), `sort_order`, `created_at`, `updated_at`, `deleted_at`
- [ ] Status enum: `PENDING`, `RECEIVED`, `WAIVED`, `NOT_APPLICABLE`
- [ ] `is_system_item = true` — cannot be deleted, only WAIVED or NOT_APPLICABLE
- [ ] `is_system_item = false` — custom items added by attorney, can be soft deleted

### 8C-2 — Auto-Population on Transaction Creation

When a transaction is created, default checklist items are inserted based on `transaction_type`:

**PURCHASE:**
```
1.  Purchase Agreement          PURCHASE_AGREEMENT   required   sort: 10
2.  Third Party Financing Add.  ADDENDUM             required   sort: 20
3.  Seller's Disclosure Notice  ADDENDUM             required   sort: 30
4.  HOA Addendum                ADDENDUM             optional   sort: 40
5.  Title Commitment            TITLE_COMMITMENT     required   sort: 50
6.  Survey                      SURVEY               required   sort: 60
7.  Inspection Report           INSPECTION_REPORT    optional   sort: 70
8.  Lender Approval Letter      CORRESPONDENCE       required   sort: 80
9.  Closing Disclosure          CLOSING_DISCLOSURE   required   sort: 90
10. Deed                        DEED                 required   sort: 100
```
**SALE:** Purchase Agreement, Seller's Disclosure, Title Commitment, Survey (optional), Deed, Closing Disclosure

**LEASE:** Lease Agreement, Tenant Verification (optional), Move-In Condition Report (optional)

**REFINANCE:** Deed of Trust, Closing Disclosure, Lender Approval

- [ ] Default items inserted as part of transaction creation service — one DB transaction: create transaction + create checklist items together or both fail

### 8C-3 — Auto-Check on Document Upload

Triggered when a document transitions to `READY` status in the processing pipeline:

```
1. Query: PENDING checklist items WHERE transaction_id = ? AND document_type = uploaded_doc.type
2. If found (first match only):
   → SET status = RECEIVED, received_at = now(), received_document_id = document.id
   → Log activity: "Title Commitment received — checklist updated"
3. If AMENDMENT type: skip auto-check (amendments modify other docs, not standalone items)
4. If no match: document uploaded normally, just not on the checklist
```

- [ ] Auto-check runs inside the document processing worker after status → READY
- [ ] Only the FIRST matching PENDING item is checked — second upload of same type is a bonus document

### 8C-4 — Endpoints

- [ ] `GET /v1/transactions/:id/checklist` — all items sorted by sort_order. Required items first, optional items second. `received_document_id` included for direct document link.
- [ ] `PATCH /v1/transactions/:id/checklist/:itemId` — update `status` (WAIVED, NOT_APPLICABLE), `notes`. Cannot manually set RECEIVED — must come from document upload. ATTORNEY or OWNER only.
- [ ] `POST /v1/transactions/:id/checklist` — add custom item. Body: `{ name, is_required, notes }`. Custom items have `document_type = null` (never auto-checked). `is_system_item = false`.
- [ ] `DELETE /v1/transactions/:id/checklist/:itemId` — custom items only (is_system_item = false). Soft delete.

### 8C-5 — Dashboard Integration

- [ ] Transaction list endpoint includes `checklist_summary: { required_total, required_received }` per transaction
- [ ] Frontend renders this as "7/10 required documents received" on each transaction card
- [ ] Attorneys see at a glance which deals need documents without opening them

---

## Layer 8D — Business Operations `[PHASE 1]`

Tasks, time tracking, and invoicing in one layer. These three features together eliminate the need for a separate practice management tool for core business operations.

### 8D-1 — Task Management

- [ ] `tasks` table — `id`, `transaction_id`, `firm_id`, `created_by_id`, `assigned_to_id` (nullable), `task_status`, `priority` (NORMAL/HIGH only), `title` (max 200), `description` (max 1,000), `due_at`, `completed_at`, `completed_by_id`, `created_at`, `updated_at`, `deleted_at`
- [ ] `GET /v1/transactions/:id/tasks` — list, filterable by status and assigned_to_id
- [ ] `POST /v1/transactions/:id/tasks` — create. OWNER, ATTORNEY, PARALEGAL.
- [ ] `PATCH /v1/transactions/:id/tasks/:taskId` — update title, description, priority, due_at, assigned_to_id, status
- [ ] `POST /v1/transactions/:id/tasks/:taskId/complete` — status → COMPLETED, sets `completed_at`, `completed_by_id`
- [ ] `POST /v1/transactions/:id/tasks/:taskId/cancel` — status → CANCELLED
- [ ] Overdue tasks (due_at < now, status OPEN or IN_PROGRESS) surface in the morning dashboard
- [ ] Activity events: `task.created`, `task.assigned`, `task.completed`, `task.cancelled`

### 8D-2 — Time Tracking

- [ ] `time_entries` table — `id`, `transaction_id`, `firm_id`, `attorney_id`, `description` (max 500), `hours` (decimal 5,2), `billing_rate` (decimal 8,2 — snapshot at entry time), `total_amount` (hours × rate), `entry_date` (defaults to today, backdatable), `invoiced` (boolean), `created_at`, `updated_at`, `deleted_at`
- [ ] `hours` validation: > 0 and ≤ 24.00. Quarter-hour minimum (0.25).
- [ ] `billing_rate` snapshotted from `users.billing_rate` at entry creation — rate changes never rewrite history
- [ ] `invoiced = true` entries are immutable — no edits, no deletes
- [ ] `GET /v1/transactions/:id/time-entries` — filterable by invoiced, attorney, date range
- [ ] `POST /v1/transactions/:id/time-entries` — create
- [ ] `PATCH /v1/transactions/:id/time-entries/:entryId` — edit (blocked if invoiced = true → 422 `ENTRY_ALREADY_INVOICED`)
- [ ] `DELETE /v1/transactions/:id/time-entries/:entryId` — soft delete (blocked if invoiced = true)

### 8D-3 — Invoicing

- [ ] `invoices` table — `id`, `transaction_id`, `firm_id`, `invoice_number`, `client_name`, `client_email`, `line_items` (JSONB snapshot), `subtotal`, `tax_rate`, `tax_amount`, `total_amount`, `status` (DRAFT/SENT/PAID), `notes`, `pdf_storage_key`, `sent_at`, `paid_at`, `created_at`, `updated_at`, `deleted_at`
- [ ] `invoice_number` format: `INV-{YYYY}-{4-digit-sequence-per-firm}`. Partial unique index where `deleted_at IS NULL`.
- [ ] `POST /v1/transactions/:id/invoices` — body: `{ time_entry_ids: string[], client_name, client_email?, notes? }`. Creates invoice, sets selected time entries to `invoiced = true`, generates PDF via `pdf-lib`, uploads to Supabase Storage at `invoices/{firmId}/{invoiceId}.pdf`.
- [ ] `GET /v1/transactions/:id/invoices` — list
- [ ] `GET /v1/transactions/:id/invoices/:invoiceId/download` — generate signed URL, 1-hour expiry
- [ ] `PATCH /v1/transactions/:id/invoices/:invoiceId/mark-sent` — status → SENT, sets `sent_at`
- [ ] `PATCH /v1/transactions/:id/invoices/:invoiceId/mark-paid` — status → PAID, sets `paid_at`
- [ ] `DELETE /v1/transactions/:id/invoices/:invoiceId` — DRAFT status only. Sets `invoiced = false` on all included time entries. Soft delete.
- [ ] SENT and PAID invoices cannot be voided.

### 8D-4 — Morning Dashboard `GET /v1/dashboard`

The morning view. Replaces "what do I do today?" answered by checking email, calendar, and legal pad separately.

- [ ] Response shape:
  ```json
  {
    "deadlines_next_7_days": [...ACTIVE deadlines, due_at within 7 days, sorted by urgency],
    "my_tasks_due_soon":     [...OPEN/IN_PROGRESS tasks assigned to me, due within 2 days],
    "overdue_tasks":         [...tasks past due_at and not COMPLETED/CANCELLED],
    "stale_transactions":    [...transactions with no activity_log entry in last 7 days, not CLOSED/FALLEN_THROUGH],
    "pending_checklist":     [...checklist items PENDING where deadline for that document type is approaching]
  }
  ```
- [ ] `deadlines_next_7_days`: all ACTIVE deadlines across all transactions, due within 7 days, includes `transaction_title` and `property_address`
- [ ] `my_tasks_due_soon`: filtered to `assigned_to_id = currentUser.id`. Includes `transaction_title`.
- [ ] `stale_transactions`: no `transaction_activities` entry in last 7 days. Flag for attorney review — deals that are not progressing.
- [ ] Cached in Redis: `firm:{firmId}:dashboard:{userId}` — 5-minute TTL. Busted when task, deadline, or activity is created/updated.
- [ ] `GET /v1/dashboard` — OWNER, ATTORNEY, PARALEGAL. Scoped to requesting user for `my_tasks_due_soon`.

> `[PHASE 2]` Transaction templates, contact book, basic reporting, Google Calendar OAuth sync.

---

## Layer 8F — Wire-Fraud Verification `[MOAT FEATURE — build after Phase 1 core]`

The highest-impact addition from the deep research. Real estate wire fraud: $275.1M lost in 2025 (FBI IC3), growing yearly. Rides on the document pipeline, communication log, activity log, and SSE alerts you already have. See `12-moat-features.md` for full spec.

### 8F-1 — Entities

- [ ] `verified_wire_instructions` table — the trusted baseline. Columns: transaction_id, firm_id, party_id, verified_by_id, institution_name, routing_number (public — stored full), account_last4 (display), account_hash (SHA-256 of full account — never store raw), verification_method (enum PHONE/IN_PERSON/SECURE_PORTAL), verification_notes, is_active, verified_at, created_at, deleted_at
- [ ] `wire_flag_events` table — audit trail. Columns: transaction_id, firm_id, source_document_id, detected_routing_number, detected_account_last4, flag_type (NO_BASELINE/MISMATCH), resolved_by_id, resolution (VERIFIED_LEGITIMATE/CONFIRMED_FRAUD/DISMISSED), resolution_notes, resolved_at, created_at
- [ ] `wireVerificationMethodEnum` — PHONE, IN_PERSON, SECURE_PORTAL
- [ ] Account numbers NEVER stored raw — last 4 + SHA-256 hash only, matching client_access_tokens convention

### 8F-2 — Detection (extends the document worker)

- [ ] After a document classified `WIRE_INSTRUCTIONS`, `CLOSING_DISCLOSURE`, or `CORRESPONDENCE` reaches READY, run wire-instruction extraction
- [ ] **Classifier must recognize wire instruction documents.** Real wire instruction letters contain "dear"/"sincerely" and would otherwise classify as CORRESPONDENCE — or as OTHER if they contain neither. The `WIRE_INSTRUCTIONS` keyword rule must precede the `CORRESPONDENCE` rule in `KEYWORD_RULES`. Without this, wire-fraud detection silently never fires. (Caught during test-fixture validation.)
- [ ] Deterministic regex for routing (9 digits, ABA checksum) and account patterns, confidence-scored
- [ ] If none found → no action
- [ ] If found → look up active baseline for transaction + party:
  - No baseline → create `wire_flag_event` (NO_BASELINE) → CRITICAL alert
  - Baseline matches (routing + account_hash) → safe, no flag
  - Baseline differs → create `wire_flag_event` (MISMATCH) → CRITICAL alert + block-and-confirm UI
- [ ] Deliberately conservative: unverified instructions always prompt verification, never auto-trust

### 8F-3 — Endpoints

- [ ] `POST /v1/transactions/:id/wire-instructions/verify` — record verified baseline. Account hashed server-side, never stored raw. Deactivates prior baseline for the party.
- [ ] `GET /v1/transactions/:id/wire-instructions` — list (account_last4 only, never full)
- [ ] `GET /v1/transactions/:id/wire-flags` — all flag events, resolved and unresolved
- [ ] `POST /v1/transactions/:id/wire-flags/:flagId/resolve` — resolution + notes. If VERIFIED_LEGITIMATE, optionally promote detected instructions to new baseline.

### 8F-4 — Alerts & Audit

- [ ] Mismatch and no-baseline flags fire CRITICAL alerts through the existing SSE + Resend channels
- [ ] Every verification and every flag writes to `transaction_activities` — immutable record
- [ ] Activity events: `wire.verified`, `wire.flagged`, `wire.flag_resolved`

> `[BUILD-VS-INTEGRATE]` CertifID (Austin-based, up to $5M/file insurance) and ClosingLock are mature partners. The spec above is the build path. Future option: integrate CertifID's API for verification + insurance while keeping detection and audit native.

---

## Layer 8G — Matter-Level Access Control `[PHASE 1 — before launch]`

Firm-wide-by-role is too coarse for a real firm. Full spec in `13-adoption-features.md`.

- [ ] `matter_access` table — transaction_id, firm_id, user_id, granted_by_id, expires_at. Unique on (transaction_id, user_id).
- [ ] `MatterAccessGuard` runs AFTER `RolesGuard` on every transaction-scoped route. One guard, not scattered checks.
- [ ] Resolution order: OWNER → FULL · assigned_attorney_id → FULL · assigned_paralegal_id → FULL · matter_access row (unexpired) → FULL · role ATTORNEY → READ_ONLY · else DENIED
- [ ] `@MatterAccess('FULL' | 'READ_ONLY')` decorator on endpoints. Writes require FULL; GETs accept READ_ONLY.
- [ ] PARALEGAL sees ONLY assigned/granted matters — no read-only fallback
- [ ] `POST /v1/transactions/:id/access` — grant (OWNER or assigned attorney)
- [ ] `DELETE /v1/transactions/:id/access/:userId` — revoke
- [ ] `GET /v1/transactions/:id/access` — who can see this matter
- [ ] **Permission errors explain themselves.** `MATTER_ACCESS_DENIED` returns `details: { reason, assignedAttorney, requestAccessFrom }`. Reason codes: `NOT_ASSIGNED`, `READ_ONLY_ROLE`, `ACCESS_EXPIRED`, `ROLE_INSUFFICIENT`. Never a bare 403 — that generates a support ticket every time.
- [ ] Full-text search results respect matter access — never surface a matter the user can't open

## Layer 8H — Passive Time Capture `[PHASE 1 — before launch]`

The attorney reviews, never enters. Converts a discipline problem into a review problem.

- [ ] `time_entries` columns added: `source` (MANUAL/SUGGESTED), `entry_status` (DRAFT/CONFIRMED), `source_activity_id`
- [ ] **DRAFT entries never appear in invoices** — only CONFIRMED are billable
- [ ] Nightly BullMQ job groups yesterday's activities by transaction + user, generates DRAFT suggestions
- [ ] Suggestion durations: PHONE_CALL 0.25 · EMAIL 0.10 · document reviewed 0.25 · draft approved 0.50 · deadlines confirmed 0.25 · note added 0.10
- [ ] **Same-type activities on one matter in one day collapse into ONE suggestion.** Three uploads = one 0.25 entry, not three. Nobody reviews twelve suggestions.
- [ ] `GET /v1/time-entries/suggested` — DRAFT entries for current user
- [ ] `PATCH /v1/time-entries/:id/confirm` — DRAFT → CONFIRMED, accepts edits
- [ ] `POST /v1/time-entries/confirm-batch` — confirm several at once
- [ ] DRAFT entries older than 14 days auto-deleted (stale suggestions are noise)
- [ ] Morning dashboard surfaces the count: "6 suggested time entries from yesterday"

## Layer 8I — Full-Text Search `[columns PHASE 1, UI PHASE 2]`

- [ ] `tsvector` generated columns + GIN indexes on `communications`, `matter_notes`, `document_chunks` — **in the first migration**, even if the UI ships later. Retrofitting onto a year of data is a full table rewrite.
- [ ] `GET /v1/search?q=&types=&transactionId=` — queries all three sources
- [ ] Results ranked by `ts_rank`, snippet via `ts_headline`, grouped by source type
- [ ] Results respect matter-level access (Layer 8G)
- [ ] Keyword search **complements** pgvector semantic search — different queries, both needed. Do not conflate them.

### 8I-2 — Command Palette (⌘K)

The keyboard-first entry point to search and navigation. Directly attacks "too many clicks," which the research named the top adoption killer in legal software.

- [ ] `GET /v1/search/quick?q=` — a fast, capped variant of the search endpoint for palette results (limit 8 per type, no snippets, sub-100ms target)
- [ ] Returns: transactions (by title, property address, transaction number), deadlines, and recent communications
- [ ] Respects matter-level access (Layer 8G) — never surfaces a matter the user can't open
- [ ] Frontend: ⌘K / Ctrl+K opens from anywhere. Fuzzy match, arrow-key navigation, Enter to jump.
- [ ] Quick actions in the palette, not just navigation: "Log a call on {transaction}", "New transaction", "Today's deadlines"
- [ ] Recent transactions shown on empty query — most navigation is back to something recent

## Layer 8J — Two-Way Client Messaging `[PHASE 1 — shortly after launch]`

- [ ] `client_messages` table — direction (INBOUND/OUTBOUND), sender_user_id, sender_name, body (max 2,000), read_at
- [ ] **No client accounts.** Client authenticates with the same signed token used for read access. `senderName` comes from the token record.
- [ ] `GET|POST /v1/client/transactions/:id/messages?token=` — client side, token-authenticated
- [ ] `GET|POST /v1/transactions/:id/client-messages` — attorney side, JWT + matter access
- [ ] **The AI NEVER auto-responds to a client message.** Attorney composes every outbound reply. Auto-response is UPL and an Opinion 705 violation.
- [ ] Every message also writes to the communication log (`type: CLIENT_PORTAL`) — feeds institutional memory and AI chat context
- [ ] Inbound message notifies the assigned attorney via Resend + SSE
- [ ] Rate limit: 20 inbound messages per token per hour

## Layer 8K — Migration & Import `[PHASE 1 — shortly after launch]`

- [ ] `POST /v1/import/transactions` and `/v1/import/parties` — multipart CSV, OWNER role only
- [ ] `GET /v1/import/template/:type` — download expected CSV template
- [ ] **Dry-run first:** parse and validate the entire file, return a preview with row-level errors, import nothing until confirmed
- [ ] Row-level errors reported together — never fail the whole file for one bad row
- [ ] Imported transactions auto-create their document checklist, same as manual creation
- [ ] Writes `transaction.imported` to the activity log so imported matters are distinguishable
- [ ] Documented transition guidance shipped with it: *import only matters under contract and >14 days from closing; let near-closing matters finish in the old system*

---


## Layer 8L — Service Health Honesty `[PHASE 1]`

**Principle: never fake a working integration.** When an external service is down or unconfigured, say so plainly. A spinner that never resolves, or a silently degraded response, is worse than an honest failure — an attorney who can't tell whether the AI is broken or just slow stops trusting the system entirely. This is the same discipline as the chat no-hallucination fallback, applied to infrastructure.

- [ ] `GET /v1/health/services` — per-dependency status, OWNER/ATTORNEY roles
  ```json
  {
    "anthropic": { "status": "ok",            "latencyMs": 340 },
    "voyage":    { "status": "ok",            "latencyMs": 120 },
    "resend":    { "status": "degraded",      "message": "Elevated failure rate" },
    "storage":   { "status": "ok" },
    "redis":     { "status": "ok" },
    "database":  { "status": "ok" }
  }
  ```
- [ ] Status values: `ok` | `degraded` | `down` | `not_configured`
- [ ] **`not_configured` is a first-class state** — a missing API key reports as unconfigured, never as an error and never as working
- [ ] Checked via cached lightweight probes (30s TTL) — never probe an external API on every request
- [ ] Feature-level consequences surfaced, not just raw status:
  - Anthropic down → chat and draft generation disabled in UI with a plain explanation
  - Voyage down → document upload still works; embedding stage queues and retries
  - Resend down → deadline alerts still appear in-app; email delivery flagged as delayed
- [ ] Degraded state is visible in the UI (a persistent banner), not buried in a settings page
- [ ] Never show a spinner for a service known to be down — show the honest state immediately

---

## Layer 8M — Audit, Session & Data Rights `[PHASE 1 — before launch]`

Confidentiality and data-rights infrastructure. Full reasoning in `16-compliance-gaps.md`.

**TDPSA note:** both the firm and CounselOS qualify for the SBA small-business exemption today, so TDPSA's core obligations (privacy notice, consumer rights response, universal opt-out) do not currently apply. What binds us is **Texas Rule 1.05 confidentiality and attorney-client privilege**, which are stricter. The capabilities below are built now because they are cheap now, required at Phase 2 scale, and remove a sales objection.

### 8M-1 — Access Audit Log

- [ ] `access_log` table — firm_id, user_id, transaction_id, action, resource_id, ip_address, created_at
- [ ] Written from an **interceptor**, never from individual controllers — one place, no route can forget
- [ ] Logged actions: `transaction.viewed`, `document.downloaded`, `search.performed`, `client_portal.accessed`, `export.generated`
- [ ] `transaction_activities` logs what people **did**; `access_log` logs what they **saw**. For privileged material, read access matters as much as writes — and it proves matter-level access control is working.
- [ ] High volume — index on (firm_id, created_at). Partition by month in Phase 2. Retain 2 years then purge.
- [ ] `GET /v1/transactions/:id/access-log` — OWNER only

### 8M-2 — Session Management

- [ ] **Idle timeout: 30 minutes.** Warning modal at 28 minutes with a "stay signed in" action.
- [ ] **Absolute session limit: 12 hours** — re-authentication required regardless of activity
- [ ] Idle timer tracks user interaction, **separate from** access-token TTL (15 min with silent refresh)
- [ ] On timeout: clear auth store, close SSE connections, redirect to `/auth/login?reason=timeout` so the UI explains rather than appearing to crash
- [ ] Client portal signed tokens unaffected — already 30-day scoped and read-only
- [ ] Rationale: an attorney's laptop left open in a coffee shop is a Rule 1.05 exposure

### 8M-3 — Export

- [ ] `POST /v1/firms/me/export` — OWNER only, queues a BullMQ job (too slow for a request cycle)
- [ ] `GET /v1/firms/me/export/:jobId` — status, then a signed download URL when ready
- [ ] Contents: all transactions, parties, deadlines, documents (**actual files**, not just metadata), matter notes, communications, tasks, time entries, invoices, activity log. JSON for structured data, original files preserved, one archive.
- [ ] Email notification when ready. Signed URL, 24-hour expiry.
- [ ] Writes `export.generated` to the access log
- [ ] Removes the vendor lock-in objection in sales and satisfies future TDPSA portability

### 8M-4 — Deletion Requests

- [ ] `POST /v1/transactions/:id/request-deletion` — records the request
- [ ] **Deletion does NOT override the 7-year retention obligation.** A request against a matter still inside `retention_until` is recorded and honored **at** the retention date, not immediately.
- [ ] The response says so explicitly — never silently refuse
- [ ] This interaction (client privacy right vs. attorney retention duty) must be written down before it comes up, not during


---

## Layer 9 — Notification System `[PHASE 1]`

Switched from SendGrid to **Resend** — better TypeScript SDK, React Email for type-safe previewable templates, 3,000 emails/month free. All notifications — regardless of channel — go through one centralized `NotificationService`. No module sends emails or SSE events directly.

### 9A — Architecture

- [ ] `NotificationService` lives in `src/modules/notifications/notification.service.ts`
- [ ] All other modules call `NotificationService.send(type, payload, recipients)` — never call Resend or emit SSE directly from other modules
- [ ] NotificationService looks up the notification type config and routes to the correct channels
- [ ] Channel routing config defined in `src/modules/notifications/notification-types.ts`:

```
DEADLINE_INFO      → SSE only
DEADLINE_WARNING   → SSE + Resend email
DEADLINE_URGENT    → SSE + Resend email (urgent template)
DEADLINE_CRITICAL  → SSE + Resend email (critical template, subject: URGENT ACTION REQUIRED)
DOCUMENT_FAILED    → SSE + Resend email
DOCUMENT_READY     → SSE only (too frequent for email)
DRAFT_READY        → SSE only
NEW_LEAD           → SSE + Resend email
CLIENT_INVITE      → Resend email only (magic link — no SSE, client not yet in system)
CLIENT_STATUS_UPDATE → Resend email to client + SSE to attorney
```

### 9B — Resend Integration

- [ ] `npm install resend @react-email/components react-email`
- [ ] `ResendService` in `src/modules/notifications/resend.service.ts`
- [ ] Resend client initialized with `RESEND_API_KEY` env var
- [ ] All emails sent from `CounselOS <alerts@mail.{firm-domain}.com>` — verified domain in Resend
- [ ] `render()` from `@react-email/render` converts React Email component to HTML string before send
- [ ] On Resend API error: throw, let BullMQ handle retry — never swallow Resend errors silently

### 9C — React Email Templates

- [ ] Template directory: `src/modules/notifications/templates/`
- [ ] One `.email.tsx` file per notification type — typed props, no string interpolation
- [ ] Templates previewable locally with `npx react-email dev` before shipping
- [ ] Template list:
  - `deadline-warning.email.tsx` — WARNING/URGENT tier. Props: `{ deadlineTitle, dueAt, daysRemaining, transactionTitle, urgency, firmName, reviewUrl }`
  - `deadline-critical.email.tsx` — CRITICAL tier. Red accent, bold subject. Same props. Different visual treatment.
  - `document-failed.email.tsx` — Props: `{ documentName, transactionTitle, errorReason, firmName }`
  - `new-lead.email.tsx` — Props: `{ leadFirstName, leadLastName, email, phone, inquiry, source, firmName, reviewUrl }`
  - `client-invite.email.tsx` — Props: `{ clientFirstName, transactionTitle, propertyAddress, attorneyName, inviteUrl, firmName }`
  - `client-status-update.email.tsx` — Props: `{ clientFirstName, transactionTitle, newStatus, statusDescription, propertyAddress, closingDate, attorneyName, portalUrl }`
- [ ] All templates share a base layout component — consistent CounselOS brand per Design System v5: bone paper (#F0EEE9), cool ink (#1B1D1E), sage for completed, Newsreader headings
- [ ] No marketing content in any template — purely transactional

### 9D — Email Job Entity (Audit Trail)

- [ ] `email_jobs` table:
  - `id` — UUID PK
  - `notification_type` — string. NotificationType constant.
  - `recipient_email` — string
  - `recipient_user_id` — UUID FK → users, nullable
  - `subject` — string. Stored for audit.
  - `resend_id` — string, nullable. Resend's message ID. Set on successful send.
  - `status` — enum: QUEUED, SENT, FAILED
  - `attempts` — integer, default 0
  - `last_error` — string, nullable
  - `sent_at` — DateTime, nullable
  - `created_at` — DateTime
- [ ] Email job record created before enqueuing — status: QUEUED
- [ ] On successful send: update status → SENT, set `resend_id`, set `sent_at`
- [ ] On all retry attempts exhausted: update status → FAILED, set `last_error`
- [ ] `GET /notifications/email-log` — OWNER role only. View recent email job records for debugging.

### 9E — BullMQ Email Queue

- [ ] Email queue name: `email-notifications`
- [ ] Concurrency: 3 (Resend rate limits — do not blast)
- [ ] Retry: 3 attempts, exponential backoff — 5s, 30s, 5 minutes
- [ ] Dead letter queue on exhaustion — job preserved for inspection
- [ ] On exhaustion: update email_job status → FAILED. For CRITICAL deadline emails specifically: write a persistent in-app notification record the attorney sees on next login (safety net when both SSE and email fail simultaneously)

### 9F — CAN-SPAM Compliance

- [ ] Every email sent to clients (not attorneys) includes: physical address of the firm, clear "sent by CounselOS on behalf of {Firm Name}" footer
- [ ] Unsubscribe link in all client-facing emails: `?unsubscribe={signed_token}` pointing to `GET /notifications/unsubscribe`
- [ ] Unsubscribe endpoint: validates signed token (HMAC), sets `notification_opted_out: true` on User record, returns confirmation page
- [ ] All notification sends check `notification_opted_out` before queuing — opted-out users never receive emails
- [ ] Attorneys are not subject to CAN-SPAM for internal operational notifications — no unsubscribe needed for deadline alerts

### 9G — Test Notification Endpoint

- [ ] `POST /notifications/test` — OWNER or ATTORNEY role only
- [ ] Body: `{ type: 'DEADLINE_ALERT' | 'NEW_LEAD' | 'DOCUMENT_FAILED', email?: string }`
- [ ] Sends a realistic test email with dummy data to `email` if provided, otherwise to the requesting user's email
- [ ] Emits corresponding SSE event so attorney can confirm both channels work
- [ ] Returns: `{ emailSent: boolean, resendId?: string, sseDelivered: boolean }`
- [ ] Does not create any database records — purely for verification

### 9H — What Happens When Resend Is Down

- [ ] BullMQ retries handle temporary outages (3 attempts over ~6 minutes)
- [ ] SSE channel is independent of Resend — deadline alerts push to open browser sessions regardless of email status
- [ ] If email fails after all retries: Sentry alert fires for monitoring. Attorney uses the deadline dashboard — it is always accurate regardless of email delivery.
- [ ] No `persistent_notifications` table in Phase 1 — the deadline dashboard IS the notification center.
- [ ] `[PHASE 2]` Add persistent in-app notifications when managing multiple firms.

> `[PHASE 2]` Add: Twilio SMS for CRITICAL deadlines. Welcome email on firm signup. Stripe payment failed dunning. Invoice sent to client. Consultation confirmation. Resend webhook for delivery status tracking (bounces, opens). Per-user notification preferences beyond global opt-out.

---

## Layer 10 — Client Status Page `[PHASE 1 — signed token auth]`

No Supabase Auth for clients. No user accounts. No passwords. No magic link OAuth flow. A signed HMAC URL gives read-only access to one transaction for 30 days. Attorneys generate it. Clients click it. Done.

### 10A — How the Signed Token Works

```
1. Attorney clicks "Share with Client" on a transaction
   POST /v1/transactions/:id/invite-client
   body: { client_email, client_name }

2. Backend generates raw token (256-bit, never stored):
   rawToken = crypto.randomBytes(32).toString('hex')

3. Backend stores only the hash:
   token_hash = SHA-256(rawToken)
   INSERT INTO client_access_tokens (transaction_id, firm_id, client_email, token_hash, expires_at)
   expires_at = now() + 30 days

4. Backend sends Resend email with the portal URL:
   url = {CLIENT_PORTAL_URL}/status/{transactionId}?token={rawToken}

5. Client clicks link:
   GET /v1/client/transactions/:transactionId?token={rawToken}

6. Backend validates:
   a. Hash incoming token: SHA-256(rawToken)
   b. Query: WHERE transaction_id = :id AND token_hash = :hash
              AND expires_at > NOW() AND revoked = false
   c. Not found → 404 (never 401 — do not reveal the transaction exists)
   d. Found → return status page data
```

### 10B — Client Access Token Entity

- [ ] `client_access_tokens` table in schema — `id`, `transaction_id`, `firm_id`, `client_email`, `token_hash`, `expires_at`, `revoked`, `created_at`
- [ ] Raw token never stored — only SHA-256 hash
- [ ] `POST /v1/transactions/:id/invite-client` — generates token, sends Resend email, returns success
- [ ] `POST /v1/transactions/:id/revoke-client-access` — sets `revoked = true` on all tokens for this transaction. Access revoked immediately on next request. ATTORNEY or OWNER role only.
- [ ] Token regeneration: call invite-client again — creates new token, old token still valid until expiry or explicit revoke

### 10C — Status Page Endpoint

- [ ] `GET /v1/client/transactions/:id?token={rawToken}` — no JWT required
- [ ] Validation: hash token → query → check expiry and revoked → if not found return 404
- [ ] Never return 401 or 403 — attacker learns nothing from 404
- [ ] Exact response shape:
  ```json
  {
    "success": true,
    "data": {
      "transaction": {
        "title": "Martinez / Chen — 2847 Manor Rd",
        "property_address": "2847 Manor Rd, Austin, TX 78722",
        "transaction_type": "PURCHASE",
        "status": "DUE_DILIGENCE",
        "status_label": "Due Diligence",
        "status_description": "Your attorney is reviewing inspection reports and title documents on your behalf.",
        "closing_date": "2025-07-02",
        "days_until_closing": 13
      },
      "next_milestone": {
        "title": "Financing Contingency Deadline",
        "due_at": "2025-06-23",
        "days_remaining": 4,
        "urgency": "URGENT"
      },
      "attorney": {
        "full_name": "James Okafor",
        "email": "james@firmname.com",
        "phone": "+15128675309"
      },
      "documents": [
        {
          "id": "uuid",
          "name": "Purchase Agreement",
          "created_at": "2025-06-02T00:00:00Z",
          "download_url": "https://supabase-signed-url-15min"
        }
      ]
    }
  }
  ```
- [ ] `documents` array: only `is_client_visible = true` documents
- [ ] Download URL: signed Supabase Storage URL, 15-minute expiry
- [ ] Fields NEVER returned: internal notes, matter notes, draft documents, communication log, other transactions, task list, time entries
- [ ] `POST /v1/transactions/:id/notify-client` — ATTORNEY only. Sends Resend status update email to `client_email` stored on the active token.

> `[PHASE 2]` Full client portal with Supabase Auth accounts, secure messaging, invoice payment via Stripe, multi-transaction access.

## Layer 11 — Real-Time `[PHASE 1 — SSE only]`

No WebSocket. No Socket.io. SSE covers every Phase 1 real-time use case. Socket.io adds a dependency, a separate auth layer, room management, and reconnection complexity. Every "real-time" need in Phase 1 is server-to-client only — exactly what SSE does.

### 11A — SSE Endpoints

- [ ] `GET /v1/events` — global firm event stream. Opens on login, stays open for the session. Receives: deadline alerts, document ready, document failed, draft ready, new lead alerts, task assigned. Heartbeat ping every 25 seconds.
- [ ] `GET /v1/transactions/:id/documents/stream` — document processing status. Client opens when upload starts, closes when all documents reach READY or FAILED.
- [ ] `GET /v1/transactions/:id/chat/:sessionId/stream` — LLM token stream. Opens per message, closes when stream completes.

### 11B — Heartbeat & Keepalive

- [ ] Every SSE Observable emits ping every **25 seconds** (Railway proxy kills at 60 seconds — 25 leaves safe margin)
- [ ] Ping event: `{ data: '', type: 'ping' }` — browsers ignore it, proxies see activity
- [ ] Cleanup on `req.on('close', ...)` — `clearInterval(heartbeat)` then `subscriber.complete()`. Without this, intervals leak memory proportional to connection churn.

### 11C — Reconnection Strategy

Browsers reconnect SSE automatically. On reconnect they send `Last-Event-ID` header. Server responds with current state snapshot — not event replay.

- [ ] Every SSE event has an `id` field — auto-incrementing integer per firm in Redis: `INCR sse:eventid:{firmId}`
- [ ] **Global `/v1/events` stream on reconnect:** emit a `snapshot` event containing current state: active CRITICAL/URGENT deadlines, any documents still processing, unread lead count. Client restores UI from snapshot.
- [ ] **Document stream on reconnect:** query current `processing_status` of all documents for this transaction, emit single `snapshot` event. Client restores progress indicators.
- [ ] **Chat stream on reconnect:** client polls `GET /v1/transactions/:id/chat/:sessionId/messages?since={lastMessageId}` to get completed or in-progress message. No token replay.

### 11D — SSE Event Shape

```
id: {incrementing-integer}
event: {EventType constant}
data: {JSON.stringify(payload)}

```

- [ ] `SseService` in `src/modules/realtime/sse.service.ts` — all modules call `SseService.emit(firmId, eventType, payload)`. No module emits SSE directly.
- [ ] Event type constants in `packages/shared/src/events/sse-events.ts` — the frontend imports the same file, so an event name can never drift between the two apps.

### 11E — Redis Pub/Sub Fan-Out `[PHASE 1 — required for correctness]`

**This is not a scaling concern. It is a day-one requirement of the two-process model.**

The events that matter most — `document.ready`, `document.failed`, `draft.ready`, and every deadline alert from the hourly scheduler — are produced by the **worker process**. The `EventSource` connections are held by the **HTTP process**. An in-memory `Subject` inside `SseService` means the worker emits into a void and the attorney's browser never updates. It works perfectly in local development when you run a single process, and fails completely on Railway.

```
worker           SseService.emit(firmId, type, payload)
                        │  INCR sse:eventid:{firmId}
                        │  PUBLISH sse:firm:{firmId}  {id, type, payload}
                        ▼
                    Redis
                        │
HTTP process     SseSubscriber (OnModuleInit) — SUBSCRIBE sse:firm:*
                        │  → per-firm Subject → @Sse() Observable → browser
```

- [ ] `SseService.emit()` publishes to Redis in **both** processes — identical code path, no branching on "am I the worker." The HTTP process publishes and receives its own message back through the subscriber.
- [ ] `SseSubscriber` runs in the HTTP process only. Subscribes in `OnModuleInit`, unsubscribes in `OnModuleDestroy`.
- [ ] The subscriber uses its **own Redis connection**, separate from the cache connection — a connection in subscriber mode cannot issue other commands, and reusing the cache connection breaks the cache in a way that is genuinely hard to debug.
- [ ] Chat token streaming is the exception and stays in-process — the LLM call and the open connection are in the same HTTP handler.
- [ ] Integration test proves it: publish from a second process (or a second Nest context), assert the event arrives on an open `@Sse()` stream. A test that emits and asserts within one process proves nothing.

> `[PHASE 2]` Socket.io for transaction activity feed subscriptions when a firm has multiple concurrent users on the same transaction. Because fan-out already goes through Redis, running multiple HTTP server instances needs no further change.



---

## Layer 12 — Queues & Background Jobs `[PHASE 1]`

### 12A — Queue Definitions

All queues share the same Redis (Upstash) connection. Queue names are constants in `src/queue/queue.constants.ts` — never raw strings.

| Queue | Concurrency | Attempts | Backoff | Timeout | Purpose |
|---|---|---|---|---|---|
| `document-processing` | 5 | 3 | Exponential: 5s, 30s, 5min | 120s | Document convert + extract + embed |
| `draft-generation` | 3 | 2 | Fixed: 10s, 30s | 120s | LLM draft generation |
| `deadline-alerts` | 1 | 3 | Exponential: 10s, 60s | 30s | Hourly scheduler + alert delivery |
| `email-notifications` | 3 | 3 | Exponential: 5s, 30s, 5min | 30s | Resend email delivery |
| `dead-letter` | — | — | — | — | Failed jobs after all retries exhausted |

- [ ] All queue names imported from `queue.constants.ts` — never inline strings
- [ ] All queues share one Redis connection instance — not one connection per queue
- [ ] BullMQ Board configured at `/admin/queues` — internal access only, not exposed publicly

### 12B — Graceful Shutdown (Critical — Prevents Stuck Documents)

Two mechanisms work together. Graceful shutdown handles planned restarts. Stalled job detection handles crashes. Together they eliminate documents permanently stuck in PROCESSING.

**Mechanism 1 — Graceful shutdown on SIGTERM:**
- [ ] `app.enableShutdownHooks()` called in **`worker.ts`** immediately after `createApplicationContext()`. This is the one that prevents stranded documents, and **`OnApplicationShutdown` never fires without it.** Miss this line and every Railway deploy strands whatever document was mid-pipeline in `PROCESSING` — and it only reproduces under a real SIGTERM, never locally.
- [ ] `app.enableShutdownHooks()` also called in `main.ts` before `app.listen()`, so the HTTP process drains in-flight requests
- [ ] Each worker module implements `OnApplicationShutdown` interface
- [ ] `onApplicationShutdown()` lifecycle method calls `await worker.close()` — stops accepting new jobs, waits for the current job to complete
- [ ] Close timeout set to **8 seconds** — Railway allows 10 seconds between SIGTERM and SIGKILL. 8 seconds gives a 2-second buffer for Redis disconnect.
- [ ] If the current job cannot complete within 8 seconds: BullMQ returns it to the queue rather than marking it failed. Next worker instance picks it up cleanly. Document goes back to PENDING — correct behavior.
- [ ] HTTP server stops accepting new requests on SIGTERM before workers close — ensures no new jobs are enqueued while workers are shutting down

**Mechanism 2 — Stalled job detection (handles crashes):**
- [ ] `stalledInterval: 30000` — workers send a heartbeat to Redis every 30 seconds proving they are alive
- [ ] `maxStalledCount: 2` — if a worker heartbeat stops twice while a job is active, BullMQ moves the job to failed rather than retrying indefinitely
- [ ] BullMQ detects stalled jobs and re-queues them automatically when the heartbeat stops — no application code needed
- [ ] Configure on every worker: `new Worker(queueName, processor, { stalledInterval: 30000, maxStalledCount: 2 })`

### 12C — Document Processing Queue

- [ ] Processor file: `src/modules/documents/processors/document.processor.ts`
- [ ] Stages run sequentially within one job: convert → extract → classify → chunk → embed → store
- [ ] On stage failure: set `processing_error` on document record with human-readable message, update status → FAILED, emit SSE status event
- [ ] On job exhaustion (all 3 attempts failed): dead letter queue receives job, Resend email fires to attorney
- [ ] Job payload: `{ documentId: string, transactionId: string, firmId: string }`
- [ ] Worker logs each stage start and completion with `documentId` and `correlationId` for tracing

### 12D — Draft Generation Queue

- [ ] Processor file: `src/modules/drafts/processors/draft.processor.ts`
- [ ] Job payload: `{ draftId: string, transactionId: string, firmId: string }`
- [ ] Worker assembles transaction context, runs RAG, calls Claude via Vercel AI SDK `generateText`
- [ ] On success: create `draft_versions` record, update draft `status → READY`, emit SSE `draft.ready` event
- [ ] On failure after 2 attempts: update draft `status → FAILED`, set `generation_error`, log `draft.generation_failed` activity
- [ ] Timeout: 120 seconds — LLM calls with large context can take up to 60 seconds, 120s provides headroom
- [ ] Lower concurrency (3) than document processing because each job holds a large LLM context window

### 12E — Deadline Alert Scheduler

- [ ] Repeatable job using BullMQ's built-in cron: `{ repeat: { cron: '0 * * * *' } }` — fires at the top of every hour
- [ ] One repeatable job definition, not a new job enqueued every hour — BullMQ manages the schedule
- [ ] On each run: query all ACTIVE deadlines where `due_at > NOW()`, compute urgency, update changed urgency values, send alerts for thresholds not yet alerted (per `alerts_sent_at` array)
- [ ] If a previous scheduler run is still executing when the next fires: BullMQ queues the new run and the previous finishes first — no overlapping runs

### 12F — Dead Letter Queue

- [ ] All workers configured with `removeOnFail: false` — failed jobs kept for inspection
- [ ] Dead letter queue visible in BullMQ Board — admin can inspect payload, error, and retry history
- [ ] For CRITICAL deadline alert failures specifically: fire a Sentry alert. No `persistent_notifications` table in Phase 1 — the deadline dashboard is always the source of truth regardless of email delivery.

> `[PHASE 2]` Add: DNA extraction queue (triggered by document ready events), mass document analysis queue, arbitrage recalculation queue (triggered by DNA updates on NEGOTIATION cases), fingerprint update queue (runs after every case closure), onboarding provisioning queue.

---

## Layer 13 — Caching `[PHASE 1]`

### 13A — Redis Client

- [ ] Redis client: Upstash serverless Redis — single instance, same connection for both application cache and BullMQ queue. One Redis URL, not two separate instances.
- [ ] Eviction policy: **`volatile-lru`** — when the memory limit is hit, evict the least recently used key **that carries a TTL**. Cache misses recompute from the DB and never return stale data.
- [ ] **Not `allkeys-lru`.** Every key we can afford to lose has a TTL; the ones we can't, don't. `sse:eventid:{firmId}` is the counter behind SSE event ordering and is explicitly TTL-less (§11C) — `allkeys-lru` is free to evict it under memory pressure, which silently resets event IDs and breaks `Last-Event-ID` reconnect handling. `volatile-lru` makes "no TTL" mean "never evicted," so the durability decision lives with whoever sets the key.
- [ ] Corollary: **a key with no TTL is a deliberate promise.** Any new TTL-less key must be one we genuinely cannot lose, because this policy will keep it forever. Adding one is a review item.
- [ ] If every TTL-bearing key has already been evicted and memory is still exhausted, Redis returns OOM errors on writes rather than evicting the TTL-less keys. That's the intended failure mode — loud, not silent — and it's what the memory alert in Layer 16 exists to catch before it happens.
- [ ] All Redis keys defined as constants in `src/common/constants/cache-keys.ts` — never inline strings. Key builder functions ensure consistent formatting:
  ```typescript
  export const CacheKey = {
    user: (authId: string) => `user:${authId}`,
    transactionSummary: (txId: string) => `txn:${txId}:summary`,
    chatHistory: (sessionId: string) => `chat:${sessionId}:history`,
    embeddingByHash: (hash: string) => `emb:${hash}`,
    sseEvents: (firmId: string) => `sse:events:${firmId}`,
    sseEventId: (firmId: string) => `sse:eventid:${firmId}`,
    intakeIdempotency: (key: string) => `intake:idempotency:${key}`,
  }
  ```

### 13B — Cache Key Reference

| Key Pattern | TTL | Data Stored | Busted When |
|---|---|---|---|
| `user:{authId}` | 5 min | Full User record (role, firm_id, is_active, etc.) | `users.update()` called on that user |
| `txn:{transactionId}:summary` | 5 min | Transaction summary for chat prompt assembly | Transaction updated, party added/updated, deadline confirmed/completed |
| `chat:{sessionId}:history` | 2 hr | Last 10 messages for RAG context injection | New message added to session |
| `emb:{sha256(content)}` | 7 days | Voyage AI embedding vector (1024 dims) | Never — content hash guarantees freshness |
| `sse:events:{firmId}` | 10 min | Last 50 SSE events for reconnection replay | Rolling — old events expire naturally |
| `sse:eventid:{firmId}` | No TTL | Incrementing event ID counter | Never — always incrementing |
| `intake:idempotency:{key}` | 24 hr | Intake form submission response | Never — TTL handles expiry |

### 13C — User Hydration Cache (Most Critical Key)

This is the most frequently hit Redis key in the system. Every authenticated request — chat message, document upload, deadline confirm, transaction view — checks this key before any business logic runs.

- [ ] On JwtAuthGuard execution:
  1. Validate JWT against Supabase JWT secret
  2. Extract `sub` (Supabase Auth UUID) from validated token
  3. `redis.get(CacheKey.user(sub))`
  4. Cache hit → parse JSON, check `is_active`, attach to `request.user`, proceed
  5. Cache miss → `users.findOne({ auth_id: sub })`, check `is_active`, `redis.setex(CacheKey.user(sub), 300, JSON.stringify(user))`, attach to `request.user`
- [ ] Cache stores the full User object — all fields needed by the application. No partial hydration.
- [ ] **Immediate cache bust on is_active change** — when `is_active` is set to false, call `redis.del(CacheKey.user(authId))` in the same service method as the DB write. A deactivated attorney cannot have a 5-minute window of continued access.
- [ ] Role change also busts the cache — paralegal promoted to attorney gets new permissions immediately on next request after the cache clears
- [ ] Cache bust happens AFTER successful DB write — if the DB write fails, do not bust a valid cache entry

### 13D — Transaction Summary Cache

The chat prompt assembler queries this cache on every message turn to build the transaction context block injected into the system prompt. Without this cache, every chat message fires 3–4 DB queries before the LLM even sees the question.

- [ ] Cache stores a pre-assembled summary object:
  ```json
  {
    "propertyAddress": "2847 Manor Rd, Austin, TX 78722",
    "transactionType": "PURCHASE",
    "status": "DUE_DILIGENCE",
    "effectiveDate": "2025-06-02",
    "closingDate": "2025-07-02",
    "purchasePrice": 615000,
    "earnestMoneyAmount": 6150,
    "parties": [
      { "role": "BUYER", "name": "Sofia Martinez", "email": "...", "phone": "..." },
      { "role": "TITLE_COMPANY", "name": "Independence Title", "notes": "file #2025-04821" }
    ],
    "activeDeadlines": [
      { "title": "Financing Contingency", "dueAt": "2025-06-23", "urgency": "URGENT", "daysRemaining": 4 }
    ]
  }
  ```
- [ ] `TransactionSummaryService.getSummary(transactionId)` — checks cache first, builds from DB on miss, stores in cache
- [ ] Cache miss: queries transactions + parties + active deadlines in one Drizzle relational query (`db.query.transactions.findFirst({ with: { parties: true, deadlines: true } })`), assembles summary object, stores with 5-min TTL
- [ ] Cache bust called explicitly from service methods that mutate summary data:
  - `TransactionsService.update()` → `redis.del(CacheKey.transactionSummary(id))`
  - `PartiesService.create()` → `redis.del(CacheKey.transactionSummary(transactionId))`
  - `PartiesService.update()` → `redis.del(CacheKey.transactionSummary(transactionId))`
  - `DeadlinesService.confirm()` → `redis.del(CacheKey.transactionSummary(transactionId))`
  - `DeadlinesService.complete()` → `redis.del(CacheKey.transactionSummary(transactionId))`
  - `DeadlinesService.dismiss()` → `redis.del(CacheKey.transactionSummary(transactionId))`

### 13E — Chat History Cache

- [ ] Stores last 10 messages per session as a JSON array — serialized `ChatMessage[]`
- [ ] Used by the chat service to inject conversation history into the RAG prompt without a DB query on every turn
- [ ] Updated after every message persisted to DB — append new message, trim to last 10, store
- [ ] 2-hour TTL — longer than a typical work session. If TTL expires, the chat service falls back to loading from DB and re-populates the cache.
- [ ] Sessions older than 2 hours load history from DB on first message — slightly slower, acceptable for infrequent case

### 13F — Embedding Cache

- [ ] Before any Voyage AI embedding call: `SHA256(chunkContent)` → Redis lookup
- [ ] Cache hit → return stored vector directly, zero API call, zero cost
- [ ] Cache miss → call Voyage AI, store result with 7-day TTL, return vector
- [ ] 7-day TTL chosen because document content never changes after upload. If a document is re-uploaded with identical content, the hash matches and the embedding is reused.
- [ ] This cache saves meaningful cost at scale — a 40-page purchase agreement re-processed after a bug fix never hits the embedding API again

> `[PHASE 2]` Add: firm settings cache (15 min TTL), judge/carrier/counsel fingerprint cache (24 hr TTL), billing dashboard aggregates (10 min TTL), CourtListener API response cache (24 hr TTL).

---

## Layer 14 — Security `[PHASE 1]`

### 14A — Transport & Encryption

Three connections carry data. All three need TLS explicitly confirmed, not assumed.

- [ ] **Supabase Postgres** — `DATABASE_URL` in `.env` includes `?sslmode=require`, so the `postgres` driver will not fall back to unencrypted on any environment.
- [ ] **Redis on Upstash** — connection string uses `rediss://` not `redis://`. The `s` enables TLS. Without it, cached user records, chat history, and embedding vectors travel unencrypted. This is the most commonly missed transport security item in the stack.
- [ ] **Supabase Storage** — TLS enforced by Supabase on all storage API calls. AES-256 at rest. Verified as default behavior — no additional configuration. Documented here so it is a conscious confirmation, not an assumption.
- [ ] **HTTPS on all NestJS routes** — Railway handles TLS termination. HTTP connections never reach the application. Verify in Railway dashboard that the HTTP → HTTPS redirect is active on the deployment.

### 14B — File Upload Security (Three Gates Before Storage)

All three gates run synchronously in the upload controller. Any gate failure returns immediately — nothing reaches Supabase Storage.

- [ ] **Gate 1 — MIME type whitelist.** Reject any file whose `Content-Type` header is not in the allowed list:
  ```
  application/pdf
  application/msword
  application/vnd.openxmlformats-officedocument.wordprocessingml.document
  image/jpeg
  image/png
  image/tiff
  ```
  Return 422 `FILE_TYPE_NOT_ALLOWED` immediately.

- [ ] **Gate 2 — Magic bytes validation.** MIME type in Content-Type header is client-supplied and can be spoofed. Read the first 8 bytes of the file buffer and compare against known file signatures:
  ```
  PDF:  25 50 44 46        (%PDF)
  DOCX: 50 4B 03 04        (PK\x03\x04 — ZIP container)
  DOC:  D0 CF 11 E0        (OLE2 container)
  JPEG: FF D8 FF
  PNG:  89 50 4E 47 0D 0A 1A 0A
  TIFF: 49 49 2A 00  or  4D 4D 00 2A
  ```
  If magic bytes do not match the declared MIME type: 422 `FILE_TYPE_NOT_ALLOWED`. This catches renamed executables, HTML files masquerading as PDFs, and polyglot files. Gate 1 and Gate 2 must both pass.

- [ ] **Gate 3 — File size.** Check `Content-Length` header before reading the full buffer. If above 50MB: return 422 `FILE_TOO_LARGE` immediately. Do not wait for the upload stream to complete.

- [ ] **Filename sanitization** — after all three gates pass: strip path traversal sequences (`../`, `..\`, `/`, `\`), null bytes, non-ASCII characters. Truncate to 255 characters. Store sanitized name as `original_filename` on the Document record.

### 14C — Rate Limiting (Redis-Backed, Not In-Memory)

- [ ] NestJS throttler uses `ThrottlerStorageRedisService` — not in-memory. In-memory rate limit counters do not work across multiple server instances (each instance tracks separately, attacker alternates). Redis provides a single shared counter.
  ```typescript
  ThrottlerModule.forRootAsync({
    useFactory: (redis: Redis) => ({
      storage: new ThrottlerStorageRedisService(redis),
    }),
    inject: [REDIS_CLIENT],
  })
  ```
- [ ] Public endpoints (intake, auth) — rate limited **per IP address**
- [ ] Authenticated endpoints (chat, upload, download) — rate limited **per user ID**, not per IP. Attorneys on shared office networks are not penalized for colleagues' usage.

| Endpoint | Limit | Window | Strategy | Rationale |
|---|---|---|---|---|
| `POST /leads` (intake) | 10 | 1 hour | Per IP | Prevent form spam |
| Auth endpoints | 5 failures | 15 min | Per IP | Brute force protection |
| `POST /transactions/:id/chat/:id/messages` | 60 | 1 hour | Per user | Anthropic API cost protection |
| `POST /transactions/:id/documents` | 50 | 24 hours | Per firm | Storage quota protection |
| `POST /transactions/:id/drafts` | 20 | 1 hour | Per user | LLM cost protection |
| `GET /*/download` | 200 | 1 hour | Per user | Detects credential theft pattern |

- [ ] Rate limit response shape: `{ error: { code: 'RATE_LIMIT_EXCEEDED', retryAfter: 60 } }` — `retryAfter` in seconds. Frontend shows countdown, not generic error.

### 14D — Input Handling

- [ ] **No HTML anywhere, ever.** Every text field is a plaintext string. Zod schemas include `.refine(v => !v.includes('<'), 'HTML not allowed')` on all user-facing text fields. XSS through stored content is structurally impossible when HTML is refused at the validation layer — not sanitized, refused.
- [ ] **Zod validation pipe applied globally** — already in Layer 1. Documented here as the primary input defense mechanism. No raw request bodies reach service layer.
- [ ] **SQL injection** — Drizzle's query builder parameterizes everything. One rule enforced globally: raw SQL is forbidden unless the query cannot be expressed through the query builder (vector search operators and the HNSW index hints are the legitimate cases). Any raw SQL must use Drizzle's `sql` tagged template with interpolated values (`sql\`... WHERE id = ${id}\``), which parameterizes — never string concatenation into a `sql.raw()`. ESLint rule catches string concatenation inside `sql` and bans `sql.raw()` with a non-literal argument.
- [ ] **Request body size limit** — NestJS body parser configured to reject bodies over 1MB for JSON endpoints (text fields), 60MB for multipart (file uploads, with Gate 3 enforcing the 50MB file limit within that).

### 14E — Input Length Limits

Enforced at the Zod validation layer — before any data reaches the service or database. Returns 422 `VALIDATION_ERROR` with the field name and max length in `error.details`. DB-level CHECK constraints are Phase 2.

**Why each limit exists:**

`chat_messages.content` — **4,000 characters.** Chat messages are injected into the LLM context after the system prompt. A 4,000-character message cannot override or crowd out the system prompt. Without this limit, an attorney (or an attacker) could paste an entire document into the chat field and manipulate context assembly.

`drafts.instructions` — **2,000 characters.** Attorney instructions to Claude before draft generation. Long enough for detailed direction, bounded so that a malicious instruction cannot attempt to override the draft generation system prompt.

`transactions.internal_notes` — **10,000 characters.** Attorney working notes. Generous enough for real use cases (detailed transaction notes, strategy thoughts). Bounded to prevent unbounded text storage.

`leads.inquiry_description` — **5,000 characters.** What the prospective client types into the public intake form. The intake endpoint is unauthenticated — without this limit a single submission could send megabytes of text through the validation pipeline.

`deadlines.description` — **1,000 characters.** Context note on a deadline. Short enough to stay useful in the dashboard, long enough for full contractual language context.

`parties.notes` — **500 characters.** Role-specific context (loan number, file number, closer name). Short.

`transactions.title` — **200 characters.** Auto-generated but attorney-overridable. Bounded for display consistency.

`drafts.title` — **200 characters.**

`parties.name` — **200 characters.**

**Zod enforcement:**

```typescript
// src/modules/transactions/dto/update-transaction.dto.ts
internalNotes: z.string().max(10_000).optional(),
title: z.string().max(200).optional(),

// src/modules/chat/dto/create-message.dto.ts
content: z.string().min(1).max(4_000),

// src/modules/drafts/dto/create-draft.dto.ts
instructions: z.string().max(2_000).optional(),

// src/modules/intake/dto/submit-lead.dto.ts
inquiryDescription: z.string().min(10).max(5_000),

// src/modules/deadlines/dto/create-deadline.dto.ts
description: z.string().max(1_000).optional(),

// src/modules/parties/dto/create-party.dto.ts
name: z.string().min(1).max(200),
notes: z.string().max(500).optional(),
```

### 14F — HTTP Security Headers (Helmet — Explicit Configuration)

- [ ] Content Security Policy configured:
  ```typescript
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'"],
        styleSrc:    ["'self'", "'unsafe-inline'"], // React Email template inline styles
        imgSrc:      ["'self'", "data:", process.env.SUPABASE_URL],
        connectSrc:  ["'self'", process.env.SUPABASE_URL, process.env.FRONTEND_URL],
        frameSrc:    ["'none'"],
        objectSrc:   ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },  // no referrer leakage from legal app
    hsts: { maxAge: 31536000, includeSubDomains: true }, // 1-year HSTS
    frameguard: { action: 'deny' }, // no iframe embedding
    noSniff: true, // X-Content-Type-Options: nosniff
    permittedCrossDomainPolicies: false,
  })
  ```
- [ ] BullMQ Board admin UI served on a separate internal-only route (`/internal/queues`) with CSP exemption or served as a separate Railway service not behind Helmet — the BullMQ Board requires `'unsafe-inline'` scripts that conflict with the application CSP.
- [ ] Permissions-Policy header disables unused browser features: `camera=(), microphone=(), geolocation=(), payment=()`. Applied via custom middleware since Helmet does not set this by default.

### 14G — Supabase Storage Security

- [ ] **Private bucket** — `documents` bucket configured as private in Supabase dashboard → Storage → Policies. No public access. No public URLs. Verified manually and documented as a setup step, not assumed.
- [ ] **Server-side operations only** — all storage operations use the Supabase service client on the NestJS backend. No direct browser uploads in Phase 1. Every file passes through validation gates before reaching storage.
- [ ] **Signed URL generation** — `supabase.storage.from('documents').createSignedUrl(storageKey, 900)`. 900 seconds = 15 minutes. URL generated at request time on every download request — never cached, never stored in the database.
- [ ] **Service key rules** — `SUPABASE_SERVICE_KEY` is used in exactly two places: `AuthService` (auth callback to link `auth_id` to User record) and `StorageService` (file upload and signed URL generation). Any other module using `SUPABASE_SERVICE_KEY` is a security violation. Enforced by code review — ESLint import rule can flag any import of the service key outside these two modules.
- [ ] **Storage key format** — `{firmId}/{transactionId}/{uuid}.{ext}`. Hierarchical prefix provides natural firm-level isolation and enables future RLS storage policies.
- [ ] Draft PDFs stored at `drafts/{firmId}/{draftId}-approved.pdf` with a 1-hour signed URL for download. Deleted after download or after 24 hours via a cleanup job.

### 14H — Logging and PII Masking (Exact Spec)

- [ ] **Masked fields** — before any log is written, these fields are replaced with `[REDACTED]`:
  `full_name`, `email`, `phone`, `first_name`, `last_name`, `property_address`, `inquiry_description`, `internal_notes`, `password`, `token`, `authorization`
- [ ] Masked value is `[REDACTED]` — not `***`, not a hash. Unambiguous in log analysis and search.
- [ ] **Masking applied in request logging interceptor** — deep-clones the request body, applies `maskPII()` recursively, logs the masked copy. Original body is never logged.
- [ ] **Response bodies are never logged** — too large, may contain document content or PII.
- [ ] **Stripped headers** — before logging request headers, these are replaced with `[STRIPPED]`: `authorization`, `x-api-key`, `cookie`, `x-supabase-key`. `STRIPPED_HEADERS` is a constant Set in the interceptor.
- [ ] Correlation ID included on every log line — `{ correlationId, userId, firmId, path, method, statusCode, durationMs }`. Set by correlation ID interceptor from Layer 1.

### 14H — Security Event Logging

Distinct from application logs. Written as structured events to Sentry with `level: 'warning'` under an `security` issue category — separate from application `errors`.

- [ ] `SecurityEventLogger` service in `src/common/security/security-event.logger.ts`
- [ ] Events logged: `AUTH_FAILURE`, `RATE_LIMIT_HIT`, `PERMISSION_DENIED`, `INACTIVE_USER_ACCESS`, `FILE_REJECTED`, `INVALID_FILE_MAGIC_BYTES`, `SUSPICIOUS_DOWNLOAD_PATTERN`
- [ ] Each event shape: `{ event: SecurityEventType, ip, userAgent, userId?: string, path, method, reason, timestamp }`
- [ ] `AUTH_FAILURE` events include: which JWT validation step failed (expired, invalid signature, missing), not just "unauthorized"
- [ ] `INACTIVE_USER_ACCESS` fires when JwtAuthGuard finds `is_active: false` on the hydrated User record — a deactivated attorney attempted access
- [ ] Security events never contain PII — user ID only, never name or email in the security log

### 14I — Secret Management

- [ ] **JWT secret entropy** — must be generated with `openssl rand -base64 32`. 256 bits of entropy. Not a word, phrase, or password. Document this command in `CONTRIBUTING.md` so no engineer generates a weak secret.
- [ ] **`.env` in `.gitignore` from the first commit** — if `.env` is ever accidentally committed to git (even private repo), rotate every credential immediately. No exceptions.
- [ ] **Production secrets in Railway environment variable manager** — never in a `.env` file on the production server. Railway dashboard → Variables → set each secret individually.
- [ ] **Startup validation** — `validateEnvVars()` from Layer 1 runs before the server binds to a port. Missing required secrets cause the process to exit with a clear error message. The server never starts in a partially-configured state.
- [ ] **No secrets in application code** — no hardcoded API keys, connection strings, or tokens anywhere in the codebase. ESLint `no-hardcoded-secrets` rule catches common patterns.

### 14J — Dependency Security

- [ ] `npm audit` in CI on every push — already in Layer 16. Blocks merge on HIGH or CRITICAL vulnerabilities.
- [ ] **Dependabot** configured in `.github/dependabot.yml` — sends automated PRs when npm vulnerabilities are published. Weekly schedule, grouped by ecosystem (npm, GitHub Actions). PRs auto-assigned to the security review queue.
- [ ] **LibreOffice version pinned** in the Railway Dockerfile — exact version string via the `LO_VERSION` build arg, on a digest-pinned Debian base. Never `libreoffice` (latest). Full Dockerfile and rationale in §17A; that section is the source of truth for the image.
- [ ] **Supabase JS SDK pinned** to a minor version — `"@supabase/supabase-js": "~2.39.0"`. Major version updates can introduce breaking auth changes. Pin and update deliberately.

> `[PHASE 2]` Add: Stripe webhook signature verification (HMAC-SHA256, event ID deduplication in Redis), per-firm rate limits tied to plan tier, session invalidation on role change or firm cancellation (Redis key bust on user update), CSP nonce strategy for BullMQ Board, penetration test before public launch, SOC2 Type I readiness assessment.

---

## Layer 15 — Testing `[PHASE 1]`

> Testing is written alongside every layer — not at the end. Every feature that ships without tests is incomplete. The TDD guide in `10-tdd-guide.md` is the engineering standard.

### 15A — Unit Tests

All deterministic logic with no I/O. Run in under 10 seconds total. Zero database, zero network.

**Status & Transitions**
- [ ] `validateTransition(INTAKE, UNDER_CONTRACT)` — passes
- [ ] `validateTransition(CLOSED, UNDER_CONTRACT)` — throws `INVALID_STATUS_TRANSITION` with `{ current, next, allowed }` in details
- [ ] `validateTransition(FALLEN_THROUGH, CLOSED)` — throws `INVALID_STATUS_TRANSITION`
- [ ] Every invalid transition in the map has an explicit failing test — not just spot checks

**Deadline Logic**
- [ ] Urgency calculator: 14+ days → INFO, 7–13 → WARNING, 3–6 → URGENT, 0–2 → CRITICAL
- [ ] Urgency calculator: exactly 14 days → INFO (boundary)
- [ ] Urgency calculator: exactly 7 days → WARNING (boundary)
- [ ] Urgency calculator: exactly 3 days → URGENT (boundary)
- [ ] Urgency calculator: 0 days (today) → CRITICAL
- [ ] Urgency calculator: past due → CRITICAL
- [ ] Retention date calculator: `retention_until = closed_at + 7 years` exactly — not approximated
- [ ] Alert deduplication check: `shouldSendAlert(urgency, alertsSentAt)` returns false when that urgency tier is already in the array

**Conflict Check**
- [ ] Name matcher: exact match "Jennifer Martinez" → FLAGGED
- [ ] Name matcher: case-insensitive "jennifer martinez" → FLAGGED
- [ ] Name matcher: "Independence Title" vs "Independence Title Company" → FLAGGED (substring match)
- [ ] Name matcher: "John Smith" vs "Jane Smith" → CLEAR (last name alone not enough)
- [ ] Name matcher: no existing parties → CLEAR

**Document Processing**
- [ ] Magic bytes validator: valid PDF bytes (`%PDF`) → passes Gate 2
- [ ] Magic bytes validator: valid DOCX bytes (`PK\x03\x04`) → passes Gate 2
- [ ] Magic bytes validator: `.exe` bytes with `.pdf` extension → fails Gate 2 with `FILE_TYPE_NOT_ALLOWED`
- [ ] Magic bytes validator: empty file buffer → fails with `FILE_TOO_LARGE` or `FILE_TYPE_NOT_ALLOWED`
- [ ] MIME type whitelist: `application/pdf` → allowed
- [ ] MIME type whitelist: `application/zip` → rejected before Gate 2 runs

**RAG & Chat**
- [ ] Token budget assembler: 25 chunks with varying token counts → assembled context never exceeds 6,000 tokens
- [ ] Token budget assembler: chunks added in descending relevance score order
- [ ] Token budget assembler: chunk that would push past 6,000 tokens is skipped entirely, not truncated
- [ ] Relevance threshold: chunk with similarity 0.71 → included
- [ ] Relevance threshold: chunk with similarity 0.69 → excluded
- [ ] No-results fallback trigger: zero chunks above threshold → returns deterministic fallback, never calls Anthropic

**Draft Generation**
- [ ] Section review counter: `sections_reviewed_count` increments on each `markSectionReviewed()` call
- [ ] Approval gate: `sections_reviewed_count < total_sections_count` → throws `DRAFT_SECTIONS_NOT_REVIEWED`
- [ ] Approval gate: `sections_reviewed_count === total_sections_count` → passes
- [ ] Attestation text stored verbatim on approval — not truncated, not modified
- [ ] Review time tracker: calculates `review_duration_seconds` from `review_started_at` to approval timestamp

**AI Disclosure**
- [ ] Disclosure text generator: output contains attorney name, document title, and generation date
- [ ] Disclosure text generator: matches Northern District of Texas Local Rule 7.2(f) format

**Soft Delete**
- [ ] `notDeleted.transactions` produces `WHERE deleted_at IS NULL` SQL fragment
- [ ] `notDeleted.documents` produces correct fragment
- [ ] `notDeleted.deadlines` produces correct fragment

### 15B — Integration Tests

Real Postgres + Redis via testcontainers. Mock: Anthropic API, Voyage AI, Resend, Supabase Auth, Google Calendar API.

**Document Pipeline**
- [ ] Upload → PENDING → PROCESSING → EXTRACTING → EMBEDDING → READY — all status transitions fire SSE events
- [ ] Upload → LibreOffice conversion failure → FAILED with human-readable `processing_error`, not stack trace
- [ ] Upload PURCHASE_AGREEMENT → deadline extraction triggered automatically
- [ ] Upload AMENDMENT → superseding check runs against existing CLOSING_DATE deadline
- [ ] Document re-upload (same type, same transaction): old document soft deleted, old chunks cascade deleted, new chunks created, RAG returns new document content not old
- [ ] Document with zero extractable text (scanned PDF) → FAILED with "No extractable text — document may be a scanned image"
- [ ] File size 51MB → rejected before Supabase Storage write with `FILE_TOO_LARGE`
- [ ] Magic bytes mismatch → rejected before Supabase Storage write with `FILE_TYPE_NOT_ALLOWED`

**Deadline Intelligence**
- [ ] Purchase agreement fixture → at least `CLOSING_DATE` and `OPTION_PERIOD_EXPIRY` extracted with correct dates
- [ ] Extracted deadlines created as `PENDING_REVIEW` — not ACTIVE
- [ ] Confirm deadline → status → ACTIVE, `confirmed_by_id` set, `confirmed_at` set, `deadline.confirmed` activity logged
- [ ] Dismiss deadline → status → DISMISSED, `deadline.dismissed` activity logged
- [ ] Amendment fixture → `CLOSING_DATE` extracted → existing ACTIVE `CLOSING_DATE` deadline: `superseded_by_id` set, status → DISMISSED; new deadline created with `supersedes_id` pointing back
- [ ] Two amendments in sequence → deadline chain: original ← amendment 1 ← amendment 2
- [ ] Alert scheduler: runs, finds ACTIVE deadline 5 days out, sends email job, appends to `alerts_sent_at`
- [ ] Alert scheduler: runs again immediately, finds same deadline, does NOT re-send (deduplication)
- [ ] Calendar sync on deadline confirmation: Google Calendar API called, `calendar_event_id` stored on deadline
- [ ] Calendar sync on deadline update: existing `calendar_event_id` event updated, not a second event created

**Conflict Check**
- [ ] Create transaction with buyer "Jennifer Martinez" → create lead with same name → lead `conflict_check_status` = FLAGGED, attorney notification queued
- [ ] Create lead with no matching parties → `conflict_check_status` = CLEAR
- [ ] Convert lead with FLAGGED conflict check → rejected until status updated to REVIEWED
- [ ] Convert lead with CLEAR conflict check → transaction created, `conflict.cleared` activity logged

**Chat / RAG**
- [ ] Question about fixture transaction → cited answer with `document_name` and `page_number` in citations
- [ ] Question about something not in any document → deterministic fallback response returned, zero Anthropic API calls made
- [ ] Vector search scoped to transaction A: chunks from transaction B with semantically similar content → zero results returned. This is the firm isolation test.
- [ ] Two chat messages in sequence → second message includes first exchange in conversation history

**Draft Generation**
- [ ] Generate AMENDMENT draft → status transitions: GENERATING → READY (via BullMQ worker)
- [ ] Generated draft has correct `total_sections_count` matching the AMENDMENT section schema
- [ ] Approve draft without marking all sections reviewed → 422 `DRAFT_SECTIONS_NOT_REVIEWED`
- [ ] Mark all sections reviewed → approve → `approved_at` set, `approval_attestation_text` stored, status → APPROVED
- [ ] No code path in the system can set `sent_at` without `approved_at` being non-null first

**Lead Intake**
- [ ] Same idempotency key submitted twice → one lead created, second response returns original lead with `isDuplicate: true`
- [ ] Same email submitted within 48 hours → duplicate detection via time-window check → `duplicate_of_id` set
- [ ] Lead → convert → transaction created, lead `converted_transaction_id` set, `lead_status` = CONVERTED, both writes succeed or both fail (transactional)
- [ ] 11th submission from same IP in 1 hour → 429 `RATE_LIMIT_EXCEEDED`

**AI Disclosure**
- [ ] Generate draft → `was_ai_assisted` = true on draft record
- [ ] Generate disclosure text → correct format, stored as `ai_disclosure_text`
- [ ] Attorney acknowledges client AI disclosure → `ai_disclosure_acknowledged_at` set on transaction

### 15C — E2E Tests

Full HTTP stack with real JWT. Auth via test JWT helper. Checks response body AND database state.

**Authentication & Authorization**
- [ ] Valid JWT → 200 on protected route
- [ ] Expired JWT → 401 with `error.code = 'TOKEN_EXPIRED'` (not generic unauthorized)
- [ ] Deactivated attorney → 401 with `error.code = 'USER_INACTIVE'` within cache TTL window
- [ ] Missing JWT → 401
- [ ] PARALEGAL role attempting to approve a draft → 403
- [ ] CLIENT role attempting to access `GET /v1/transactions` → 403
- [ ] Manipulated JWT with mismatched firm_id → service-layer firm check rejects with 403

**Transaction Management**
- [ ] `POST /v1/transactions` → 201, `transaction_number` auto-generated, `transaction.created` activity logged
- [ ] `GET /v1/transactions` → paginated list, excludes archived and soft-deleted
- [ ] `PATCH /v1/transactions/:id/status` with valid transition → 200, `closed_at` set on terminal status
- [ ] **Terminal transitions (CLOSED / FALLEN_THROUGH) require `outcome_reason`.** The UI prompts with a dropdown at the moment the attorney knows the answer. Also computes and stores `cycle_time_days` (effective_date → closed_at). Without the WHY there is no risk scoring and no honest answer to "what kills our deals?" — and it is unrecoverable three months later.
- [ ] `PATCH /v1/transactions/:id/status` with invalid transition → 422 `INVALID_STATUS_TRANSITION`
- [ ] Full transaction lifecycle: create → upload doc → confirm deadline → generate draft → approve draft → close → verify `retention_until` = `closed_at + 7 years`

**Document Security**
- [ ] Upload `.exe` renamed to `.pdf` → 422 `FILE_TYPE_NOT_ALLOWED` (magic bytes rejection)
- [ ] Upload 51MB file → 422 `FILE_TOO_LARGE`
- [ ] Download signed URL after 16 minutes → access denied (URL expired)
- [ ] Client attempts to download a document where `is_client_visible = false` → 404

**Client Status Page**
- [ ] CLIENT JWT on their own transaction → 200 with correct shape, no internal fields
- [ ] CLIENT JWT on a different client's transaction ID → 404 `TRANSACTION_NOT_FOUND` (not 403 — never reveal transaction exists)
- [ ] CLIENT JWT on attorney-facing endpoint → 403

**Conflict Check**
- [ ] Submit lead with matching party name → lead returned with `conflict_check_status = FLAGGED`
- [ ] Attempt to convert FLAGGED lead without attorney review → 422 `CONFLICT_CHECK_REQUIRED`
- [ ] Update conflict check to REVIEWED → convert succeeds

**Draft Verification**
- [ ] Approve draft without reviewing all sections → 422 `DRAFT_SECTIONS_NOT_REVIEWED`
- [ ] Mark all sections reviewed → approve → `approval_attestation_text` stored
- [ ] `GET /v1/transactions/:id/drafts/:id` → `was_ai_assisted = true` on generated drafts
- [ ] `POST /v1/transactions/:id/drafts/:id/disclosure` → returns correct disclosure text

**Rate Limiting**
- [ ] 61st chat message in 1 hour → 429 `RATE_LIMIT_EXCEEDED` with `retryAfter` in response body
- [ ] 11th intake form submission from same IP in 1 hour → 429
- [ ] Rate limit keys are per-user for authenticated endpoints (not per-IP)

**Real-Time**
- [ ] SSE `/v1/events` — connect, receive 5 events, disconnect, trigger 3 more events, reconnect with `Last-Event-ID`, verify 3 missed events replayed
- [ ] Document upload → SSE event `document.status` with status `PROCESSING` received by connected client
- [ ] Document reaches READY → SSE event `document.status` with status `READY` received

**Security**
- [ ] Approval attestation tamper: call approve endpoint without prior section reviews → 422 regardless of request body content
- [ ] Draft sent_at tamper: attempt to PATCH `sent_at` directly on a draft that is not yet APPROVED → 422

### 15D — Graceful Shutdown Test

- [ ] Start document processing job, wait for `PROCESSING` status, send SIGTERM to worker process
- [ ] Verify: job completes (document status → READY), not interrupted
- [ ] Verify: no new jobs picked up after SIGTERM
- [ ] Verify: Redis connection cleanly disconnected
- [ ] Verify: no document stuck in `PROCESSING` status after worker restart

> `[PHASE 2]` Add: two-firm RLS isolation tests across every endpoint, scoring function unit tests (liability, damages, platform fee calculator), arbitrage prediction integration tests, outcome feedback loop integration tests, load test on document queue (50 concurrent uploads), performance test against p95 targets per endpoint.

---

## Layer 16 — Observability `[PHASE 1]`

### 16A — Sentry Setup

- [ ] `npm install @sentry/node @sentry/profiling-node`
- [ ] `src/instrument.ts` created — Sentry must be initialized before any other import in `main.ts`:
  ```typescript
  // main.ts — first line before any other import
  import './instrument'
  ```
  ```typescript
  // instrument.ts
  import * as Sentry from '@sentry/node'
  import { nodeProfilingIntegration } from '@sentry/profiling-node'

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.npm_package_version,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: 0.1,
    integrations: [nodeProfilingIntegration()],
  })
  ```
- [ ] `SENTRY_DSN` env var added to `.env.example` and Railway production environment
- [ ] `SENTRY_ORG` and `SENTRY_PROJECT` added for release tracking in CI

### 16B — Span Instrumentation

A `withSpan` utility wraps every operation that needs tracing. Lives in `src/common/observability/trace.ts`.

- [ ] `withSpan(op, name, attributes, fn)` utility created
- [ ] **LLM calls** instrumented — every Anthropic API call wrapped with span:
  - `op: 'ai.chat'` for chat messages
  - `op: 'ai.extract'` for deadline and document classification extraction
  - `op: 'ai.draft'` for draft generation
  - Attributes: `model`, `prompt_tokens`, `completion_tokens`, `latency_ms`, `transaction_id`
- [ ] **Vector search** instrumented:
  - `op: 'db.vector_search'`
  - Attributes: `transaction_id`, `chunks_candidate`, `chunks_returned`, `threshold`, `latency_ms`
- [ ] **Document processing stages** — each stage in the BullMQ worker is a child span:
  - `op: 'doc.convert'` — LibreOffice conversion
  - `op: 'doc.extract'` — PDF text extraction
  - `op: 'doc.classify'` — Anthropic document type classification
  - `op: 'doc.chunk'` — text splitting
  - `op: 'doc.embed'` — Voyage AI embedding per batch
  - `op: 'doc.store'` — Drizzle bulk insert of chunks
- [ ] **External API calls** (Voyage AI, Resend) — automatic via Sentry HTTP instrumentation if `autoInstrumentFetch: true` is set
- [ ] **BullMQ jobs** — each job starts a new Sentry transaction with `op: 'queue.process'`

### 16C — User Context on Every Event

Set in JwtAuthGuard after user hydration — before any controller runs:

- [ ] `Sentry.setUser({ id: user.id })` — user ID only, never email or name (PII)
- [ ] `Sentry.setTag('firm.id', user.firmId)`
- [ ] `Sentry.setTag('user.role', user.role)`
- [ ] `Sentry.setContext('request', { correlationId, path, method })`
- [ ] Cleared on request completion via `Sentry.configureScope(scope => scope.clear())`

### 16D — Error Fingerprinting

Sentry groups similar errors. Without fingerprinting every `TRANSACTION_NOT_FOUND` becomes one issue. With fingerprinting, issues group by error code + endpoint:

- [ ] Global exception filter sets fingerprint before capturing:
  ```typescript
  Sentry.withScope(scope => {
    scope.setFingerprint([
      exception.errorCode,   // TRANSACTION_NOT_FOUND, RATE_LIMIT_EXCEEDED
      request.method,
      request.route?.path,   // /v1/transactions/:id not /v1/transactions/abc123
    ])
    Sentry.captureException(exception)
  })
  ```
- [ ] Route parameter values never in fingerprints — `request.route.path` not `request.url`

### 16E — Cron Monitoring (Deadline Alert Scheduler)

The deadline alert scheduler is a BullMQ repeatable job running every hour. A missed run means attorneys may not get alerts. Sentry Crons verifies it actually runs.

- [ ] Sentry Crons monitor created in Sentry dashboard: slug `deadline-alert-scheduler`, schedule `0 * * * *` (every hour), failure tolerance 5 minutes
- [ ] Scheduler job wraps execution with check-in:
  ```typescript
  const checkInId = Sentry.captureCheckIn({
    monitorSlug: 'deadline-alert-scheduler',
    status: 'in_progress',
  })
  try {
    await runDeadlineAlerts()
    Sentry.captureCheckIn({ checkInId, monitorSlug: 'deadline-alert-scheduler', status: 'ok' })
  } catch (e) {
    Sentry.captureCheckIn({ checkInId, monitorSlug: 'deadline-alert-scheduler', status: 'error' })
    throw e
  }
  ```
- [ ] If scheduler misses its check-in window: Sentry sends critical alert immediately — a missed scheduler is a production-critical failure for a legal platform

### 16F — Structured Log Format

Every log line written by the request logging interceptor and application code follows this exact shape:

```json
{
  "timestamp": "2025-06-19T14:32:01.123Z",
  "level": "info",
  "correlationId": "req_01HXY...",
  "userId": "uuid-or-null",
  "firmId": "uuid-or-null",
  "module": "DeadlineService",
  "action": "confirm_deadline",
  "transactionId": "uuid-or-null",
  "durationMs": 45,
  "statusCode": 200,
  "error": null
}
```

- [ ] All log calls use structured logger (Pino or Winston, not `console.log`) configured to output JSON in production, pretty-print in development
- [ ] `console.log` forbidden in application code — ESLint `no-console` rule enforces this
- [ ] Logger injectable via NestJS DI — `@Inject(LOGGER)` — never imported directly from the logging library

### 16G — Performance Targets (Sentry Dashboard Thresholds)

Defined as Sentry performance alerts. These are not aspirational — they are the thresholds at which alerts fire.

| Category | p50 target | p95 target | Alert fires at |
|---|---|---|---|
| Auth endpoints | 100ms | 300ms | p95 > 500ms |
| Transaction CRUD | 50ms | 150ms | p95 > 300ms |
| Document upload (enqueue) | 200ms | 500ms | p95 > 1000ms |
| Deadline dashboard | 75ms | 200ms | p95 > 400ms |
| Chat — time to first token | 500ms | 1500ms | p95 > 3000ms |
| Draft generation (enqueue) | 100ms | 200ms | p95 > 400ms |
| Vector search | 20ms | 50ms | p95 > 100ms |
| Health check | 20ms | 50ms | p95 > 100ms |

Note: Streaming endpoints measure time-to-first-byte, not total response time.

### 16H — Alert Thresholds

Two severity levels. Both configured in Sentry Alerts → Alert Rules.

**Critical — immediate action required (Sentry → Slack #critical-alerts):**
- [ ] Error rate > 5% on any non-AI endpoint sustained 5 minutes
- [ ] Error rate > 20% on AI endpoints sustained 5 minutes
- [ ] Health check failing for > 2 minutes
- [ ] Dead letter queue depth > 10 jobs
- [ ] Deadline alert scheduler missed check-in
- [ ] p95 API response > 5 seconds on any endpoint
- [ ] 0 events received from Sentry for > 10 minutes in production (instrumentation down)

**Warning — investigate within 1 hour (Sentry → Slack #backend-alerts):**
- [ ] Error rate > 2% sustained 10 minutes
- [ ] p95 > 2 seconds on any endpoint
- [ ] Queue depth > 50 pending jobs
- [ ] Document processing FAILED count > 5 in any 60-minute window
- [ ] User hydration cache miss rate spikes (indicates cache eviction problem)

---

## Layer 17 — Deployment `[PHASE 1]`

### 17A — Dockerfile

**Base image: Debian (`bookworm-slim`), not Alpine.** `[LOCKED]` Alpine's musl libc is a recurring source of breakage for LibreOffice and for Node native modules. The image is larger; the debugging time saved is worth more than the megabytes. Both processes build from the same Dockerfile.

- [ ] Dockerfile written — multi-stage, pnpm, must install LibreOffice:
  ```dockerfile
  # ---- build ----
  FROM node:20-bookworm-slim AS build
  WORKDIR /app
  RUN corepack enable
  COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
  COPY apps/api/package.json ./apps/api/
  COPY packages/shared/package.json ./packages/shared/
  RUN pnpm install --frozen-lockfile
  COPY . .
  RUN pnpm --filter shared build && pnpm --filter api build
  RUN pnpm deploy --filter api --prod /prod/api

  # ---- runtime ----
  FROM node:20-bookworm-slim AS runtime
  # LibreOffice Writer only — the full libreoffice metapackage adds ~1GB of
  # formats we never convert. Pinned: re-check with `apt-cache policy
  # libreoffice-writer` whenever the base image tag is bumped.
  ARG LO_VERSION=<pin-at-scaffold-time>
  RUN apt-get update \
   && apt-get install -y --no-install-recommends "libreoffice-writer=${LO_VERSION}" \
   && rm -rf /var/lib/apt/lists/*
  WORKDIR /app
  COPY --from=build /prod/api ./
  COPY --from=build /app/apps/api/drizzle ./drizzle
  USER node
  EXPOSE 3001
  CMD ["node", "dist/main.js"]        # worker service overrides: dist/worker.js
  ```
- [ ] `LO_VERSION` filled with the exact version string from `apt-cache policy libreoffice-writer` in the pinned base image, and recorded in the PR description. **Never install unpinned** — an uncontrolled LibreOffice update breaks document conversion silently. Version bumps are a deliberate engineering decision, not a side effect of a redeploy.
- [ ] Base image pinned by digest (`node:20-bookworm-slim@sha256:...`), so the apt snapshot the version pin resolves against doesn't drift underneath it
- [ ] Multi-stage build used — build stage carries devDependencies, runtime image does not. `pnpm deploy --prod` produces the pruned runtime tree.
- [ ] Runs as the non-root `node` user
- [ ] `drizzle/` migrations directory included in the production image — migrations run on deploy
- [ ] Smoke check in CI: build the image, run `libreoffice --headless --convert-to pdf` on a fixture DOCX, assert a PDF comes out. A broken conversion must fail the build, not the pipeline in production.

### 17B — Railway Configuration

Two Railway services from one repository:

- [ ] **HTTP server service** — start command: `node dist/main.js`. Handles all API requests.
- [ ] **BullMQ worker service** — start command: `node dist/worker.js`. Separate entrypoint file that boots only the queue workers without starting the HTTP server.
- [ ] `worker.ts` entrypoint created alongside `main.ts` — bootstraps `WorkerModule` via `NestFactory.createApplicationContext()`, **not** `NestFactory.create()`. Full DI container, no port binding, no controllers instantiated. Both entrypoints share `CoreModule`; neither shares a root module. See `18-nestjs-conventions.md` §6.
- [ ] `@Processor()` classes are provided by `WorkerModule` only. Feature modules call `BullModule.registerQueue()` so they can *enqueue* — producer and consumer registration are separate, and the two processes must never run the same processor.
- [ ] Both services share the same environment variables in Railway — one variable group, two services
- [ ] Health check path configured in Railway HTTP service settings: `GET /health`
- [ ] Worker service has no health check path — Railway monitors it via process status

### 17C — Environment Variables — Complete List

`.env.example` must contain every variable with description before first commit:

```bash
# Supabase (database + auth + storage)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=        # NEVER use in client code — server-side only in AuthService and StorageService
SUPABASE_STORAGE_BUCKET=documents

# Database (Drizzle)
DATABASE_URL=                # postgres://... — must include ?sslmode=require

# Redis
REDIS_URL=                   # rediss:// not redis:// — TLS required on Upstash

# AI
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=              # voyage-law-2 model for legal embeddings

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=           # must be a verified domain in Resend dashboard

# Observability
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=

# Security
JWT_SECRET=                  # generate: openssl rand -base64 32
HMAC_SECRET=                 # generate: openssl rand -base64 32

# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000
CLIENT_PORTAL_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
FIRM_ID=                     # Phase 1: hardcoded single firm UUID
```

### 17D — CORS Configuration

- [ ] CORS configured explicitly in NestJS:
  ```typescript
  app.enableCors({
    origin: process.env.CORS_ORIGINS.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'Last-Event-ID'],
    exposedHeaders: ['X-Request-Id'],
  })
  ```
- [ ] `CORS_ORIGINS` is a comma-separated list in env — attorney dashboard URL, client portal URL, localhost for dev
- [ ] Intake endpoint (`POST /v1/leads`) gets broader CORS if law firm embeds it on their own website — add their domain to `CORS_ORIGINS` at setup time

### 17E — CI/CD Pipeline

- [ ] CI on every push: `tsc --noEmit` → ESLint → unit tests → integration tests (with testcontainers)
- [ ] CD on merge to `main`: deploy to staging
- [ ] Production deploy: manual approval gate in Railway
- [ ] Release tagged in Sentry on production deploy — matches `npm_package_version`
- [ ] `npm audit --audit-level=high` in CI — blocks merge on HIGH or CRITICAL vulnerabilities

### 17F — Staging Environment

- [ ] Staging is a completely separate Supabase project — own database, own auth, own storage. Never shares data with production. Sharing staging and production Supabase is how seed scripts accidentally run against production data.
- [ ] Staging Railway services point to staging Supabase project via separate env vars
- [ ] Staging Upstash Redis is a separate instance from production
- [ ] Staging SENTRY_DSN uses staging Sentry environment — errors in staging do not pollute production error tracking

### 17G — Database Backup Verification

- [ ] Supabase Pro plan confirmed — includes automated daily backups with 30-day retention
- [ ] Backup schedule verified in Supabase dashboard → Settings → Backups
- [ ] Backup restoration tested once during initial setup — confirm a backup can actually be restored before relying on it for a law firm's production data
- [ ] Point-in-time recovery enabled — allows restoration to any point within the retention window, not just daily snapshots

> `[PHASE 2]` Add: multi-region Supabase for national SaaS expansion, blue-green deployment for zero-downtime schema migrations, CDN for document delivery at scale, database read replicas for analytics queries.

---

## Build Order

```
Phase 1 — Build in this order, stop when first client signs:

Layer 1    Project foundation + Drizzle setup + API versioning
Layer 2    Auth (simplified, single tenant)
Layer 3    Transaction management
Layer 4    Document pipeline  ← everything depends on this
Layer 5    Transaction intelligence chat
Layer 6    Deadline intelligence  ← most important demo feature
Layer 7    Document draft generation
Layer 8    Simple lead intake
Layer 9    Notification system (Resend)
Layer 10   Client status page
Layer 11   Real-time (SSE only)
Layer 8A   Matter Notes
Layer 8B   Communication Log
Layer 8C   Document Checklist
Layer 8D   Business Operations (Tasks, Time Tracking, Invoicing)
Layer 9    Notification System
Layer 10   Client Status Page (signed token)
Layer 11   Real-time (SSE only)
Layer 12   Queues
Layer 13   Caching (user hydration + embeddings + chat history)
Layer 14   Security
Layer 15   Testing (written alongside every layer, not at the end)
Layer 16   Observability (Sentry — wired in from Layer 1, alerts configured at Layer 16)
Layer 17   Deployment (Dockerfile, Railway config, staging, backups)

Phase 2 — After first client is signed and paying:

  Enforce RLS + full multi-tenancy
  Self-serve onboarding + Stripe subscriptions
  Plan enforcement guard
  Full client portal
  Billing capture + time tracking
  Firm playbooks
  AI intake agent
  Mass document analysis (tabular review)
  Case DNA layer
  Litigation Arbitrage Engine (PI expansion)
  Judge + carrier + counsel fingerprints
  Settlement intelligence database
  Outcome feedback loop
```
