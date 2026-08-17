# CounselOS — Data Contracts & Relationships
### Version 1 — PostgreSQL + pgvector, No Pinecone

---

## Philosophy

Every data decision in CounselOS is made against one rule: **does this field earn its place?** Legal software historically bloats its schema with fields nobody uses. We do not do that. Every field maps to a feature. Every relationship maps to a query we actually run. If a field has no feature that writes it or reads it, it does not exist.

The second rule: **firm_id is on every table.** Phase 1 it is hardcoded from env config. Phase 2 it is enforced by RLS at the database level. Either way it is present from day one so the schema never changes when we add multi-tenancy.

The third rule: **schema first, code second.** `apps/api/src/database/schema.ts` is reviewed and agreed before any module is written. A change to the schema is more impactful than most code changes and goes through the same review process.

---

## Schema Principles

Applied before writing any table. Non-negotiable. The ORM is **Drizzle**; `schema.ts` is the single source of truth for data shape, and entity types are inferred from it (`typeof transactions.$inferSelect`), never hand-written.

**UUIDs everywhere** — `uuid('id').primaryKey().defaultRandom()`. Never auto-increment integers. UUIDs are safe to expose in URLs, do not leak record counts, and are globally unique across tables.

**Timestamps on every table** — `created_at` on all 27, `updated_at` wherever rows are mutable. Append-only tables (activity, access log, chat messages, draft versions) deliberately have no `updated_at`: a fact is not editable.

**Every timestamp is `timestamptz`** — one exception, `holidays.date`, which is a Postgres `date`. A `timestamp` stores no zone, so a value written by the worker (UTC) and one written from a browser (Central) are different instants that look identical. A holiday is the opposite case: a calendar date, not an instant.

**Soft delete on legal entities** — `deleted_at` on the 13 tables that carry it. Never hard delete. Drizzle has **no middleware**, so the filter is not automatic: repositories extend a base whose list methods apply the `notDeleted` helper, and a hand-written `where` on a list query is a review item.

**Uniqueness must be partial** — because rows are soft-deleted, a plain `UNIQUE` would burn `RE-2025-0042` forever once deleted. Uniqueness is scoped `WHERE deleted_at IS NULL` in a hand-written migration.

**Enums are Postgres enums, sourced from `packages/shared`** — `pgEnum('user_role', USER_ROLES)`. The value array lives in shared and both apps import it, so the Postgres type, the API's validation, and the frontend's dropdown are the same list by construction.

**Explicit cascade rules** — every `.references()` documents its `onDelete`. Delete transaction → cascade documents, deadlines, chat sessions, drafts, parties, activity. Delete document → cascade chunks. `access_log` deliberately does **not** cascade: an audit trail that deletes itself along with its subject is not an audit trail. Users are never deleted, only deactivated.

**JSONB only for stored blobs** — if you filter or sort by a field, it is a proper column. If it is just stored and returned, it can be JSONB. Firm settings: JSONB. Activity log metadata: JSONB. Transaction status: column. Deadline urgency: column.

**Never store computed values unless performance demands it** — `urgency` on Deadline is an exception because the scheduler updates it hourly. Everything else computed on read.

**Index what you query** — `firm_id` (every table but three), `status` (transactions, deadlines), `closing_date` (transactions), `assigned_attorney_id` (transactions), `transaction_id` (documents, deadlines, chunks, activities), `auth_id` (users — every JWT lookup hits this).

**Migrations are immutable** — once run, never edit. Corrections go in a new migration. `drizzle-kit` generates and names them sequentially (`0001_narrow_millenium_guard.sql`); the HNSW index, partial-unique indexes, and tsvector generated columns are hand-written, created with `drizzle-kit generate --custom` so they register in `meta/_journal.json`. A `.sql` file dropped into the folder by hand is silently skipped.

---

## API Response Contract

Every single endpoint returns the same shape. No exceptions.

**Success**
```
{
  success: true,
  data: <resource or array>,
  meta: { page, limit, total, hasMore }  // paginated lists only
}
```

**Error**
```
{
  success: false,
  error: {
    code: "TRANSACTION_NOT_FOUND",   // typed constant, frontend switches on this
    message: "Transaction not found", // human-readable, can change freely
    details: {},                      // field-level Zod errors on validation failures
    requestId: "req_01HXYZ..."        // correlation ID for log lookup
  }
}
```

