# CounselOS — Master Project Prompt
### Version 4 — Phase 1: Single Real Estate Firm | Phase 2: Multi-Tenant SaaS

---

## Current Build Context

**Phase 1 (NOW):** Building a bespoke AI-native transaction management platform for one real estate law firm in Austin, Texas. The goal is to close this client, collect revenue, and get a real testimonial. Speed to demo and speed to value matter more right now than SaaS infrastructure.

**Phase 2 (LATER):** Expand into a multi-tenant SaaS platform serving multiple firms across all practice areas. Everything built in Phase 1 is architected to support this expansion without a rewrite. Multi-tenancy, plan enforcement, and onboarding flows are deliberately deferred — not abandoned.

Every Phase 2 item in this document is marked `[PHASE 2]` so the team knows it is coming but is not being built right now.

---

## Who I Am

I am building **CounselOS** — an AI-native legal operating system. Not AI bolted onto legacy software. Intelligence is the foundation everything is built on.

**Tagline:** *"The OS your firm runs on."*

**Three goals simultaneously:**
1. Close one real estate law firm in Austin as a paying client
2. Productize into a multi-tenant SaaS after proof of value is established
3. Portfolio project demonstrating senior-level full-stack engineering

---

## Phase 1 — What We Are Building Right Now

A focused AI-native transaction management platform for one real estate law firm in Austin, Texas. Not a generic legal OS. A tool built around exactly how a real estate attorney works day to day.

### What Real Estate Attorneys Actually Do Daily
- Draft and review purchase agreements, lease agreements, and title commitments
- Track closing dates, option period expirations, and contingency deadlines across multiple active transactions
- Manage communications between buyers, sellers, lenders, title companies, and agents
- Review survey reports, inspection reports, and title commitments for issues
- Draft amendments, addendums, and closing documents
- Chase signatures and coordinate closings

### Phase 1 Core Features

- **Transaction Dashboard** — Pipeline view of all active transactions. Status columns: Under Contract, Due Diligence, Title Review, Closing Prep, Closed, Fallen Through. Property address, parties, next deadline, and days to closing at a glance.
- **Transaction Intelligence Chat** — Ask anything about a transaction in plain English. "What are the contingency deadlines in the Martinez contract?" Citations to the exact document and page. Built on pgvector RAG.
- **Document Pipeline** — Upload any real estate document. System converts, chunks, embeds, and makes it queryable in seconds. Types: PURCHASE_AGREEMENT, LEASE, TITLE_COMMITMENT, SURVEY, INSPECTION_REPORT, CLOSING_DISCLOSURE, DEED, AMENDMENT, ADDENDUM, CORRESPONDENCE, OTHER.
- **Deadline Intelligence** *(most important feature for real estate)* — Reads uploaded contracts, extracts all deadlines automatically, stages for attorney review, fires tiered alerts. Miss the option period and the buyer loses their earnest money. This prevents that.
- **Document Draft Generation** — First drafts of amendments, earnest money demand letters, extension addendums, and lease modifications from transaction context. Attorney reviews and edits — nothing goes out automatically.
- **Simple Lead Intake** — Form that captures new transaction inquiries, notifies the attorney, and creates a transaction record.
- **Client Status Page** *(read-only)* — One clean page per transaction. Client sees: current status, next milestone, key dates, documents available to download. No secure messaging for Phase 1.
- **Email Notifications** — Deadline alerts to attorneys, transaction status updates to clients, new inquiry notifications via Resend.

### Moat Features `[build after Phase 1 core, before multi-tenant]`

Surfaced by deep competitive research as the highest-impact, hardest-to-copy additions. Both ride on infrastructure Phase 1 already builds. Full spec in `12-moat-features.md`.

