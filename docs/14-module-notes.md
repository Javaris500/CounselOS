# CounselOS — Developer Module Notes
### Understand each module, why it exists, and how it serves the goal

> **The goal, in one line:** Be the system a real estate law firm cannot practice without — case management first, AI-enhanced second. Phase 1 closes one paying firm in Austin. Every module below earns its place by removing a real friction from an attorney's day. If a module doesn't map to a pain an attorney feels, it doesn't belong.
>
> Use this doc to orient before touching code. Each module has: **what it does**, **why it exists**, and **how it connects to the goal**. Keep your own notes under each one as you learn the codebase.

---

## Foundation & Auth

**What it does.** Bootstraps the app — Drizzle client, correlation IDs, the global error envelope, the Zod validation pipe, health checks. Auth validates the Supabase JWT on every request, hydrates the user from a 5-minute Redis cache, and gates access by role (OWNER / ATTORNEY / PARALEGAL).

**Why it exists.** Everything downstream assumes a consistent request shape, a known user, and a firm scope. Get this wrong and every other module inherits the bug. The two-record auth model (Supabase owns credentials, we own the application user) means we can deactivate an attorney instantly without depending on Supabase's session state.

**Connects to the goal.** A law firm's data is confidential and regulated. Auth is where confidentiality begins — the wrong person must never see a matter. The role hierarchy mirrors how a real firm actually delegates: owners run the firm, attorneys own matters, paralegals assist but can't approve legal work.

*Your notes:*

---

## Transactions

**What it does.** The central entity. Owns the pipeline (INTAKE → … → CLOSED / FALLEN_THROUGH), parties, key dates, financials, and enforced status transitions. Everything else in the app hangs off a transaction.