The frontend never parses `message`. It always switches on `code`. Error codes are typed constants in `packages/shared/src/errors/error-codes.ts`, imported by both apps so they cannot drift. Changing the message never breaks the frontend. Changing a code is a breaking change and requires frontend coordination.

---

## Error Handling System

**Three categories of errors:**

**Expected business errors** — transaction not found, invalid status transition, file too large. Service layer throws an `AppException` subclass (`NotFoundException`, `ForbiddenException`, `UnprocessableException`, `ConflictException`). Global exception filter catches and formats. Logged at INFO level — expected behavior.

**Validation errors** — Zod schema rejection on request body. Zod validation pipe catches before controller runs. Returns 422 with field-level details. Never reaches service layer. Logged at DEBUG level.

**Unexpected errors** — DB connection lost, storage unavailable, uncaught exception. Global filter catches anything that is not an `AppException` or `ZodError`. Returns 500 with `INTERNAL_ERROR` code and zero internal details leaked to client. Full error + stack trace sent to Sentry with correlation ID. Logged at ERROR level.

**What never happens:**
- Raw `HttpException` thrown from service code
- Error messages containing stack traces, SQL queries, or internal field names
- Swallowed errors — catch blocks either handle or re-throw
- Empty catch blocks anywhere in the codebase (ESLint rule enforces)
- Two different error shapes from any endpoint

---

## Entities, Fields, and Why Each Exists

---

### Firm

The root of everything. Phase 1: one firm, hardcoded. Phase 2: every query filters by firm_id.

**Fields that earn their place:**
- `timezone` — `America/Chicago` for Austin. Every deadline alert and scheduled job uses this. A 9am alert means 9am in the firm's timezone, not UTC.
- `settings` — JSONB. Firm-level toggles: intake enabled, client portal enabled, email alerts enabled. One column, one query, no joins for feature flags.
- `slug` — URL-safe identifier for client portal URLs in Phase 2.
- `[PHASE 2]` `plan`, `stripe_customer_id`, `stripe_subscription_id`, `plan_expires_at` — not needed Phase 1, one client on a fixed retainer.

**Fields we do NOT have:**
No `address`, no `website`, no `founded_year`. None drive any feature.

---

### User

One record per firm member — attorneys, paralegals, owners. Role determines what they can see and do.

**Clients are NOT users in Phase 1.** No client accounts, no passwords, no Supabase Auth record. A client gets a signed HMAC URL granting read-only access to one transaction for 30 days (`client_access_tokens`, which stores only the SHA-256 of the token). The `CLIENT` role exists in the enum for Phase 2 but nothing issues it today. Two consequences worth stating plainly: there is no `transactions.client_user_id`, and any client-portal access failure returns **404**, never 401/403 — revealing that a transaction exists is itself a disclosure.

**Fields that earn their place:**
- `role` — the most important field on this table. Everything downstream branches on this. OWNER and ATTORNEY can do anything within the firm. PARALEGAL cannot approve drafts or log outcomes.
- `barNumber` — attorneys only. Required for conflict screening — if two firms share an attorney who switches firms, this is how we detect it.
- `isActive` — soft-deactivate users without deleting them. A deactivated attorney's cases remain. Their data remains. Their access is revoked. There is no `deleted_at` on this table for exactly this reason: every historical FK pointing at a user must still resolve.
- `notificationOptedOut` — CAN-SPAM. Every notification send checks it before queuing; the unsubscribe endpoint sets it from a signed token.
- `lastSeenAt` — updated on each authenticated request. Used by the passive time-capture engine — we only suggest entries for attorneys who were recently active.
- `aiPolicyAcknowledgedAt` — set when the attorney first acknowledges the firm's AI use policy. Part of the Opinion 705 record.

**Fields we do NOT have:**
No `address`, no `bio`, no `linkedinUrl`, no `specialties` array. No `billingRate` — the firm default lives in `firms.settings`, and the rate that matters is the one **snapshotted onto the time entry** at creation, so historical billing never moves when a rate changes.

---

### Transaction

The central entity. Everything in the system exists in the context of a transaction. Replaces the generic "Case" concept for Phase 1 real estate. In Phase 2, this becomes a Case entity with a `practice_area` field that activates additional fields per area.