- **Wire-Fraud Verification** — Establishes a trusted baseline for each title company's wire instructions; any later change triggers a block-and-confirm CRITICAL alert with an immutable audit trail. Addresses the single largest catastrophic-loss vector in real estate ($275.1M lost in 2025, FBI IC3). Rides on the document pipeline, communication log, and alert system.
- **TREC Business-Day Deadline Engine** — Correct Texas date math layered on top of extraction: calendar-day counting, effective-date-as-day-zero, and the critical divergence where the earnest-money deadline rolls to the next business day but the option-fee deadline does not. Turns extraction into a genuine safety net attorneys can trust.

### Phase 1 — What We Are NOT Building Yet

These are real features on the roadmap. Deferred because they do not serve the goal of closing one client in 6–8 weeks.

- `[PHASE 2]` Multi-Tenancy & RLS enforcement — one firm, one tenant right now
- `[PHASE 2]` Litigation Arbitrage Engine — PI-specific, not relevant for real estate
- `[PHASE 2]` Case DNA Layer — expanding to full transaction risk scoring in Phase 2
- `[PHASE 2]` Judge & Counsel Fingerprints — data-hungry, needs thousands of cases
- `[PHASE 2]` Firm Playbooks — great feature, one firm means we just talk to the attorney
- `[PHASE 2]` Full Client Portal with secure messaging — Phase 1 gives read-only status page
- `[PHASE 2]` Billing Capture & Time Tracking — close the client first
- `[PHASE 2]` Self-Serve Onboarding & Stripe Subscriptions — manual onboarding for Phase 1
- `[PHASE 2]` Mass Document Analysis (Tabular Review) — after core pipeline is solid
- `[PHASE 2]` Intake AI Agent — simple form for Phase 1, AI agent for Phase 2
- `[PHASE 2]` Plan Enforcement — no tiers in Phase 1, fixed monthly retainer

---

## The Secret Sauce — What Cannot Be Copied by Prompting

### Layer 1 — Transaction DNA `[PHASE 1 foundation / PHASE 2 full build]`
Every transaction is converted into a structured normalized data object before the LLM sees it. Phase 1 captures: property address, transaction type, parties, key dates, contractual deadlines extracted from uploaded documents. Phase 2 expands to full scoring: deal risk score, title issue flags, financing contingency risk, comparable transaction outcomes.

### Layer 2 — Outcome Feedback Loop `[PHASE 2]`
When transactions close, outcomes feed back as intelligence. For real estate: days to close vs. projected, deal fall-through rate by type, common title issues by Austin neighborhood. For PI when we expand: settlement delta and prediction accuracy improvement. Not built in Phase 1 — not enough closed transactions yet.

### Layer 3 — Settlement Intelligence Database `[PHASE 2 — PI expansion]`
Closed PI case outcomes compounding into a proprietary prediction dataset. Every closed case is a data asset. Data flywheel: more firms → smarter predictions → more firms. Deferred until PI firms are on the platform.

### Layer 4 — Judge & Counsel Behavioral Fingerprints `[PHASE 2 — PI expansion]`
Per-judge and per-opposing-counsel behavioral models trained on outcome data. Irreplaceable after 12–18 months of data. Not relevant for real estate Phase 1.

### Layer 5 — Firm Playbooks as Institutional Memory `[PHASE 2]`
Saved workflows that compound into firm-specific intelligence. Real estate equivalent: standard transaction checklists per transaction type. Phase 2 when onboarding multiple firms.

---

## What We Adapted from Mike OSS

Mike OSS (github.com/willchen96/mike) is an open-source AI legal document assistant built by a former Latham & Watkins attorney. 3.7k stars. Stack: Next.js + Express + Supabase + Cloudflare R2. AGPL-3.0 licensed.

We do not fork Mike OSS. We read the architecture and rebuilt the relevant concepts cleanly in our own proprietary codebase.