**Why it exists.** A real estate matter *is* a transaction. The status pipeline is how an attorney sees where every deal stands at a glance, and the enforced transitions prevent impossible states (you can't move a CLOSED deal back to UNDER_CONTRACT). Denormalized `firm_id` on every child table is deliberate — it makes Phase 2 multi-tenancy slot in without a rewrite.

**Connects to the goal.** This is the spine of "case management first." If the transaction model is right, the attorney can run their practice here. If it's wrong, no amount of AI saves it.

*Your notes:*

---

## Documents & Chunks

**What it does.** Upload with hard validation gates (MIME whitelist, magic bytes, size limit), then an async pipeline: convert → extract → classify → chunk → embed → store. Chunks land in pgvector for search.

**Why it exists.** Documents are the raw material of every intelligent feature. The pipeline is async because processing a 40-page contract takes seconds and can't block the upload response. The classifier is *deterministic* (keyword scoring, zero AI) because classification is pattern-matching, not intelligence — paying for an LLM call there would be waste.

**Connects to the goal.** Document intelligence is where CounselOS is genuinely ahead of Clio and MyCase. But it only works if the pipeline is reliable — every chat answer, every extracted deadline, every checklist auto-check depends on documents being processed correctly. This module is load-bearing for the whole AI layer.

*Your notes:*

---

## Deadlines

**What it does.** Extracts deadlines from contracts via Claude, stages them as PENDING_REVIEW for attorney confirmation, tracks amendment superseding (old deadline linked, never deleted), and fires tiered alerts (INFO → CRITICAL). Firm-wide dashboard sorts by urgency.

**Why it exists.** Missing a real estate deadline kills a deal or costs a client their earnest money. Extraction saves the attorney from reading every contract line-by-line, but deadlines never activate automatically — the attorney confirms each one, because the stakes are too high to trust extraction blindly. Amendment superseding preserves the full chain so the attorney can always see how a date changed.

**Connects to the goal.** This is the feature that closes the demo. It's the clearest, highest-stakes ROI a real estate firm feels immediately. It's also where "AI-enhanced" and "attorney always in control" meet — the AI does the tedious extraction, the attorney owns the decision.

*Your notes:*

---

## Chat (RAG)

**What it does.** Answers questions about a transaction using only its documents. Query embedded, pre-filtered vector search scoped to the transaction, 0.70 relevance threshold, 6,000-token budget. Streams tokens over SSE with citations. Includes matter notes and recent communications in context.

**Why it exists.** Attorneys shouldn't scroll a 40-page PDF to find the earnest money amount. The no-hallucination guard is the critical design: if no chunks clear the threshold, Claude is never called — a deterministic fallback returns instead. In a legal context, a confident wrong answer is a liability, not a feature.

**Connects to the goal.** This is what makes CounselOS feel like an *OS* and not a filing cabinet. And because it reads the communication log too, the answer to "what's the status of the title work?" draws on both the documents and the call the attorney logged yesterday — something no traditional case management tool can do.

*Your notes:*

---

## Drafts

**What it does.** Generates legal documents section-by-section, async via the queue. Attorney reviews each section, attests, and downloads a PDF. Seven draft types including the Opinion 705–compliant engagement letter. Two-table design (drafts + immutable versions).

**Why it exists.** Drafting an amendment used to take two hours; here it's fifteen minutes of review. But the section-by-section review with attestation isn't UX polish — it's a legal requirement. Texas Opinion 705 makes the attorney responsible for verifying AI output, so the system enforces that they can't approve without reviewing, and it stores the attestation as the compliance record.

**Connects to the goal.** Time saved on drafting is money earned. And building the compliance workflow into the product (rather than trusting attorneys to remember it) is what makes CounselOS *safe* for a firm to adopt — the safety is a selling point, not friction.

*Your notes:*

---

## Case Management: Notes, Communications, Checklist, Tasks

**What it does.** Matter notes (timestamped journal), communication log (every call/email logged in ten seconds), document checklist (auto-populated per transaction type, auto-checked on upload), and tasks (internal work assignments distinct from contractual deadlines).

**Why it exists.** These are the unglamorous features that decide whether a firm actually *lives* in the system. The communication log is the institutional memory that survives when a paralegal leaves. The checklist answers "what are we waiting on?" without an inbox search. The free-text contact name on communications is deliberate — forcing a dropdown would add friction and kill adoption, and adoption is everything here.

**Connects to the goal.** This is the "case management first" thesis made real. The AI features are what impress in a demo; *these* are what make the attorney open CounselOS before their email every morning. A firm that depends on these can't leave.

*Your notes:*

---

## Business Operations: Time, Invoicing, Dashboard

**What it does.** Time entries logged against transactions (rate snapshotted, locked once invoiced), PDF invoices generated from those entries, and the morning dashboard that aggregates deadlines, tasks, overdue items, and stale deals into one "what needs me today" screen.

**Why it exists.** Attorneys measure their practice in billable hours, and most lose 30–40% of their time to month-end memory gaps. Capturing time at the point of work — and generating invoices from what's already logged — closes that leak. The dashboard exists because a case management tool that shows *everything* but tells you *nothing about what matters* has failed at its one job.

**Connects to the goal.** Without billing, a firm still needs a second tool, and "you still need Clio too" kills the sale. The dashboard is the answer to case management's oldest failure — it's a to-do list, not a filing cabinet.

*Your notes:*

---

## Leads & Conflict Check

**What it does.** Public intake form (rate-limited, duplicate-prevented), a conflict check that matches incoming party names against existing matters, and lead-to-transaction conversion that's blocked until a flagged conflict is cleared.

**Why it exists.** Conflict checking is a legal obligation, not a nicety — a missed conflict can disqualify the firm and trigger discipline. Running it automatically at intake, before a lead can become a matter, makes compliance the default path rather than something an attorney has to remember.

**Connects to the goal.** It makes CounselOS a *real* practice tool rather than scaffolding — a firm can't safely take on a client without a conflict check, so building it in makes the system part of how they practice law, not just how they track it.

*Your notes:*

---

## Client Portal

**What it does.** A signed-token URL gives a client read-only access to one transaction: status in plain English, next milestone, attorney contact, shared documents. No account, no password. Any failure returns 404, never revealing whether the transaction exists.

**Why it exists.** Clients call for updates and eat billable time. A read-only page they open themselves turns that reactive drain into proactive transparency. The signed-token approach avoids the entire complexity of client accounts for Phase 1 — 256-bit token, only the hash stored, 30-day expiry, revocable.

**Connects to the goal.** It changes the attorney-client relationship from reactive to proactive without adding auth surface area. Small module, real daily value, and it demos beautifully.

*Your notes:*

---

## Infrastructure: Queues, Caching, Real-Time, Notifications, Observability

**What it does.** BullMQ for async jobs (with graceful shutdown so a restart never strands a document mid-processing), Redis caching on the hot paths, SSE for all real-time (document status, chat streaming, global events), Resend for email, and Sentry for spans, cron monitoring, and alerting.

**Why it exists.** This is the plumbing attorneys never see but always feel. Graceful shutdown means a document never gets stuck in PROCESSING forever. The user-hydration cache means the auth check on every request doesn't hammer the database. SSE (no WebSocket) covers every real-time need without the complexity a single firm doesn't warrant. Cron monitoring exists because a deadline scheduler that silently stops running is a catastrophe for a legal product.

**Connects to the goal.** Reliability *is* the product for a law firm. A tool that loses a document or misses an alert isn't trusted, and an untrusted tool gets abandoned. This module is where "the OS your firm runs on" is either earned or lost.

*Your notes:*

---

## Access, Capture, Search & Honesty

**What they do.** Four late additions that share one theme: they decide whether the firm keeps using the system. **Matter-level access** scopes visibility to assigned matters instead of firm-wide, with denials that explain themselves. **Passive time capture** generates draft time entries from activity you already log, so the attorney reviews instead of enters. **Full-text search** finds a phrase across communications, notes, and documents. **Service honesty** reports every external dependency's real state — `not_configured` is a first-class status, never disguised as working or broken.

**Why they exist.** The research was blunt that adoption failure, not missing features, kills legal software. Every one of these closes a documented failure mode: permission friction that generates support tickets, the month-end memory gap that loses 30–40% of billable time, the "find the message where Maria mentioned the wire" problem that gets worse as data accumulates, and the spinner that never resolves because a service is down and nothing said so.

**How they connect to the goal.** These are the least glamorous modules in the codebase and among the most consequential. A firm doesn't abandon software because the AI is weak — it abandons software that costs more effort than it saves. Access control that explains itself, time capture that doesn't require discipline, search that actually finds things, and honest failure states are what keep the system in daily use long enough for the AI features to matter.

*Your notes:*

---

## Moat Features: Wire-Fraud Verification & TREC Deadline Engine

**What they do.** Wire-fraud verification establishes a trusted baseline for each title company's wire instructions and fires a block-and-confirm CRITICAL alert whenever a later document shows different instructions. The TREC deadline engine layers correct Texas date math on top of extraction — calendar-day counting from the effective date as "day zero," and the divergence where the earnest-money deadline rolls to the next business day but the option-fee deadline does not.

**Why they exist.** These came out of deep competitive research as the highest-impact, hardest-to-copy additions. Wire fraud is the single largest catastrophic-loss vector in real estate — $275M lost in 2025, growing yearly — and preventing one incident justifies the entire product to a firm. The deadline engine encodes rules attorneys get wrong by hand; the option-fee-doesn't-roll exception has caused real forfeitures. Neither is greenfield: wire verification rides on the document pipeline, communication log, and alert system you already built, and the deadline engine is a correctness upgrade to extraction you already do.

**How they connect to the goal.** This is where the research's sharpest line becomes real — *"speed to depth in real-estate-specific logic is the moat."* No incumbent owns this. General platforms treat real estate as a generic matter type; title platforms aren't attorney tools. Depth in wire safety and deadline correctness is what makes CounselOS something a Texas real estate firm can't safely practice without — and it's cheap to build precisely because the case-management foundation is already there to ride on. Build these after Phase 1 core ships and the pilot firm is live.

*Your notes:*

---

## The Through-Line

Read the modules top to bottom and the thesis is visible: **the boring case management modules are the foundation, and the AI modules amplify a system the firm already depends on.** That ordering is the whole strategy. If the AI carried the product alone, a competitor with better AI could take the firm. Because the firm *lives* in the transactions, the notes, the communications, and the billing, the AI becomes the reason they'd never switch — not the only reason they stay.

Build the foundation like it's the product. It is.

*Team notes:*

---
---

# Appendix — NestJS Vocabulary

> These are the words you need to explain CounselOS out loud — to a new engineer, a technical investor, or a room of students. Each term is anchored to where it actually lives in our codebase. Knowing the definition is table stakes; being able to say *"that's a Guard, it runs before the Pipe, and ours is `JwtAuthGuard`"* is the point.
>
> This appendix is vocabulary. For the **rules** — which of NestJS's several legitimate options we picked, and why — see `18-nestjs-conventions.md`.

---

## The Request Lifecycle — Know This Cold

Every request through CounselOS runs the same gauntlet, in this order. If you can recite it, you can explain any behavior in the app.

```
Request
  → Middleware            (rarely used here)
  → Guard                 JwtAuthGuard → RolesGuard        [is this user allowed?]
  → Interceptor (before)  CorrelationIdInterceptor         [tag the request]
  → Pipe                  ZodValidationPipe                [is this body valid?]
  → Controller handler    TransactionsController           [route only, no logic]
  → Service               TransactionsService              [business rules]
  → Repository            TransactionsRepository           [Drizzle queries]
  → Interceptor (after)   ResponseInterceptor              [wrap in { success, data }]
  → Response

  ↘ on any throw → Exception Filter (GlobalExceptionFilter) → { success: false, error }
```

**Say it like this:** *"Auth happens in the Guard phase, before validation. So an expired token never reaches the Zod pipe — we reject on identity before we ever look at the body."* That single sentence demonstrates you understand the framework, not just the app.

---

## Structural Terms

**Module** — The organizational unit. A class decorated with `@Module()` that declares its controllers, providers, imports, and exports. CounselOS has roughly twenty: `TransactionsModule`, `DocumentsModule`, `DeadlinesModule`, and so on. When we say "modular monolith," the module *is* the boundary — and the rule that modules import each other's **services but never repositories** is what makes each one extractable later.

**Controller** — The HTTP layer. Decorated with `@Controller('transactions')`, it maps routes to handlers and does nothing else. No business logic, no database access. If you find an `if` statement in a controller doing real work, it belongs in the service.

**Provider** — Anything NestJS can inject: services, repositories, factories, guards. Marked `@Injectable()`. Services and repositories are both providers — "provider" is the umbrella term you'll see in NestJS docs.

**Service** — Where business rules live. `TransactionsService` owns the status-transition validation. `DeadlinesService` owns the superseding logic. Services never write SQL — they call repositories. This is exactly why our services are unit-testable with a mocked repo and no database.

**Dependency Injection (DI)** — How NestJS wires providers together. You declare a dependency in the constructor and NestJS supplies it. This is what makes the mock-repository test possible: swap the real repository for a fake at the injection point and the service never knows.

```ts
constructor(private readonly repo: TransactionsRepository) {}
```

**Dynamic Module** — A module configured at import time via `forRoot()` or `forRootAsync()`. `ConfigModule.forRoot()` and `BullModule.forRootAsync()` are ours. The `Async` variant matters when configuration depends on other injected services — like reading the Redis URL out of `ConfigService`.

**Global Module** — Marked `@Global()`, its exports are available everywhere without re-importing. Our `DatabaseModule` is global because every module needs the Drizzle client. Use this sparingly; a codebase where everything is global has no boundaries.

---

## Request Pipeline Terms

**Guard** — Answers one question: *should this request proceed?* Returns true or throws. Ours: `JwtAuthGuard` (valid token?), `RolesGuard` (right role?), `ClientTokenGuard` (valid signed token for the client portal?). Guards run **before** pipes — identity is checked before input is validated.

**Interceptor** — Wraps the handler, so it can act **before and after**. `CorrelationIdInterceptor` tags the request on the way in; `ResponseInterceptor` wraps the return value in our `{ success: true, data }` envelope on the way out. That envelope consistency the frontend depends on? One interceptor produces it.

**Pipe** — Transforms and validates input before the handler sees it. Ours is a single `ZodValidationPipe` that runs the DTO's Zod schema. This is where the field limits enforce — chat max 4,000 characters, draft instructions max 2,000 — and it throws a 422 before anything touches the service.

**Exception Filter** — Catches thrown errors and shapes the response. `GlobalExceptionFilter` converts every error into `{ success: false, error: { code, message, details, requestId } }`. It's also why an unexpected error returns a bare `INTERNAL_ERROR` and never leaks a stack trace to a client.

**Middleware** — Runs before guards, closest to the raw request. We use it once, for the `Permissions-Policy` header that Helmet doesn't set. Most things people reach for middleware for belong in an interceptor.

**Custom Decorator** — A decorator you define yourself. `@CurrentUser()` pulls the hydrated user off the request. `@Roles('OWNER')` declares a role requirement the `RolesGuard` reads. `@Public()` marks a route as skipping auth — the lead intake form uses it.

**Execution Context** — The object guards and interceptors receive. It gives access to the request, the handler, and the class — that's how `RolesGuard` reads the `@Roles()` metadata off the route it's protecting.

---

## Lifecycle Hooks

**`OnModuleInit`** — Runs once when the module initializes. Good for connection warm-up.

**`OnApplicationShutdown`** — Runs on SIGTERM, and this one matters more than it sounds. It's how our BullMQ worker finishes the document it's processing before Railway kills the process. Without it, a restart mid-pipeline strands a document in `PROCESSING` forever and the attorney watches a spinner that never resolves. Requires `app.enableShutdownHooks()` in `main.ts`.

**`@Sse()`** — NestJS's decorator for Server-Sent Events. Returns an `Observable<MessageEvent>` instead of a plain value. All three of our real-time streams use it: document processing, chat tokens, and the global event feed.

---

## Our Patterns (Not NestJS Native)

These aren't framework features — they're conventions we chose. Worth knowing which is which, because a NestJS engineer will recognize the terms above and not necessarily these.

**Repository** — Our data-access layer. Not built into NestJS (that's a TypeORM/Spring convention). We use it so services never touch Drizzle directly, which is what makes services testable without a database. It's a provider like any other.

**DTO (Data Transfer Object)** — The shape of a request body. Ours are Zod schemas with the TypeScript type inferred from them, so validation and typing come from one definition rather than two that can drift.

**Barrel export** — An `index.ts` that re-exports a folder's public surface. Keeps imports clean and makes the module's intended API explicit.

---

## The One-Sentence Version

If someone asks how the backend is organized, this is the answer:

> *"It's a NestJS modular monolith. Each module owns one domain — controller for HTTP, service for business rules, repository for data. Modules talk to each other's services, never their repositories, so any module can be extracted into its own service later without a rewrite. Cross-cutting concerns are handled by guards, interceptors, pipes, and a global exception filter, so auth, correlation IDs, validation, and the response envelope are consistent everywhere by construction rather than by discipline."*

Learn to say that without notes.