**Why Transaction has both `assigned_attorney_id` AND `client_user_id`:** Two different relationships. The attorney manages the transaction internally. The client views it through the read-only status page. A transaction always has an attorney. It only has a `client_user_id` if the client has been invited to the portal — many transactions never have a client with portal access.

**Fields that earn their place:**
- `transaction_number` — firm-generated, human-readable. `RE-2025-0042`. Attorneys reference this in emails, phone calls, and correspondence with title companies. A UUID is not usable in a phone call.
- `effective_date` — the anchor date. All contractual deadline calculations originate here. Option period expiry = effective_date + N days. Financing contingency = effective_date + N days. Without this field, deadlines cannot be auto-computed from contract terms.
- `earnest_money_amount` — attorneys reference this constantly. If a deal falls through and earnest money is in dispute, this is the first field the attorney needs. It belongs on the root entity, not buried in a document.
- `purchase_price` — drives the dashboard display, future billing calculations, and client status page. Not metadata — actively used.
- `internal_notes` — freeform attorney thoughts. Separate from the activity log. Activity log is structured, immutable events. Notes are the attorney's working scratchpad. Clients never see this field.
- `is_archived` — closed and fallen-through transactions must not pollute the active dashboard. Archived records stay queryable for history. Soft delete handles true removal.
- `tags` — string array. Attorneys categorize with `['cash_purchase', 'estate_sale', 'new_construction']`. No separate tags table — array column is sufficient for Phase 1 filtering.
- `superseding fields on Deadline` — `superseded_by_id` and `supersedes_id` on the Deadline entity (not on Transaction) preserve the full history of deadline changes from amendments. Old deadlines are never deleted — they are linked to their replacements.

**Fields we do NOT have:**
No `priority` field — urgency derives from deadline dates, not manual assignment. No `estimated_hours` — track actual time in Phase 2. No `court_case_number` — not applicable for real estate.

---

### Party

Everyone involved in a transaction. One table, role-based fields. A separate table — never a column on the transaction.

**Why one table instead of separate Buyer, Seller, Lender tables:** A transaction has 8–10 parties across multiple roles. Storing them as a column is impossible. Separate tables per role create JOIN complexity and schema rigidity when a party changes roles or when you need to query across role types. One Party table with a `role` enum handles every real estate scenario cleanly and enables queries like "all transactions where Independence Title is the title company."

**Phase 1 roles:** BUYER, SELLER, BUYERS_AGENT, SELLERS_AGENT, TITLE_COMPANY, LENDER, INSPECTOR, SURVEYOR, OPPOSING_COUNSEL, HOA, OTHER.

**`[PHASE 2]` PI roles added:** PLAINTIFF, DEFENDANT, INSURANCE_CARRIER, ADJUSTER, JUDGE, EXPERT_WITNESS, TREATING_PROVIDER, CO_COUNSEL. The table schema does not change — only the role enum expands.