| Mike OSS Concept | CounselOS Implementation | What Changed |
|---|---|---|
| Projects | Cases | Full case entity — parties, status, dates, DNA, arbitrage |
| Document upload + storage | Case document ingestion | Documents attach to cases, auto-extracted into DNA |
| Chat with documents | Case Intelligence Chat | Queries all case data, not just one document |
| Tabular review | Mass Document Analysis | PI-specific extraction, structured output, feeds DNA |
| Tracked changes engine | AI Draft Review | Attorney accepts/rejects AI suggestions line by line |
| Shared prompt presets | Firm Playbooks | Practice area specific, grows into institutional memory |
| Multi-model support | CounselOS-managed models | We own the keys, firms pay subscription |
| CourtListener integration | CourtListener + Judge Fingerprints | Extended into behavioral profiles per judge |

**What Mike OSS has zero concept of that we build entirely:**
Intake Agent, Deadline Intelligence, Client Portal, Billing Capture, Case DNA Layer, Litigation Arbitrage Engine, Settlement Database, Outcome Feedback Loop, Firm Playbooks.

---

## Target Market

**Phase 1 (NOW):** One real estate law firm in Austin, Texas. Named client. Bespoke delivery. Fixed monthly retainer.

**[PHASE 2] SaaS expansion:** Small law firms, 2–10 attorneys, across all practice areas.
- Real Estate Law — expand from Phase 1 proof of value
- Personal Injury — highest arbitrage engine value, primary SaaS growth target
- Family Law
- Immigration

**Geography:** Austin, Texas for Phase 1. National for Phase 2.

---

## Tech Stack

### Backend — NestJS (TypeScript)
Modular monolith. One codebase, clean module boundaries. Repository pattern between services and Drizzle — no module imports the database client directly. All routes prefixed `/v1/` from day one.

**Phase 1 active modules:**
- `TransactionsModule` — transaction CRUD, status transitions, party management
- `DocumentsModule` — ingestion pipeline, Supabase Storage, LibreOffice conversion, chunking, embeddings
- `ChatModule` — transaction-scoped RAG, document Q&A, citation tracking, token budget enforcement
- `DeadlineModule` — contract deadline extraction, amendment superseding, tiered alert system
- `DraftsModule` — async AI draft generation via BullMQ, version history, section schemas
- `IntakeModule` — simple lead form, two-layer duplicate prevention, attorney notification
- `NotificationsModule` — Resend email via centralized NotificationService, React Email templates
- `ClientStatusModule` — read-only client-facing transaction status page, magic link invite flow
- `RealtimeModule` — SSE streams only (snapshot-on-reconnect). No WebSocket, no Socket.io.

**`[PHASE 2]` modules — designed, not built yet:**
- `CaseDNAModule`, `ArbitrageModule`, `BillingModule`, `PlaybooksModule`, `FingerprintsModule`, `OnboardingModule`

### Database — Drizzle ORM + Supabase (PostgreSQL + pgvector)
- **Drizzle** chosen over Prisma specifically for pgvector. Every vector similarity search is a typed Drizzle SQL expression. Schema defined in `src/database/schema.ts` — TypeScript file, single source of truth.
- pgvector with HNSW index — `vector_cosine_ops`, m=16, ef_construction=64. Pre-filtered by `transaction_id` and `firm_id` before vector scan.
- `firm_id` present on every table — Phase 2 RLS slots in without schema changes.
- RLS policies written but not enforced in Phase 1 — one firm, one tenant.
- Supabase Auth for attorney (email/password) and client (magic link) authentication.

### Observability — Sentry
- Error tracking with structured fingerprinting by error code + route pattern
- Performance monitoring with custom spans on every LLM call, vector search, and document processing stage
- Cron monitoring for the deadline alert scheduler — alerts immediately if scheduler misses its window
- Structured JSON logs via Pino — every log line includes `correlationId`, `userId`, `firmId`, `module`, `action`, `durationMs`
- Alerting thresholds: critical (error rate > 5%, health check down, dead letter queue > 10 jobs) and warning (error rate > 2%, p95 > 2s, queue depth > 50)