**Fields that earn their place:**
- `role` — determines how the party is displayed and which `notes` context is relevant. A LENDER party's notes field holds the loan number and rate. A TITLE_COMPANY party's notes holds the file number and closer's name. A BUYERS_AGENT's notes holds their brokerage and TREC license number.
- `company_name` — separate from `name`. A party can be a person (James Okafor, buyer's agent) at a company (Realty Austin). Both fields needed. `name` is the contact. `company_name` is the organization.
- `license_number` — TREC license for real estate agents. Bar number for attorneys. These are referenced in correspondence and compliance contexts.
- `notes` — role-specific context that does not fit structured fields. Different meaning per role. Lender: loan number, interest rate, loan type. Title company: file number, closer contact. HOA: management company phone, board meeting dates. Free text within a role context.

**Fields we do NOT have:**
No separate address fields per party — one `address` string is sufficient. Parties are not mailed to by the platform. No `relationship` field — role enum covers the relationship. No `is_primary` flag — the role itself implies primacy.

---

### Document

Files uploaded to a transaction. The input to the entire intelligence pipeline. Every other intelligent feature — chat, deadlines, drafts — depends on documents being processed correctly.

**Fields that earn their place:**
- `type` — the document classifier sets this if not provided by the uploader. It drives downstream routing. A PURCHASE_AGREEMENT triggers deadline extraction. An AMENDMENT triggers the superseding deadline check. A TITLE_COMMITMENT flags attorney review needed. Without type, the pipeline cannot route correctly.
- `storage_key` — the Supabase Storage object key, not a URL. Signed URLs generated on demand with 15-minute expiry. Storing a permanent URL to a legal document is a security vulnerability — anyone with the URL can access it indefinitely.
- `processing_status` — the pipeline is async. Upload returns immediately with a document ID. The attorney's browser listens on SSE for status transitions: PENDING → PROCESSING → EXTRACTING → EMBEDDING → READY. Without this field there is no way to show accurate progress.
- `processing_error` — when a document fails, the attorney needs to know why. "No extractable text found — document may be a scanned image" is actionable. A silent failure with no message is not.
- `is_client_visible` — explicit flag, default false. Documents are internal by default. The attorney makes a deliberate decision to share a document with the client. A title commitment might be shared. Internal notes correspondence never is. Never automatic.
- `page_count` — populated after extraction. Every citation includes a page number. Without page count we cannot validate that a citation references a page that actually exists in the document.

**Fields we do NOT have:**
No `description` field — documents are identified by filename, typed by classifier, and fully searchable by content through chat. A separate description adds no value. No `version` on Document — versioning is at the draft level, not the source document level. Source documents are immutable once uploaded.

---

### DocumentChunk

The output of the document processing pipeline. One row per chunk of text extracted from a document, with its vector embedding. This table is what makes the Transaction Intelligence Chat work.

**Why its own table and not a JSONB array on Document:** pgvector HNSW search requires each embedding to be an individual indexed row. You cannot run a similarity search against embeddings stored in a JSON array. They must be separate rows with a proper vector column and HNSW index.

**Why `transaction_id` and `firm_id` are denormalized here even though they are derivable from `document_id`:** pgvector searches always pre-filter before running the vector scan. `WHERE transaction_id = :id AND firm_id = :id` reduces the search space from every chunk in the database to only the chunks for the current transaction. This is what keeps vector search fast. Without these pre-filters, vector search scans every chunk for every firm — completely unacceptable. The denormalization is intentional and documented.

**Fields that earn their place:**
- `embedding` — vector(1024). Voyage AI `voyage-law-2` output. The HNSW index sits on this column. 1024 dimensions because that is the voyage-law-2 output size — do not change this without re-embedding all chunks.
- `chunk_index` and `page_number` — required for citations. When RAG retrieves this chunk, the citation tells the attorney exactly which document and page it came from. Without these fields, citations are impossible.
- `content` — the raw chunk text. Returned in the RAG result alongside the vector so the LLM prompt can be assembled without a second query.
- `token_count` — the RAG context assembler uses this to respect the 6,000 token budget. Chunks are added in relevance order until the budget is reached. Without this field, context assembly requires a tokenization step at query time on every chunk — slower and error-prone.

**Chunk parameters — locked, not engineer choice:**
- `chunk_size`: 512 tokens
- `chunk_overlap`: 50 tokens
- `splitter`: paragraph-aware — prefer splitting at paragraph boundaries, fall back to token count
These are documented here because different numbers across engineers or environments break RAG quality in ways that are hard to diagnose.

---

### Deadline

Every date that matters on a transaction. Both auto-extracted from documents and manually entered by attorneys.

**The staging model — why deadlines start as PENDING_REVIEW:**
The extraction LLM reads uploaded contracts and pulls dates. It is accurate but not perfect. A missed deadline in real estate kills a deal or costs a client their earnest money. So extracted deadlines never become active automatically. They are staged for attorney review. Only ACTIVE deadlines fire alerts. The attorney confirms or dismisses each one. This puts the attorney in control while eliminating the manual work of reading every contract line by line.

**Fields that earn their place:**
- `auto_extracted` — boolean. TRUE means the AI extracted this from a document. FALSE means the attorney typed it in manually. This single field drives significantly different UI behavior: auto-extracted deadlines show a "Source: Purchase Agreement, Page 3" link. Manually added deadlines show "Added manually by James Okafor." Never set TRUE on a deadline the attorney created without a source document.
- `source_document_id` — the document this deadline came from. NULL for manually added deadlines. Attorneys click through to see exactly which page triggered the deadline. Trust through transparency — the attorney can verify every AI-extracted deadline in 10 seconds.
- `superseded_by_id` and `supersedes_id` — the amendment chain. When Amendment 2 changes the closing date from July 2 to August 1, the July 2 deadline is not deleted or dismissed — it is linked to the August 1 deadline via `superseded_by_id`. The August 1 deadline points back via `supersedes_id`. Full history preserved. Attorney can see the entire amendment chain. Dashboard only shows non-superseded deadlines.
- `alerts_sent_at` — array of timestamps. One entry per alert sent. The scheduler checks this before sending to prevent duplicates — if a WARNING tier alert was sent yesterday, do not send another WARNING today. The array grows as alerts are sent at different urgency tiers.
- `urgency` — computed hourly by the scheduler. Stored so the dashboard can sort and color without recomputing on every page load. Busted on each scheduler run. INFO (14+ days), WARNING (7-13 days), URGENT (3-6 days), CRITICAL (0-2 days).
- `calendar_event_id` — external Google or Outlook event ID. Stored so we can update or delete the calendar event if the deadline changes. Without this we create duplicate calendar events on every sync.

**Fields we do NOT have:**
No `reminder_count` — the `alerts_sent_at` array serves this purpose with full history. No `priority` manually assigned — urgency is computed from due date. No `notes` field — `description` on the deadline entity covers context. Attorneys add case-level notes to `internal_notes` on the transaction.

---

### ChatSession and ChatMessage

The conversational layer over transaction documents.

**Why sessions are a separate entity from messages:** Attorneys return to previous conversations. "What did I ask about the earnest money dispute last Tuesday?" is a real use case. Sessions give conversations a title, a timestamp, and a persistent home. Multiple sessions per transaction. Sessions are never deleted — they are part of the transaction's history.

**Fields that earn their place on ChatMessage:**
- `citations` — stored as JSONB array. Each citation has `document_id`, `document_name`, `page_number`, `chunk_id`, `relevance_score`, and a short excerpt. This is the proof layer. Every answer comes with sourced evidence the attorney can verify. Stored on the message so citations are retrievable without re-running the search.
- `tokens_used` and `model_used` — tracked for cost monitoring. If a particular query type consistently burns 3x the tokens, we know which prompt to optimize. Also the foundation for Phase 2 per-firm cost allocation.
- `role` — USER or ASSISTANT only. No SYSTEM role stored in the message table. System prompts are constructed server-side at query time from firm context and transaction summary. They are never persisted — they are always freshly assembled.

**The token budget — why it exists and what it is:**
The RAG context assembly uses a hard budget of 6,000 tokens of retrieved chunks. Chunks are added in descending relevance order until the budget is reached. A transaction with 40 documents and 2,000 chunks cannot have all relevant chunks included — the model's context window has a ceiling. The 6,000 token budget ensures the system prompt, conversation history, retrieved context, and Claude's response all fit comfortably. This number is documented here because it affects query quality — too low and relevant context is cut, too high and the model degrades on very long contexts.

---

## `[PHASE 2]` Entities — Designed, Not Built Yet

The entities below are fully designed and documented. They are not being built in Phase 1. They are here so the team understands the full data model and architects Phase 1 tables to accommodate them without schema rewrites.

---

### `[PHASE 2]` CaseDNA

The proprietary intelligence layer for PI cases. The most important Phase 2 table.

**Why CaseDNA is versioned:** Every time a new document is processed or the case status changes, the DNA is recalculated. We do not overwrite the previous version — we create a new one. The arbitrage prediction always references a specific DNA version via `dna_snapshot_id`. When we evaluate a prediction outcome, we look back at exactly what data the prediction was based on.

**Why scoring functions are deterministic, not LLM-generated:**
`liability_score`, `injury_severity_score`, `settlement_pressure_index`, and `trial_risk_score` are computed by our own scoring algorithms. The LLM extracts structured facts from documents. Our code applies deterministic math to those facts to produce scores. Scores are reproducible, auditable, and tunable against historical outcomes. You cannot do that with LLM-generated scores.

**Phase 1 equivalent:** Transaction DNA for real estate — property address, parties, key dates, confirmed deadlines, extracted contract terms. This is the simpler precursor. The full scoring engine is PI-specific and comes in Phase 2.

---

### `[PHASE 2]` ArbitragePrediction

The output of the Litigation Arbitrage Engine. Immutable once created. PI firms only.

**Why predictions are immutable:** Once an attorney uses a prediction to make a settlement decision, that prediction cannot change. The outcome evaluation compares the final settlement to what was predicted. If predictions mutated, the feedback loop would be meaningless.

**`dna_snapshot_id`** — the specific CaseDNA version this prediction was based on. The DNA changes as documents arrive. The prediction is based on DNA at a specific point in time. This link is the complete audit trail.

---

### `[PHASE 2]` CaseOutcome

Written when a PI case closes. Powers the feedback loop and the billing model.

**This table is the outcome-based billing model.** Every row is a billing event. `platform_fee` becomes a Stripe invoice. `delta` is the proof of value delivered. Firms only pay when predictions demonstrably improved their outcome.

---

### `[PHASE 2]` Judge, OpposingCounsel, Carrier (Global Fingerprint Tables)

Global tables — not firm-scoped. Shared intelligence across all firms on the platform.

**Why global:** Judge Mangrum of the 200th District Court is the same judge regardless of which firm has a case in her court. Every firm contributes to her fingerprint. Every firm's predictions benefit from it. This is the network effect moat — a solo firm could never build a meaningful judge behavioral profile alone.

**Carrier-specific:** `uses_colossus` flag for USAA, `litigation_welcoming` flag for carriers that prefer to go to trial, `reserve_tendency_score` for negotiating room signals. These accumulate from closed case outcomes across all firms.

These tables are seeded in Phase 1 for Austin judges and common carriers but are only actively queried and updated when the Arbitrage Engine ships in Phase 2.

**Fields that earn their place on Judge:**
- `settlementTendencyScore` — 0–100. Computed from outcomes of all cases in her court that closed through CounselOS. Higher means she actively pushes for settlement in pre-trial conferences. This directly weights the `settlementPressureIndex` in Case DNA.
- `avgDaysToVerdict` — average trial length. Factors into the firm's financial calculation of whether trial is worth it.
- `caseCount` — the denominator for all computed averages. A judge with 3 cases in our system has unreliable behavioral data. A judge with 150 cases has a statistically meaningful profile. We surface this count alongside predictions so attorneys understand confidence.
- `courtListenerJudgeId` — links to CourtListener's judge record for public ruling history enrichment. The sync job pulls new rulings weekly and updates the fingerprint.

**Fields that earn their place on Carrier:**
- `usesColossus` — boolean specifically for USAA. Colossus is an automated claim valuation software that systematically undervalues claims. When this flag is true, the arbitrage engine adjusts its initial offer expectation down and raises the `litigation pressure required` signal. Specific, actionable, based on real carrier behavior.
- `litigationWelcoming` — some carriers (Progressive, USAA post-2022) increasingly prefer to let cases go to trial rather than settle early. This flag changes the recommended action from SETTLE to TRIAL_READY.
- `reserveTendencyScore` — how aggressively they internally reserve cases. High reserve tendency means they have budgeted more for this case than their initial offer suggests. Signals negotiating room exists.

---

### Lead

Prospective clients before they become cases. The intake pipeline entity.

**Why leads are separate from cases:** A lead may never become a case. They may be disqualified, duplicates, or conflict-flagged. If we created a case record for every inquiry, the case list would be polluted with unqualified noise. Leads live separately until CONVERTED, at which point a case is created and `convertedCaseId` is set.

**Fields that earn their place:**
- `qualificationScore` — 0–10, AI-computed during the intake conversation. Based on injury severity, liability clarity, estimated damages, and plaintiff cooperativeness. Attorneys see this score before the consultation and prioritize their day accordingly.
- `conflictCheckStatus` and `conflictCheckNotes` — before any consultation is booked, we check the lead's parties against existing case parties across the firm. A potential conflict of interest must surface before not after the consultation. The status can be CLEAR (proceed), CONFLICT (stop), or REVIEW_NEEDED (attorney must look manually).
- `attorneyBrief` — AI-generated summary of the lead, written in the same sharp/calm/confident voice as the product. The attorney reads this 5 minutes before the consultation. "Maria Gonzalez, 34, RN. Slip and fall at HEB, fractured wrist, two surgeries. Clear premises liability. Surveillance footage likely exists — preservation letter needed immediately."
- `source` — where the lead came from. Intake form, phone call, referral, walk-in. Helps the firm understand which marketing channels convert best.
- `ipAddress` — rate limiting reference for the public intake endpoint. If one IP sends 50 intake forms in an hour, we flag it.

**Fields we do NOT have:**
No `budget` field — personal injury is contingency-based, no client budget. No `urgency` manually assigned — that is derived from `incidentDate` vs statute of limitations. No `notes` — conversation history covers this.

---

### Draft

AI-generated documents awaiting attorney review.

**Why tracked changes live on the Draft and not in a separate table:** Tracked changes are always consumed alongside the draft content. They are never queried independently. Storing them as JSONB on the Draft record means one query to get the entire reviewable document. A separate TrackedChanges table would require a join every single time a draft is opened.

**The never-auto-sent rule:** `sentAt` can only be written by an explicit attorney action after `approvedById` is set. The application layer enforces this. There is no automated job that sends drafts. Ever. An AI-generated demand letter that goes out without attorney review is a malpractice risk and a brand-ending event.

---

### TimeEntry and Invoice

The billing layer. **Phase 1** — both tables ship in the first migration, and slice 7 builds the UI.

**Why `billing_rate` is stored on TimeEntry rather than derived from User:**
Rates change over time. A time entry logged in January at $350/hour must not retroactively change if the attorney's rate updates in March. Rate is snapshotted at entry creation. Historical billing records are immutable facts.

**Why `line_items` on Invoice is a JSONB snapshot, not FKs to TimeEntry:**
An invoice is a historical record. Time entries may be edited, corrected, or soft-deleted afterward; the invoice must not move. Reprinting a 2024 invoice has to produce the 2024 invoice.

**Passive capture:** `source` distinguishes MANUAL from SUGGESTED, and `entry_status` DRAFT from CONFIRMED. A DRAFT entry never appears on an invoice and is purged after 14 days if the attorney never confirms it. Nothing bills without a human confirming it.

**No Stripe fields in Phase 1.** The attorney downloads the invoice PDF and emails it. `stripe_payment_link_url` is a `[PHASE 2]` addition, arriving with subscriptions.

---

## Phase 1 Relationship Summary

```
Firm (one — hardcoded in Phase 1)
 ├── has many Users
 │    roles: OWNER, ATTORNEY, PARALEGAL, CLIENT
 ├── has many Transactions
 └── has many Leads

Transaction (belongs to Firm)
 ├── belongs to one assigned Attorney (User, required)
 ├── optionally belongs to one assigned Paralegal (User)
 ├── optionally belongs to one Client (User, portal access)
 ├── has many Parties (separate table, FK to transaction)
 │    roles: BUYER, SELLER, BUYERS_AGENT, SELLERS_AGENT,
 │           TITLE_COMPANY, LENDER, INSPECTOR, SURVEYOR,
 │           OPPOSING_COUNSEL, HOA, OTHER
 ├── has many Documents
 │    └── each Document has many DocumentChunks (embeddings in pgvector)
 ├── has many Deadlines
 │    └── Deadlines self-reference via superseded_by_id / supersedes_id
 │        for amendment chains
 ├── has many ChatSessions
 │    └── each Session has many ChatMessages (citations in JSONB)
 ├── has many Drafts
 └── has many TransactionActivity entries (immutable, append-only)

Lead (belongs to Firm)
 └── optionally converts to one Transaction
```

## `[PHASE 2]` Relationship Additions

```
Transaction becomes Case with practice_area field

Case (PI expansion)
 ├── has many CaseDNA versions (append-only)
 ├── has many ArbitragePredictions
 │    └── each Prediction optionally has one CaseOutcome
 └── Parties gain PI roles: PLAINTIFF, DEFENDANT,
     INSURANCE_CARRIER, JUDGE, EXPERT_WITNESS, TREATING_PROVIDER

Global tables (not firm-scoped, shared intelligence)
 Judge / Carrier / OpposingCounsel
  └── referenced by Party records across all firms
      updated by CaseOutcome feedback loop
```

---

---

## What We Deliberately Left Out

**No persistent notifications table.** In-app notification records are transient by nature. Alerts fire via SSE and Resend, and the **deadline dashboard is the notification center** — it is accurate regardless of whether either channel delivered. `alerts_sent_at` on Deadline tracks what was sent. `email_jobs` is a different thing and does exist: it is the send-side audit trail (queued → sent → failed, with the Resend message ID), not a notification feed.

**No tags table.** Tags on transactions are a string array column. Real estate attorneys tag with simple labels like `['cash_purchase', 'estate_sale']`. A normalized tags table for this is over-engineering.

**No notification preferences table.** Firm settings JSONB holds the firm-level toggles; per-user opt-out is a single boolean on User. Anything finer-grained is `[PHASE 2]`.

**Two things this section used to list that DO exist:**

- **`access_log`** — a read-access audit trail, distinct from `transaction_activities`, which logs *actions*. This logs *views*: who opened which matter and when. For a system holding privileged material, reads matter as much as writes — it is what proves matter-level access control works. Written from an interceptor, never from controllers. High volume; partition in Phase 2.
- **`client_messages`** — the client portal is **two-way** in Phase 1 (slice 9). The client is authenticated by the same signed token that grants read access, so there is still no client account. The AI never auto-responds; an attorney composes every outbound reply. Every message also writes a `communications` row with type `CLIENT_PORTAL`, so portal traffic feeds institutional memory and AI chat context.

**No `[PHASE 2]` tables in Phase 1 migrations.** CaseDNA, ArbitragePrediction, CaseOutcome, Judge, Carrier, OpposingCounsel are documented and designed but not included in the Phase 1 schema. They are added in Phase 2 migrations. Phase 1 schema is lean — only what ships.

---

## Data Fetching Strategy — Phase 1

Client-side detail is owned by `06-frontend-architecture.md`; where the two disagree, 06 wins.

**Category 1 — Static reference data. Fetch once, cache long.**
Firm settings. Phase 1 has one firm so this barely matters, but the pattern is established for Phase 2.

Server: Redis cache with 15-minute TTL on firm settings. Embedding vectors cached 7 days by content hash — never re-embed unchanged content.

Client: SWR with `revalidateOnFocus: false`. **Server data lives in SWR and only SWR** — it is never copied into Zustand. The two Zustand stores hold ephemeral state only: the in-memory access token and the SSE connection/notification queue.

**Category 2 — Session data. Fetch on navigation.**
Transaction list, transaction detail, documents, deadlines, drafts, leads. Changes only when the user takes an action.

Server: No cache. Always hits database. Queries are fast because indexes are tight and firm scope is always the first filter.

Client: SWR, `revalidateOnFocus: false` globally. **Optimistic updates are the exception, not the default** — they apply only to creates on a list the user is currently watching (communication, note, task, time entry), each with `rollbackOnError` and a failure toast. Status transitions, deadline confirms, draft approvals, and invoicing use a pending state and then revalidate: showing a legal state change that may not have happened is worse than showing a spinner.

**Category 3 — Real-time data. Push, not pull.**
Document processing status, deadline alerts, chat token stream, transaction activity feed. Must push the moment the server knows. Never poll.

---

## SSE vs WebSocket — Phase 1 Split

**SSE — server-to-client one-way streams (the only real-time transport):**
- `GET /v1/transactions/:id/documents/stream` — document processing status events
- `GET /v1/transactions/:id/chat/:sessionId/stream` — LLM token stream, then citations
- `GET /v1/events` — global firm event stream: deadline alerts, document ready/failed, draft ready, new leads, task assigned. Heartbeat every 25 seconds (Railway's proxy kills idle connections at 60s).

**No WebSocket. No Socket.io.** Every Phase 1 real-time need is server-to-client only, which is exactly what SSE does. On reconnect the server sends a state **snapshot**, not an event replay — the client reconciles from the snapshot.

> `[PHASE 2]` Socket.io only if a genuinely bidirectional need appears (e.g. multi-user presence on a shared transaction).

---

## Caching Plan — Phase 1

**Redis (Upstash)**

```
user:{authId}                   5 min     Hydrated User record — JwtAuthGuard cache
chat:{sessionId}:history        2 hr      Last 10 messages for RAG context
emb:{sha256(chunkContent)}      7 days    Voyage AI embedding by content hash
txn:{transactionId}:summary     5 min     Transaction summary for prompt assembly
```

**Client-side (SWR)**

```
Resource                        stale time    revalidate on focus
/transactions (list)            30 seconds    false
/transactions/:id               0 seconds     false  (always fresh)
/transactions/:id/deadlines     30 seconds    false
/transactions/:id/documents     30 seconds    false
/leads                          30 seconds    false
/deadlines (firm-wide)          30 seconds    false
```

Everything else: `Cache-Control: no-store`. Transaction data, deadline data — must always be fresh. A stale closing date on the dashboard is unacceptable.