### Storage — Supabase Storage
Case documents, processed PDFs, generated drafts. Private bucket — no public access. Signed URLs with 15-minute expiry via `supabase.storage.from('documents').createSignedUrl(key, 900)`. All file operations server-side only — no direct browser uploads. Integrated with existing Supabase client — no additional vendor or credentials.

### AI — Vercel AI SDK + Anthropic Claude
- **Vercel AI SDK** (`ai` core package, server-side) — handles streaming, structured output, tool calling abstraction. Provider-agnostic: if we ever swap a model for a specific task, one line changes.
- **Anthropic Claude** — primary model. `streamText` for chat, `generateObject` for structured DNA extraction, `generateText` for one-shot drafts.
- **Voyage AI `voyage-law-2`** — embeddings only. Legal-domain-specific model, outperforms OpenAI general embeddings on case document retrieval. Generous free tier. Replaces OpenAI text-embedding-3-small entirely.
- CounselOS owns all API keys. Firms pay subscription, never touch models or manage keys.
- Model selected per task: fastest model for extraction jobs, most capable for prediction reasoning.

### Frontend — Next.js (TypeScript)
- App router
- Two surfaces: Attorney dashboard + Client portal
- SWR for data fetching — `revalidateOnFocus: false` globally
- Zustand for client state — active case context, WebSocket connection state, notification queue
- Native EventSource (SSE) for all real-time. No Socket.io client.
- Native EventSource for SSE streams (chat tokens, document processing, analysis progress)
- Design System v5 — bone paper (#F0EEE9) light / (#0B0C0E) dark, cool ink, sage for completed, AI teal (#0A5C69), Newsreader headings. See `07-design-handoff.md`.

### Real-Time — SSE + WebSocket (Split by Direction)
- **SSE** for all server-to-client one-way streams: chat token stream, document processing status, analysis job progress, global firm event feed
- **SSE only** — three streams: global firm events, document processing, chat token streaming. Snapshot on reconnect, not event replay.
- Never poll. Real-time data is always pushed.

### Queue — BullMQ + Redis (Upstash)
- Document processing queue — concurrency 5, retry 3x exponential backoff
- Deadline alert scheduler — runs every hour
- Email notification queue — async Resend delivery
- Dead letter queue — failed jobs never silently dropped
- `[PHASE 2]` DNA extraction queue, arbitrage recalculation queue, fingerprint update queue

### Caching — Redis (Upstash)
- Chat history for RAG context: 2-hour TTL
- Embedding vectors by content hash: 7-day TTL
- Transaction summary for client status page: 5-minute TTL
- `[PHASE 2]` Judge/carrier/counsel fingerprints: 24-hour TTL
- `[PHASE 2]` Billing dashboard aggregates: 10-minute TTL
- Eviction: allkeys-lru

### External Integrations — Phase 1
- Voyage AI — `voyage-law-2` legal-domain embeddings
- LibreOffice — DOC/DOCX to PDF conversion (installed on Railway server)
- Resend — deadline alerts, client status updates, intake confirmations (React Email templates)
- .ics calendar download — attorney imports confirmed deadlines to any calendar

### `[PHASE 2]` External Integrations
- Stripe — subscription billing, client invoice payments, arbitrage outcome billing
- CourtListener — case law and judge history for PI expansion
- Travis County Appraisal District API — property records for real estate expansion
- Twilio — SMS alerts for critical deadlines

### Deployment
- Backend: Railway (NestJS + BullMQ workers)
- Frontend: Vercel
- Database + Storage: Supabase (managed PostgreSQL + object storage)
- Cache/Queue: Upstash Redis

---

## Pricing

**Phase 1:** Fixed monthly retainer negotiated directly with the client. No SaaS tiers, no plan enforcement, no Stripe subscription. One invoice, one client.

**`[PHASE 2]` SaaS Pricing:**

| Plan | Price | For |
|---|---|---|
| Starter | $299/month | Up to 3 attorneys, 50 active transactions |
| Growth | $699/month | Up to 10 attorneys, unlimited transactions, full feature set |
| Partner | $1,499/month | Unlimited attorneys, custom integrations, dedicated onboarding |

Litigation Arbitrage Engine (PI only) on Growth and Partner. Billed as % of settlement delta.

---

## Competitive Landscape

| Platform | What They Are | Their Weakness |
|---|---|---|
| Clio | Market leader, 150K+ firms | Legacy architecture, AI bolted on |
| MyCase | Mid-market, cleaner UI | No intelligence layer |
| Filevine | Enterprise, PI focus | Complex, expensive, not AI-native |
| Harvey | AI research for BigLaw | Not case management, not small firms |
| Mike OSS | Open source document assistant | Document tool only, no case management, no prediction |
| **CounselOS** | **AI-native OS for independent firms** | **This is the gap** |

---

## Build Order

### Phase 1 — Ship in 6–8 Weeks

**Week 1–2: Foundation + Transactions + Document Pipeline**
Project scaffold, auth, transaction entity, document upload and processing pipeline, embeddings into pgvector. Get documents into the system and queryable. Everything else depends on this.

**Week 3–4: Transaction Intelligence Chat + Deadline Intelligence**
RAG pipeline over transaction documents with citations. Deadline extraction from contracts, attorney review flow, tiered alert scheduler. These two features close the demo.

**Week 5–6: Draft Generation + Email Notifications + Client Status Page**
AI-assisted document drafts for real estate documents. Resend email alerts for deadlines and client updates. Read-only client status page. Makes the platform feel complete.

**Week 7–8: Polish, test data, demo prep**
Load real Austin real estate transaction fixtures. Demo flow rehearsed. Edge cases handled.

### `[PHASE 2]` — After First Client is Signed and Paying

Multi-tenancy + RLS enforcement, self-serve onboarding, Stripe subscriptions, plan enforcement, full client portal, billing capture, firm playbooks, intake AI agent, mass document analysis, Case DNA layer, Litigation Arbitrage Engine (PI expansion), judge/carrier fingerprints, settlement database.

---

## Brand Voice

**Three words:** Sharp. Calm. Confident.

| ❌ Don't | ✅ Do |
|---|---|
| "CounselOS is an AI-powered legal case management platform." | "The OS your firm runs on." |
| "You don't have any cases yet! Get started." | "No active cases. Add your first one and CounselOS starts working immediately." |
| "Warning: You have a deadline approaching." | "Response due in 3 days — Morrison v. Anderson. Review case." |
| "Please wait while our AI analyzes your document." | "Reading your document. Ready in seconds." |

---

## The Brand Story

*"CounselOS is the operating system for modern law firms. Not another tool attorneys have to manage — the foundation their entire practice runs on. Intake, case intelligence, document understanding, deadline protection, and client communication — all connected, all intelligent, all built around AI from the ground up. While other legal software bolts AI onto systems built in 2010, CounselOS was designed from day one for the way law is actually practiced today."*

---

*CounselOS — The OS your firm runs on.*

## Deliberately Left for Phase 2 (Not Phase 1)

- Google Calendar OAuth sync (Phase 1 has .ics download)
- Microsoft Calendar (Phase 2)
- Socket.io / WebSocket (SSE covers all Phase 1 real-time needs)
- Email jobs tracking table (Resend dashboard + Sentry is sufficient)
- Contact book (useful after firm has data to reference)
- Transaction templates (build after firm uses system for one month)
- Basic reporting (one firm's managing partner can count their own deals)
- Full client portal with accounts (signed token is sufficient)
- Billing module with Stripe (Phase 2 revenue feature)
- Full conflict of interest database (name matching covers Phase 1)
- Trust accounting / IOLTA (never — use dedicated software)
