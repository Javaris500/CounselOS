# CounselOS — Drizzle Schema
### `src/database/schema.ts` — Phase 1 Source of Truth

---

## Usage

This file is the single source of truth for every table in CounselOS Phase 1.
Copy the contents of the **Schema File** section directly into `src/database/schema.ts`.

**Rules:**
- Never edit a table's column structure without a corresponding migration
- Never add columns to this file without documenting the migration in `drizzle/migrations/`
- All column names in this file use `snake_case` — Drizzle maps to `camelCase` in TypeScript automatically
- Phase 2 tables are documented at the bottom — do not add them to this file until Phase 2 begins

---

## Required Packages

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit
```

For pgvector support — no separate package needed. The `vector` custom type defined in this file handles it.

---

## Drizzle Config (`drizzle.config.ts`)

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/database/schema.ts',
  out: './drizzle/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config
```

---

## Schema File

```typescript
// src/database/schema.ts
// CounselOS Phase 1 — Real Estate Transaction Management Platform
// Drizzle ORM + PostgreSQL + pgvector (Supabase)
//
// Table order (dependency order — parents before children):
//   firms → users → transactions → parties
//   → documents → document_chunks
//   → deadlines → chat_sessions → chat_messages
//   → drafts → draft_versions
//   → leads → client_access_tokens → transaction_activities
//   → matter_notes → communications → document_checklist_items
//   → tasks → time_entries → invoices
//
// Phase 2 tables NOT in this file:
//   case_dna, arbitrage_predictions, case_outcomes,
//   judges, opposing_counsel, carriers, time_entries, invoices, playbooks

import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

// ============================================================
// CUSTOM TYPES
// ============================================================

/**
 * pgvector vector type.
 * Requires pgvector extension enabled in Supabase:
 *   Dashboard → Database → Extensions → vector → Enable
 *
 * HNSW index created in a separate migration (drizzle-kit cannot generate it):
 *   CREATE INDEX document_chunks_embedding_hnsw_idx
 *   ON document_chunks USING hnsw (embedding vector_cosine_ops)
 *   WITH (m = 16, ef_construction = 64);
 */
export const vector = customType<{
  data: number[]
  config: { dimensions: number }
  configRequired: true
  driverData: string
}>({
  dataType(config) {
    return `vector(${config.dimensions})`
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(',')
      .map(Number)
  },
})

// ============================================================
// ENUMS
// Defined before any table that references them.
// Adding values: safe (non-destructive migration).
// Removing values: destructive — never remove, mark deprecated in comments.
// ============================================================

export const userRoleEnum = pgEnum('user_role', [
  'OWNER',
  'ATTORNEY',
  'PARALEGAL',
  'CLIENT',
])

export const transactionTypeEnum = pgEnum('transaction_type', [
  'PURCHASE',
  'SALE',
  'REFINANCE',
  'LEASE',
  'COMMERCIAL',
])

export const transactionStatusEnum = pgEnum('transaction_status', [
  'INTAKE',
  'UNDER_CONTRACT',
  'DUE_DILIGENCE',
  'TITLE_REVIEW',
  'CLOSING_PREP',
  'CLOSED',
  'FALLEN_THROUGH',
])

export const partyRoleEnum = pgEnum('party_role', [
  'BUYER',
  'SELLER',
  'BUYERS_AGENT',
  'SELLERS_AGENT',
  'TITLE_COMPANY',
  'LENDER',
  'INSPECTOR',
  'SURVEYOR',
  'OPPOSING_COUNSEL',
  'HOA',
  'OTHER',
  // Phase 2 additions (add when expanding to PI):
  // 'PLAINTIFF', 'DEFENDANT', 'INSURANCE_CARRIER', 'ADJUSTER',
  // 'JUDGE', 'EXPERT_WITNESS', 'TREATING_PROVIDER', 'CO_COUNSEL'
])

export const partyTypeEnum = pgEnum('party_type', [
  'PERSON',
  'ORGANIZATION',
])

export const documentTypeEnum = pgEnum('document_type', [
  'PURCHASE_AGREEMENT',
  'LEASE',
  'TITLE_COMMITMENT',
  'SURVEY',
  'INSPECTION_REPORT',
  'CLOSING_DISCLOSURE',
  'DEED',
  'AMENDMENT',
  'ADDENDUM',
  'WIRE_INSTRUCTIONS',  // triggers wire-fraud verification (Layer 8F)
  'CORRESPONDENCE',
  'OTHER',
  // Phase 2 additions (add when expanding to PI):
  // 'MEDICAL_RECORD', 'COURT_FILING', 'POLICE_REPORT',
  // 'INSURANCE_LETTER', 'DEMAND_LETTER', 'DEPOSITION', 'EXPERT_REPORT'
])

export const documentProcessingStatusEnum = pgEnum('document_processing_status', [
  'PENDING',
  'PROCESSING',
  'EXTRACTING',
  'EMBEDDING',
  'READY',
  'FAILED',
])

export const deadlineTypeEnum = pgEnum('deadline_type', [
  'OPTION_PERIOD_EXPIRY',
  'OPTION_FEE_DELIVERY',      // 3 days, does NOT roll for weekends — the TREC trap
  'EARNEST_MONEY_DELIVERY',   // 3 days, DOES roll to next business day
  'FINANCING_CONTINGENCY',
  'INSPECTION_DEADLINE',
  'CLOSING_DATE',
  'TITLE_COMMITMENT_DEADLINE',
  'SURVEY_DEADLINE',
  'HOA_APPROVAL',
  'POSSESSION_DATE',
  'OTHER',
  // Phase 2 additions (add when expanding to PI):
  // 'FILING', 'RESPONSE', 'DISCOVERY_CUTOFF', 'STATUTE_OF_LIMITATIONS',
  // 'COURT_DATE', 'DEPOSITION', 'MEDIATION', 'EXPERT_DESIGNATION'
])

export const deadlineStatusEnum = pgEnum('deadline_status', [
  'PENDING_REVIEW', // extracted by AI, awaiting attorney confirmation
  'ACTIVE',         // confirmed by attorney, alerts enabled
  'COMPLETED',      // attorney marked as done
  'DISMISSED',      // attorney dismissed (or superseded by amendment)
])

export const deadlineUrgencyEnum = pgEnum('deadline_urgency', [
  'INFO',     // 14+ days remaining
  'WARNING',  // 7–13 days remaining
  'URGENT',   // 3–6 days remaining
  'CRITICAL', // 0–2 days remaining
])

export const draftTypeEnum = pgEnum('draft_type', [
  'AMENDMENT',
  'EXTENSION_ADDENDUM',
  'EARNEST_MONEY_DEMAND',
  'LEASE_MODIFICATION',
  'CLOSING_INSTRUCTION_LETTER',
  'ENGAGEMENT_LETTER',    // includes AI disclosure language — Opinion 705 compliance
  'STATUS_UPDATE',
  'OTHER',
  // Phase 2 additions (add when expanding to PI):
  // 'DEMAND_LETTER', 'LEGAL_MEMO', 'SETTLEMENT_OFFER', 'COMPLAINT', 'MOTION'
])

export const draftStatusEnum = pgEnum('draft_status', [
  'GENERATING', // BullMQ job in progress
  'READY',      // generation complete, awaiting attorney review
  'IN_REVIEW',  // attorney has opened the draft
  'APPROVED',   // attorney approved, ready to download/send
  'SENT',       // attorney marked as sent
  'FAILED',     // generation failed after all retries
])

export const draftGeneratedByEnum = pgEnum('draft_generated_by', [
  'AI',   // first version, generated by Claude
  'USER', // subsequent versions, attorney edits
])

export const leadStatusEnum = pgEnum('lead_status', [
  'NEW',
  'REVIEWED',
  'CONVERTED',
  'REJECTED',
  'DUPLICATE',
])

export const emailJobStatusEnum = pgEnum('email_job_status', [
  'QUEUED',
  'SENT',
  'FAILED',
])

export const messageRoleEnum = pgEnum('message_role', [
  'USER',
  'ASSISTANT',
])


export const communicationTypeEnum = pgEnum('communication_type', [
  'PHONE_CALL',
  'EMAIL',
  'IN_PERSON',
  'TEXT',
  'VOICEMAIL',
  'OTHER',
])

export const communicationDirectionEnum = pgEnum('communication_direction', [
  'INBOUND',
  'OUTBOUND',
])

export const taskPriorityEnum = pgEnum('task_priority', [
  'NORMAL',
  'HIGH',
])

export const taskStatusEnum = pgEnum('task_status', [
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
])

export const checklistItemStatusEnum = pgEnum('checklist_item_status', [
  'PENDING',
  'RECEIVED',
  'WAIVED',
  'NOT_APPLICABLE',
])

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'DRAFT',
  'SENT',
  'PAID',
])


export const wireVerificationMethodEnum = pgEnum('wire_verification_method', [
  'PHONE',         // called a known number and confirmed
  'IN_PERSON',     // confirmed face to face
  'SECURE_PORTAL', // confirmed via title company's verified portal
])


export const timeEntrySourceEnum = pgEnum('time_entry_source', ['MANUAL', 'SUGGESTED'])
export const timeEntryStatusEnum = pgEnum('time_entry_status', ['DRAFT', 'CONFIRMED'])

export const messageDirectionEnum = pgEnum('message_direction', [
  'INBOUND',   // from client
  'OUTBOUND',  // from firm
])


export const referralSourceTypeEnum = pgEnum('referral_source_type', [
  'REALTOR', 'PAST_CLIENT', 'ATTORNEY', 'LENDER',
  'TITLE_COMPANY', 'WEB_SEARCH', 'WALK_IN', 'OTHER',
])

export const outcomeReasonEnum = pgEnum('outcome_reason', [
  'CLOSED_ON_TIME', 'CLOSED_DELAYED', 'FINANCING_DENIED',
  'INSPECTION_ISSUES', 'TITLE_DEFECT', 'APPRAISAL_GAP',
  'BUYER_TERMINATED_OPTION', 'SELLER_TERMINATED',
  'PARTIES_RENEGOTIATED_ELSEWHERE', 'OTHER',
])

// ============================================================
// TABLES
// Column order within each table:
//   1. id (PK)
//   2. firm_id (FK → firms)
//   3. Primary parent FK (transaction_id, document_id, etc.)
//   4. Secondary parent FKs
//   5. Role-based user FKs (assigned_attorney_id, confirmed_by_id)
//   6. Enum columns (type, status, role)
//   7. Required string fields
//   8. Optional string fields
//   9. Numeric fields
//   10. Timestamp/date fields (domain dates, not system timestamps)
//   11. Boolean flags (is_*)
//   12. JSONB/array fields
//   13. System timestamps (created_at, updated_at — always last)
//   14. Soft delete (deleted_at — very last if present)
// ============================================================

// ------------------------------------------------------------
// FIRMS
// Root entity. Every piece of data in the system belongs to a firm.
// No soft delete — firms are deactivated via settings, never deleted.
// ------------------------------------------------------------
export const firms = pgTable('firms', {
  id:        uuid('id').primaryKey().defaultRandom(),

  name:      text('name').notNull(),
  slug:      text('slug').notNull().unique(),    // url-safe: 'rodriguez-associates'
  state:     text('state').notNull().default('TX'),
  city:      text('city').notNull().default('Austin'),
  timezone:  text('timezone').notNull().default('America/Chicago'),

  // Feature toggles and firm-level config.
  // JSONB because it is always read as a blob, never filtered.
  // Shape: { defaultBillingRate, autoSuggestTimeEntries, intakeEnabled,
  //          clientPortalEnabled, arbitrageEnabled (Phase 2),
  //          alertEmailEnabled, alertSmsEnabled }
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
})

// ------------------------------------------------------------
// USERS
// Attorneys, paralegals, owners, and clients all live in one table.
// Role gates access. CLIENT role is portal-only, scoped to one transaction.
//
// Two records per human:
//   1. Supabase auth.users  — credentials, sessions (we don't own this)
//   2. This users table      — application identity, role, firm membership
//
// auth_id links them. Set to null until the user first authenticates.
//
// CIRCULAR DEPENDENCY NOTE:
//   transaction_id references transactions table, but transactions
//   references users (assigned_attorney_id). This circular FK cannot
//   be expressed as a DB constraint without deferred constraints.
//   Solution: transaction_id stored as plain uuid(), no .references().
//   Application enforces the relationship. This is the only column
//   in the schema without a DB-level FK constraint by design.
// ------------------------------------------------------------
export const users = pgTable('users', {
  id:             uuid('id').primaryKey().defaultRandom(),
  firmId:         uuid('firm_id').notNull().references(() => firms.id),

  // auth_id: null until user clicks magic link or first logs in
  authId:         uuid('auth_id').unique(),

  // CLIENT role: the one transaction this client can access (portal-only)
  // No .references() — circular dependency with transactions table (see note above)
  transactionId:  uuid('transaction_id'),

  // Who invited this user (set when attorney invites a client)
  invitedById:    uuid('invited_by_id').references((): any => users.id),

  role:           userRoleEnum('role').notNull(),

  email:          text('email').notNull(),
  fullName:       text('full_name').notNull(),
  phone:          text('phone'),
  barNumber:      text('bar_number'),        // attorneys only

  isActive:       boolean('is_active').notNull().default(true),
  lastSeenAt:     timestamp('last_seen_at'), // updated on each authenticated request

  // Legal compliance tracking
  // Set when attorney first acknowledges the firm AI use policy on login
  aiPolicyAcknowledgedAt: timestamp('ai_policy_acknowledged_at'),

  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  // No deleted_at — users are deactivated (is_active = false), never deleted
})

// ------------------------------------------------------------
// TRANSACTIONS
// The central entity. Everything else belongs to a transaction.
//
// Date fields use timestamp (not date) for consistency and timezone
// handling. Application sets time to midnight local time for pure dates.
//
// client_user_id: FK to users is safe here (users defined above,
// transactions defined now — no circular issue in this direction).
// ------------------------------------------------------------
export const transactions = pgTable('transactions', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  firmId:               uuid('firm_id').notNull().references(() => firms.id),
  assignedAttorneyId:   uuid('assigned_attorney_id').notNull().references(() => users.id),
  assignedParalegalId:  uuid('assigned_paralegal_id').references(() => users.id),

  transactionType:      transactionTypeEnum('transaction_type').notNull(),
  status:               transactionStatusEnum('status').notNull().default('INTAKE'),

  // Human-readable identifier. Auto-generated: RE-2025-0042
  // Partial unique index (excluding deleted): see Migration Notes below
  transactionNumber:    text('transaction_number').notNull(),

  // Auto-generated: "Martinez / Chen — 2847 Manor Rd". Attorney can override.
  title:                text('title').notNull(),

  propertyAddress:      text('property_address').notNull(),
  propertyCity:         text('property_city').notNull().default('Austin'),
  propertyState:        text('property_state').notNull().default('TX'),
  propertyZip:          text('property_zip'),

  // THE anchor date. All deadline calculations originate here.
  // Option period expiry = effective_date + N days.
  // Without this, deadlines cannot be auto-computed from contract terms.
  effectiveDate:        timestamp('effective_date'),
  contractDate:         timestamp('contract_date'),

  // These are computed from effectiveDate + contract terms when first extracted.
  // Stored for fast dashboard display and deadline tracking.
  // Always superseded by an actual Deadline record — these are convenience fields.
  optionPeriodExpiry:   timestamp('option_period_expiry'),
  financingDeadline:    timestamp('financing_deadline'),
  inspectionDeadline:   timestamp('inspection_deadline'),
  titleDeadline:        timestamp('title_deadline'),
  closingDate:          timestamp('closing_date'),
  possessionDate:       timestamp('possession_date'),

  // Attorneys reference earnest_money_amount constantly.
  // Belongs on root entity, not buried in a document.
  purchasePrice:        numeric('purchase_price', { precision: 12, scale: 2 }),
  earnestMoneyAmount:   numeric('earnest_money_amount', { precision: 10, scale: 2 }),
  optionFee:            numeric('option_fee', { precision: 8, scale: 2 }),

  // internal_notes removed — replaced by the matter_notes table.
  // Matter notes are individual timestamped journal entries, not a single text blob.
  // See matterNotes table below.

  // Simple label array. Never queried for complex conditions.
  // text[] is appropriate (not jsonb) — supports @> containment queries.
  tags:                 text('tags').array().notNull().default(sql`'{}'::text[]`),

  isArchived:           boolean('is_archived').notNull().default(false),

  // ── Referral Attribution ─────────────────────────────────────────────
  // Copied from the lead on conversion so attribution survives lead archival.
  // The single most useful input to referral-ROI analysis. UNRECOVERABLE —
  // nobody remembers who referred a client 18 months later.
  referralSourceType: referralSourceTypeEnum('referral_source_type'),
  // Free text deliberately — forcing a dropdown at intake kills capture rate.
  // "Maria Delgado, Compass RE". Analytics normalizes later.
  referralSourceName: text('referral_source_name'),
  // ─────────────────────────────────────────────────────────────────────

  // ── Outcome Capture ──────────────────────────────────────────────────
  // Set when the transaction reaches CLOSED or FALLEN_THROUGH — the status
  // transition prompts for it. Without the WHY, no risk scoring and no
  // honest answer to "what kills our deals?" UNRECOVERABLE after the fact.
  outcomeReason:  outcomeReasonEnum('outcome_reason'),
  outcomeNotes:   text('outcome_notes'),   // max 500 chars
  // Computed on close: effective_date → closed_at. Stored rather than derived
  // so cycle-time analysis stays a simple aggregate.
  cycleTimeDays:  integer('cycle_time_days'),
  // ─────────────────────────────────────────────────────────────────────

  // ── Legal Compliance Fields ──────────────────────────────────────────
  // Conflict of interest check status. Must be CLEAR or REVIEWED before
  // lead can be converted to transaction. Required by Texas Rule 1.09/1.10.
  conflictCheckStatus:  text('conflict_check_status').notNull().default('PENDING'),
  // PENDING | CLEAR | FLAGGED | REVIEWED
  // Notes written by attorney when reviewing a FLAGGED conflict
  conflictCheckNotes:   text('conflict_check_notes'),
  conflictCheckCompletedAt: timestamp('conflict_check_completed_at'),

  // Set when attorney confirms the client has been informed that AI tools
  // are used in their representation. Satisfies Opinion 705 disclosure recommendation.
  aiDisclosureAcknowledgedAt: timestamp('ai_disclosure_acknowledged_at'),

  // Data retention: Texas real estate matters require 7-year file retention.
  // Auto-set to closed_at + 7 years when transaction closes.
  // Surfaces in firm dashboard for upcoming retention reviews.
  retentionUntil:       timestamp('retention_until'),
  // ────────────────────────────────────────────────────────────────────

  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  // Set automatically by TransactionsService.updateStatus() on terminal transitions
  closedAt:             timestamp('closed_at'),
  deletedAt:            timestamp('deleted_at'),
}, (table) => ({
  // Composite index: most dashboard queries filter by firm + status
  firmStatusIdx:          index('transactions_firm_id_status_idx').on(table.firmId, table.status),
  // Closing date index: default sort order on the dashboard
  closingDateIdx:         index('transactions_closing_date_idx').on(table.closingDate),
  // Attorney filter: "my transactions" view
  assignedAttorneyIdx:    index('transactions_assigned_attorney_id_idx').on(table.assignedAttorneyId),
}))

// ------------------------------------------------------------
// PARTIES
// Everyone involved in a transaction. One table, role-based.
// Enables queries like "all transactions where Independence Title
// is the title company" — not possible if parties were a JSONB column.
// No soft delete — parties cascade-delete with their transaction.
// ------------------------------------------------------------
export const parties = pgTable('parties', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),

  role:          partyRoleEnum('role').notNull(),
  type:          partyTypeEnum('type').notNull(),

  name:          text('name').notNull(),       // person full name or org name
  email:         text('email'),
  phone:         text('phone'),
  companyName:   text('company_name'),         // brokerage for agents, company for orgs
  licenseNumber: text('license_number'),       // TREC license for agents, bar # for attorneys
  address:       text('address'),

  // Role-specific context stored as freeform text.
  // Lender: "Loan #L-2025-09234, 7.25% 30yr conventional"
  // Title company: "File #2025-04821, Closer: Maria Webb, 512-555-0100"
  // HOA: "Sunset Ridge HOA, managed by TexPro Management, approval contact: Jane Doe"
  notes:         text('notes'),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  transactionIdx: index('parties_transaction_id_idx').on(table.transactionId),
}))

// ------------------------------------------------------------
// DOCUMENTS
// Files uploaded to a transaction. Input to the intelligence pipeline.
// Every intelligent feature — chat, deadlines, drafts — depends on
// these being processed correctly.
//
// storage_key format: {firmId}/{transactionId}/{uuid}.{ext}
// Never store a URL. Generate signed URLs on demand:
//   supabase.storage.from('documents').createSignedUrl(storage_key, 900)
// ------------------------------------------------------------
export const documents = pgTable('documents', {
  id:                uuid('id').primaryKey().defaultRandom(),
  transactionId:     uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:            uuid('firm_id').notNull().references(() => firms.id),
  uploadedById:      uuid('uploaded_by_id').notNull().references(() => users.id),

  type:              documentTypeEnum('type').notNull(),

  // Display name shown in UI. Defaults to original_filename without extension.
  name:              text('name').notNull(),
  // Preserved exactly as uploaded — for display and audit.
  originalFilename:  text('original_filename').notNull(),
  mimeType:          text('mime_type').notNull(),
  sizeBytes:         integer('size_bytes').notNull(),
  storageKey:        text('storage_key').notNull(),

  processingStatus:  documentProcessingStatusEnum('processing_status').notNull().default('PENDING'),
  // Human-readable error. "No extractable text — may be a scanned image"
  // Never a stack trace. Set when processing_status = FAILED.
  processingError:   text('processing_error'),
  // Set after text extraction. Required for citation page validation.
  pageCount:         integer('page_count'),

  // Attorney explicitly marks true. Never automatic. Default false.
  // Client portal only shows documents where this is true.
  isClientVisible:   boolean('is_client_visible').notNull().default(false),

  createdAt:         timestamp('created_at').notNull().defaultNow(),
  updatedAt:         timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  // Soft delete — document record preserved, R2 file not deleted.
  // Chunk records not deleted — data preserved for potential restore.
  deletedAt:         timestamp('deleted_at'),
}, (table) => ({
  transactionStatusIdx: index('documents_transaction_id_processing_status_idx')
    .on(table.transactionId, table.processingStatus),
}))

// ------------------------------------------------------------
// DOCUMENT CHUNKS
// Output of the document processing pipeline.
// One row per text chunk extracted from a document, with its
// 1024-dimension Voyage AI (voyage-law-2) embedding.
//
// DENORMALIZATION: transaction_id and firm_id are derivable from
// document_id → documents.transaction_id. They are stored here
// intentionally for the pgvector pre-filter:
//   WHERE transaction_id = ? AND firm_id = ?
// This filter runs BEFORE the HNSW vector scan, reducing the search
// space from all chunks to only this transaction's chunks.
// Without it, every vector search scans the entire table.
//
// No FK constraints on transaction_id and firm_id (denormalized columns)
// to avoid join overhead on inserts. Application maintains consistency.
// Cascade delete via document_id → documents handles cleanup.
//
// No updated_at — chunks are immutable once created.
// No deleted_at — chunks cascade-delete with their document.
//
// CHUNK PARAMETERS (locked — do not change without re-embedding all chunks):
//   chunk_size:    512 tokens
//   chunk_overlap: 50 tokens
//   splitter:      paragraph-aware (split at paragraphs, fall back to tokens)
//
// HNSW INDEX (created in a separate raw SQL migration — drizzle-kit
// cannot generate HNSW indexes):
//   CREATE INDEX document_chunks_embedding_hnsw_idx
//   ON document_chunks USING hnsw (embedding vector_cosine_ops)
//   WITH (m = 16, ef_construction = 64);
//   SET hnsw.ef_search = 40;  -- set at query time for recall/speed balance
// ------------------------------------------------------------
export const documentChunks = pgTable('document_chunks', {
  id:            uuid('id').primaryKey().defaultRandom(),
  documentId:    uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  // Denormalized — no .references() — see note above
  transactionId: uuid('transaction_id').notNull(),
  firmId:        uuid('firm_id').notNull(),

  // Position of this chunk within the document (0-indexed)
  chunkIndex:    integer('chunk_index').notNull(),
  // Source page in the original document. Required for citations.
  // Null when the document has no page structure (e.g., plain text).
  pageNumber:    integer('page_number'),
  // Raw text of this chunk. Returned with search results — no second query needed.
  content:       text('content').notNull(),
  // 1024-dimension Voyage AI voyage-law-2 embedding.
  // Each embedding: 1024 × 4 bytes = 4KB per row.
  embedding:     vector('embedding', { dimensions: 1024 }).notNull(),
  // Used by RAG context assembler to respect the 6,000 token budget.
  // Chunks added in relevance order until budget is consumed.
  tokenCount:    integer('token_count').notNull(),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // The pre-filter composite index. Column order matters:
  // transaction_id first (eliminates ~99.9% of rows), firm_id second.
  preFilterIdx: index('document_chunks_transaction_firm_idx')
    .on(table.transactionId, table.firmId),
}))

// ------------------------------------------------------------
// DEADLINES
// Every contractual and manually-added deadline on a transaction.
//
// KEY DESIGN DECISIONS:
//
// 1. STAGING: auto-extracted deadlines start as PENDING_REVIEW.
//    Attorneys confirm before alerts activate. Never auto-confirmed.
//
// 2. AUTO-EXTRACTED vs MANUAL: is_auto_extracted distinguishes these.
//    Auto-extracted: show "Source: Purchase Agreement, Page 3" link.
//    Manual: show "Added manually by James Okafor".
//
// 3. AMENDMENT SUPERSEDING:
//    When Amendment 2 changes the closing date, the old deadline is NOT
//    deleted — it is linked via superseded_by_id to the new deadline.
//    The new deadline has supersedes_id pointing back to the old one.
//    Full amendment chain preserved. Dashboard only shows non-superseded:
//      WHERE superseded_by_id IS NULL AND status != 'DISMISSED'
//
// 4. ALERTS: alerts_sent_at is a timestamp array. One entry per alert
//    sent. Scheduler checks this before sending to prevent duplicates.
//    Grows as different urgency tiers fire (INFO, WARNING, URGENT, CRITICAL).
// ------------------------------------------------------------
export const deadlines = pgTable('deadlines', {
  id:              uuid('id').primaryKey().defaultRandom(),
  transactionId:   uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:          uuid('firm_id').notNull().references(() => firms.id),
  // Document this deadline was extracted from. NULL for manually added deadlines.
  sourceDocumentId: uuid('source_document_id').references(() => documents.id, { onDelete: 'set null' }),
  // Amendment superseding chain (self-references)
  supersededById:  uuid('superseded_by_id').references((): any => deadlines.id),
  supersedesId:    uuid('supersedes_id').references((): any => deadlines.id),
  confirmedById:   uuid('confirmed_by_id').references(() => users.id),

  type:            deadlineTypeEnum('type').notNull(),
  status:          deadlineStatusEnum('status').notNull().default('PENDING_REVIEW'),
  // Computed by scheduler hourly. Stored for dashboard sorting.
  // Busted and updated on each scheduler run.
  urgency:         deadlineUrgencyEnum('urgency').notNull().default('INFO'),

  // Written in code, not generated by AI.
  // "Option Period Expiry", "Financing Contingency Deadline"
  title:           text('title').notNull(),
  // Additional context. "Per Section 5, Paragraph B of the Purchase Agreement"
  description:     text('description'),

  // The actual deadline. Scheduler queries: WHERE due_at > NOW() AND status = ACTIVE
  dueAt:           timestamp('due_at').notNull(),

  // ── Source Linking (verification acceleration) ───────────────────────
  // Where this deadline came from in the document. Lets the review UI show
  // the attorney the source sentence instead of making them re-read the
  // contract. This is what makes verification a 5-second glance.
  // NULL for manually-entered deadlines. UNRECOVERABLE if not captured
  // at extraction time.
  sourcePage:      integer('source_page'),
  sourceText:      text('source_text'),        // the verbatim triggering sentence
  sourceCharStart: integer('source_char_start'), // for highlight rendering
  sourceCharEnd:   integer('source_char_end'),
  // Model confidence, when available. Low-confidence extractions sort first
  // in the review queue.
  extractionConfidence: numeric('extraction_confidence', { precision: 3, scale: 2 }),
  // ─────────────────────────────────────────────────────────────────────

  // ── TREC Deadline Engine (how this date was computed) ────────────────
  // Shown to the attorney so they trust the math. Null for manual deadlines.
  dayType:         text('day_type'),        // CALENDAR | BUSINESS | TREC_DAYS
  rollRule:        text('roll_rule'),       // NONE | NEXT_BUSINESS_DAY | PREVIOUS_BUSINESS_DAY
  // Human-readable: "7 calendar days from effective date (June 2) = June 9"
  // For the option-fee trap: "3 days. TREC rule: does not extend for weekends. Due Saturday."
  calculationNote: text('calculation_note'),
  // ─────────────────────────────────────────────────────────────────────

  // TRUE = AI extracted from source_document_id.
  // FALSE = attorney typed it in manually.
  // This single flag drives different UI treatment.
  isAutoExtracted: boolean('is_auto_extracted').notNull().default(false),

  confirmedAt:     timestamp('confirmed_at'),
  completedAt:     timestamp('completed_at'),
  // Array of timestamps — one per alert sent across all urgency tiers.
  // Scheduler checks before sending: "has WARNING tier been sent already?"
  alertsSentAt:    timestamp('alerts_sent_at').array().notNull().default(sql`'{}'::timestamp[]`),
  // External calendar event ID for Google/Outlook sync. Stored to update/delete if deadline changes.
  calendarEventId: text('calendar_event_id'),

  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt:       timestamp('deleted_at'),
}, (table) => ({
  // Scheduler query: active deadlines ordered by due date
  transactionStatusIdx: index('deadlines_transaction_id_status_idx')
    .on(table.transactionId, table.status),
  // Firm-wide deadline dashboard
  firmDueAtIdx:         index('deadlines_firm_id_due_at_idx')
    .on(table.firmId, table.dueAt),
}))

// ------------------------------------------------------------
// CHAT SESSIONS
// Container for chat conversations about a transaction.
// Multiple sessions per transaction — attorneys return to past conversations.
// No soft delete — sessions are permanent history.
// ------------------------------------------------------------
export const chatSessions = pgTable('chat_sessions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),
  createdById:   uuid('created_by_id').notNull().references(() => users.id),

  // Auto-generated from first message content. Attorney can rename.
  title:         text('title'),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  transactionIdx: index('chat_sessions_transaction_id_idx').on(table.transactionId),
}))

// ------------------------------------------------------------
// CHAT MESSAGES
// Individual messages in a chat session.
// Immutable once created — no updated_at, no deleted_at.
// Citations stored as JSONB — always read as a whole, never queried by field.
//
// Citation JSONB shape (array):
//   [{ documentId, documentName, pageNumber, chunkId, relevanceScore, excerpt }]
//
// tokens_used and model_used tracked for cost monitoring.
// System prompts are never stored — constructed fresh on each request.
// ------------------------------------------------------------
export const chatMessages = pgTable('chat_messages', {
  id:         uuid('id').primaryKey().defaultRandom(),
  sessionId:  uuid('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  firmId:     uuid('firm_id').notNull().references(() => firms.id),

  role:       messageRoleEnum('role').notNull(), // USER or ASSISTANT only

  content:    text('content').notNull(),
  // Array of citation objects. Empty array [] when no citations (USER messages, fallback responses).
  citations:  jsonb('citations').notNull().default(sql`'[]'::jsonb`),

  tokensUsed: integer('tokens_used'),
  modelUsed:  text('model_used'),          // "claude-sonnet-4-6"

  // Immutable record — no updated_at, no deleted_at
  createdAt:  timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index('chat_messages_session_id_idx').on(table.sessionId),
}))

// ------------------------------------------------------------
// DRAFTS
// The container record for AI-generated documents. No content here.
// Content lives in draft_versions (immutable, append-only).
//
// CIRCULAR DEPENDENCY NOTE:
//   current_version_id references draft_versions, but draft_versions
//   references drafts (draft_id). This creates a circular FK that
//   cannot be expressed as a DB constraint cleanly.
//   Solution: current_version_id stored as plain uuid(), no .references().
//   Application enforces: current_version_id always points to a valid
//   draft_version that belongs to this draft.
//   This is the second (and last) column in the schema without a DB FK.
// ------------------------------------------------------------
export const drafts = pgTable('drafts', {
  id:               uuid('id').primaryKey().defaultRandom(),
  transactionId:    uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:           uuid('firm_id').notNull().references(() => firms.id),
  createdById:      uuid('created_by_id').notNull().references(() => users.id),
  approvedById:     uuid('approved_by_id').references(() => users.id),
  // No .references() — circular dep with draft_versions (see note above)
  currentVersionId: uuid('current_version_id'),

  type:             draftTypeEnum('type').notNull(),
  status:           draftStatusEnum('status').notNull().default('GENERATING'),

  // Auto-generated: "Amendment to Extend Closing Date — Martinez / Chen"
  title:            text('title').notNull(),
  // Attorney's instructions to the AI before generation.
  // "Extend closing date by 30 days due to financing delay. Reference Section 9."
  instructions:     text('instructions'),
  // Set when status = FAILED. Human-readable. "LLM returned malformed section structure"
  generationError:  text('generation_error'),

  approvedAt:       timestamp('approved_at'),
  // Set manually by attorney after they email the draft. No automated sending in Phase 1.
  sentAt:           timestamp('sent_at'),

  // ── Opinion 705 Compliance Fields ────────────────────────────────────
  // True for all drafts generated by CounselOS AI. Used for federal court
  // disclosure (Northern District Local Rule 7.2(f), Southern District GO 2025-04).
  wasAiAssisted:    boolean('was_ai_assisted').notNull().default(true),

  // Tracks section-by-section review enforcement.
  // total_sections_count: set when draft is first generated, equals section schema length.
  // sections_reviewed_count: incremented by attorney as they review each section.
  // Approval endpoint enforces: sections_reviewed_count must equal total_sections_count.
  totalSectionsCount:    integer('total_sections_count'),
  sectionsReviewedCount: integer('sections_reviewed_count').notNull().default(0),

  // Review timing — used for the "approved too fast" prompt.
  // If review_duration_seconds < 30, system asks attorney to confirm before approving.
  reviewStartedAt:       timestamp('review_started_at'),
  reviewDurationSeconds: integer('review_duration_seconds'),

  // Stored verbatim when attorney approves: "I have read, verified, and take
  // professional responsibility for this AI-generated document."
  // Timestamp of attestation = approved_at. Together these are the Opinion 705 record.
  approvalAttestationText: text('approval_attestation_text'),

  // Generated on demand. Follows Northern District of Texas Local Rule 7.2(f) format.
  // Includes attorney name, document title, generation date.
  aiDisclosureText: text('ai_disclosure_text'),
  // ─────────────────────────────────────────────────────────────────────

  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt:        timestamp('deleted_at'),
}, (table) => ({
  transactionIdx: index('drafts_transaction_id_idx').on(table.transactionId),
}))

// ------------------------------------------------------------
// DRAFT VERSIONS
// Immutable content versions of a draft.
// One row per version. New row on every attorney edit or AI generation.
// Attorney rollback: update drafts.current_version_id to an earlier version.
// No updated_at — versions never change after creation.
// No deleted_at — version history is permanent.
//
// sections JSONB shape (array of section objects):
// [
//   {
//     key: "AMENDMENT_TERMS",
//     title: "Amendment to Closing Date",
//     content: "The Closing Date referenced in Paragraph 9...",
//     ai_generated: true,
//     attorney_edited: false
//   }
// ]
// Defined section schemas per draft type live in:
//   src/modules/drafts/section-schemas.ts
// ------------------------------------------------------------
export const draftVersions = pgTable('draft_versions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  draftId:       uuid('draft_id').notNull().references(() => drafts.id, { onDelete: 'cascade' }),

  // Starts at 1, increments on every save (AI generation or attorney edit)
  versionNumber: integer('version_number').notNull(),
  // Full markdown content of this version
  content:       text('content').notNull(),
  // Structured section array for the attorney review UI.
  // Always read as a whole — stored as JSONB, not separate rows.
  sections:      jsonb('sections').notNull().default(sql`'[]'::jsonb`),
  generatedBy:   draftGeneratedByEnum('generated_by').notNull(),
  // Set when generated_by = USER (attorney edited)
  editedById:    uuid('edited_by_id').references(() => users.id),

  // Immutable record
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  draftVersionIdx: index('draft_versions_draft_id_version_idx')
    .on(table.draftId, table.versionNumber),
}))

// ------------------------------------------------------------
// LEADS
// Prospective clients before they become transactions.
// Separate from transactions — a lead may never convert.
// Two-layer duplicate prevention enforced in application:
//   Layer 1: Idempotency key (Redis) — prevents double-click duplicates
//   Layer 2: Time-window dedup (48h) — prevents re-submission duplicates
// ------------------------------------------------------------
export const leads = pgTable('leads', {
  id:                      uuid('id').primaryKey().defaultRandom(),
  firmId:                  uuid('firm_id').notNull().references(() => firms.id),
  assignedAttorneyId:      uuid('assigned_attorney_id').references(() => users.id),
  // Self-reference: when this submission is flagged as duplicate of an earlier lead
  duplicateOfId:           uuid('duplicate_of_id').references((): any => leads.id),
  // Set when status = CONVERTED. No .references() — not creating circular dependency,
  // but transactions may not exist yet when lead is created.
  convertedTransactionId:  uuid('converted_transaction_id'),

  leadStatus:              leadStatusEnum('lead_status').notNull().default('NEW'),

  firstName:               text('first_name').notNull(),
  lastName:                text('last_name').notNull(),
  // At least one of email or phone must be present — enforced at application layer
  email:                   text('email'),
  phone:                   text('phone'),               // normalized to E.164 on write
  transactionType:         transactionTypeEnum('transaction_type'),
  propertyAddress:         text('property_address'),
  // Preserved verbatim — what the prospective client told us
  inquiryDescription:      text('inquiry_description').notNull(),
  // 'intake_form', 'phone', 'referral', 'walk_in'
  source:                  text('source').notNull(),
  referralName:            text('referral_name'),

  // ── Referral Attribution ─────────────────────────────────────────────
  // Captured at intake. Copied to the transaction on conversion.
  referralSourceType: referralSourceTypeEnum('referral_source_type'),
  referralSourceName: text('referral_source_name'),
  // ─────────────────────────────────────────────────────────────────────

  // ── Conflict Check ───────────────────────────────────────────────────
  // Runs on lead creation. Searches party names against all existing
  // transaction parties. Must be CLEAR or REVIEWED before lead converts.
  // Required by Texas Rules 1.09/1.10.
  conflictCheckStatus:     text('conflict_check_status').notNull().default('PENDING'),
  // PENDING | CLEAR | FLAGGED | REVIEWED
  conflictCheckNotes:      text('conflict_check_notes'),
  conflictCheckCompletedAt: timestamp('conflict_check_completed_at'),
  // ────────────────────────────────────────────────────────────────────

  // Rate limiting reference and fraud detection
  ipAddress:               text('ip_address'),
  // Frontend-generated UUID sent with every submission.
  // Redis key: intake:idempotency:{key} — prevents double-click duplicates.
  idempotencyKey:          text('idempotency_key'),
  // Resubmission tracking: [{ submitted_at, ip_address }]
  // Also stores any other lead-level context not worth a dedicated column
  metadata:                jsonb('metadata').notNull().default(sql`'{}'::jsonb`),

  createdAt:               timestamp('created_at').notNull().defaultNow(),
  updatedAt:               timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt:               timestamp('deleted_at'),
}, (table) => ({
  firmStatusIdx:   index('leads_firm_id_status_idx').on(table.firmId, table.leadStatus),
  firmCreatedIdx:  index('leads_firm_id_created_at_idx').on(table.firmId, table.createdAt),
  // For duplicate detection query: WHERE firm_id = ? AND (email = ? OR phone = ?) AND created_at > ?
  emailIdx:        index('leads_email_idx').on(table.email),
  phoneIdx:        index('leads_phone_idx').on(table.phone),
}))

// ------------------------------------------------------------
// TRANSACTION ACTIVITIES
// Immutable append-only audit log of everything that happens
// on a transaction. No updated_at. No deleted_at.
// Facts cannot be edited or deleted — they are historical record.
//
// event_type: EventType constant from src/common/events/event-types.ts
// Never a raw string. Examples: 'transaction.status_changed', 'document.uploaded'
//
// Legal compliance events:
//   conflict.flagged           — conflict check found a matching party name
//   conflict.cleared           — conflict check returned no matches
//   conflict.reviewed          — attorney manually reviewed a FLAGGED conflict
//   draft.section_reviewed     — attorney marked a section as reviewed
//   draft.review_attested      — attorney submitted approval attestation
//   ai_disclosure.acknowledged — attorney confirmed client was informed of AI use
//   calendar.event_created     — calendar event pushed to attorney's calendar
//   calendar.event_updated     — calendar event updated after deadline change
//   calendar.event_deleted     — calendar event removed after deadline dismissed
//
// metadata JSONB shape varies by event_type:
//   transaction.status_changed: { from: 'UNDER_CONTRACT', to: 'DUE_DILIGENCE' }
//   document.uploaded:          { documentId, documentName, documentType }
//   deadline.confirmed:         { deadlineId, deadlineType, dueAt }
//   draft.approved:             { draftId, draftType, title }
//
// user_id is null for system-generated events:
//   document.ready (BullMQ worker), deadline.alert_sent (scheduler)
//
// WARNING: This table grows fast. Every document upload, deadline
// confirmation, status change, and chat session creates a row.
// Add a created_at index if dashboard activity feed becomes slow.
// Consider time-based partitioning in Phase 2.
// ------------------------------------------------------------
export const transactionActivities = pgTable('transaction_activities', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),
  // null for system-generated events (BullMQ workers, scheduler)
  userId:        uuid('user_id').references(() => users.id),

  // EventType constant — never a raw string
  eventType:     text('event_type').notNull(),
  // Human-readable. Written in code. Shown in the activity feed.
  // "Status changed from Under Contract to Due Diligence"
  // "Purchase Agreement uploaded by Sarah Kim"
  description:   text('description').notNull(),
  // Structured context. Shape varies per event_type (see above).
  metadata:      jsonb('metadata'),

  // Only timestamp on this table. Immutable record.
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Primary query: activity feed for a transaction, newest first
  transactionCreatedIdx: index('transaction_activities_transaction_id_created_at_idx')
    .on(table.transactionId, table.createdAt),
  // Event type filtering
  eventTypeIdx:          index('transaction_activities_event_type_idx').on(table.eventType),
}))


// ------------------------------------------------------------
// MATTER NOTES
// Replaces the single internal_notes text field on transactions.
// Individual timestamped journal entries — one per observation.
// Attorneys build a running narrative of a matter over time.
// Colleagues get up to speed by reading the note history.
// No edited_at — notes are immutable records, like a legal pad.
// ------------------------------------------------------------
export const matterNotes = pgTable('matter_notes', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),
  authorId:      uuid('author_id').notNull().references(() => users.id),

  content:       text('content').notNull(), // max 2,000 chars enforced by Zod
  // Clients never see matter notes — internal only

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  // No updated_at — notes are immutable. Mistakes get a new note.
  deletedAt:     timestamp('deleted_at'), // OWNER soft delete only
}, (table) => ({
  transactionIdx: index('matter_notes_transaction_id_created_at_idx')
    .on(table.transactionId, table.createdAt),
}))

// ------------------------------------------------------------
// COMMUNICATIONS
// Log of all communications related to a transaction.
// Phone calls, emails, meetings, texts — anything attorney-to-party.
// Free-text contact_name (not FK to parties) — attorneys communicate
// with people not in the system constantly. Friction here = no adoption.
// This is the institutional memory that survives when people leave.
// The AI chat queries recent communications alongside document chunks.
// ------------------------------------------------------------
export const communications = pgTable('communications', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),
  loggedById:    uuid('logged_by_id').notNull().references(() => users.id),

  type:          communicationTypeEnum('type').notNull(),
  direction:     communicationDirectionEnum('direction').notNull(),

  // Free text intentionally — see explanation above
  contactName:   text('contact_name').notNull(), // max 100 chars

  // What was said or decided. Not a transcript. 1-3 sentences.
  summary:       text('summary').notNull(), // max 500 chars

  // When the communication happened — not when it was logged.
  // Defaults to now(), attorney can backdate.
  occurredAt:    timestamp('occurred_at').notNull().defaultNow(),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  // No updated_at — communications are immutable records
  deletedAt:     timestamp('deleted_at'), // OWNER soft delete only
}, (table) => ({
  transactionIdx: index('communications_transaction_id_occurred_at_idx')
    .on(table.transactionId, table.occurredAt),
}))

// ------------------------------------------------------------
// DOCUMENT CHECKLIST ITEMS
// Tracks expected vs received documents per transaction.
// Auto-populated on transaction creation based on transaction_type.
// Auto-checked when a document of matching type finishes processing.
// PENDING → RECEIVED triggers automatically. WAIVED/NOT_APPLICABLE = manual.
//
// Why this matters: "Did we get the lender approval?" is currently answered
// by checking email. This answers it in one glance.
// ------------------------------------------------------------
export const documentChecklistItems = pgTable('document_checklist_items', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),

  name:          text('name').notNull(), // "Title Commitment", "Lender Approval Letter"

  // When set, auto-checks this item when a document of this type is uploaded.
  // Null for custom items or documents without a clean type mapping.
  documentType:  documentTypeEnum('document_type'),

  isRequired:    boolean('is_required').notNull().default(true),
  isSystemItem:  boolean('is_system_item').notNull().default(true),
  // System items cannot be deleted — only WAIVED or NOT_APPLICABLE.
  // Custom items (is_system_item = false) can be soft-deleted.

  status:        checklistItemStatusEnum('status').notNull().default('PENDING'),

  // Set automatically when a matching document reaches READY status.
  receivedAt:          timestamp('received_at'),
  receivedDocumentId:  uuid('received_document_id').references(() => documents.id),

  // Attorney notes: "Ordered from Independence Title June 5, expected June 18."
  notes:         text('notes'), // max 300 chars

  // Controls display order within a transaction.
  sortOrder:     integer('sort_order').notNull().default(0),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt:     timestamp('deleted_at'),
}, (table) => ({
  transactionIdx: index('document_checklist_items_transaction_id_idx')
    .on(table.transactionId, table.status),
}))

// ------------------------------------------------------------
// TASKS
// Internal work items attached to a transaction.
// Distinct from contractual deadlines — these are assignments:
// "Order title search", "Call lender to confirm approval",
// "Send amendment to opposing counsel".
// Overdue tasks surface in the morning dashboard alongside deadlines.
// ------------------------------------------------------------
export const tasks = pgTable('tasks', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),
  createdById:   uuid('created_by_id').notNull().references(() => users.id),
  assignedToId:  uuid('assigned_to_id').references(() => users.id), // nullable = unassigned

  taskStatus:    taskStatusEnum('task_status').notNull().default('OPEN'),
  priority:      taskPriorityEnum('priority').notNull().default('NORMAL'),

  title:         text('title').notNull(), // max 200 chars
  description:   text('description'), // max 1,000 chars

  dueAt:         timestamp('due_at'),
  completedAt:   timestamp('completed_at'),
  completedById: uuid('completed_by_id').references(() => users.id),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt:     timestamp('deleted_at'),
}, (table) => ({
  transactionStatusIdx: index('tasks_transaction_id_status_idx')
    .on(table.transactionId, table.taskStatus),
  assignedToIdx:        index('tasks_assigned_to_id_idx').on(table.assignedToId),
}))

// ------------------------------------------------------------
// TIME ENTRIES
// Billable hours logged against a transaction.
// Rate is snapshotted at creation — historical entries never change
// when an attorney's rate changes.
// Invoiced entries are immutable — no edits or deletes once billed.
// ------------------------------------------------------------
export const timeEntries = pgTable('time_entries', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),
  attorneyId:    uuid('attorney_id').notNull().references(() => users.id),

  description:   text('description').notNull(), // max 500 chars
  hours:         numeric('hours', { precision: 5, scale: 2 }).notNull(), // 0.25 minimum, max 24.00
  billingRate:   numeric('billing_rate', { precision: 8, scale: 2 }).notNull(), // snapshot at entry time
  totalAmount:   numeric('total_amount', { precision: 10, scale: 2 }).notNull(), // hours × billingRate

  entryDate:     timestamp('entry_date').notNull().defaultNow(), // when the work happened, not when logged
  invoiced:      boolean('invoiced').notNull().default(false),

  // ── Passive Time Capture ─────────────────────────────────────────────
  // MANUAL = attorney typed it. SUGGESTED = generated nightly from activity.
  source:           timeEntrySourceEnum('source').notNull().default('MANUAL'),
  // DRAFT = suggested, awaiting review. CONFIRMED = attorney accepted.
  // DRAFT entries NEVER appear in invoices. Auto-deleted after 14 days.
  entryStatus:      timeEntryStatusEnum('entry_status').notNull().default('CONFIRMED'),
  // Which activity produced this suggestion. Null for manual entries.
  sourceActivityId: uuid('source_activity_id').references(() => transactionActivities.id),
  // ─────────────────────────────────────────────────────────────────────

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt:     timestamp('deleted_at'),
}, (table) => ({
  transactionInvoicedIdx: index('time_entries_transaction_id_invoiced_idx')
    .on(table.transactionId, table.invoiced),
  attorneyIdx:            index('time_entries_attorney_id_idx').on(table.attorneyId),
}))

// ------------------------------------------------------------
// INVOICES
// PDF invoices generated from time entries.
// line_items is a JSONB snapshot — invoices are historical records,
// not live references to time entries.
// Attorney downloads PDF and emails it manually in Phase 1.
// ------------------------------------------------------------
export const invoices = pgTable('invoices', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),

  // Partial unique index (excluding deleted) in manual migration
  invoiceNumber: text('invoice_number').notNull(), // INV-2025-0042

  clientName:    text('client_name').notNull(), // copied from transaction buyer, editable
  clientEmail:   text('client_email'),

  // Snapshot of time entries at invoice creation — not live FK references.
  // Invoices are historical records. Time entries may change. The invoice does not.
  lineItems:     jsonb('line_items').notNull().default(sql`'[]'::jsonb`),
  // Shape: [{ description, hours, rate, amount }]

  subtotal:      numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
  taxRate:       numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0'),
  taxAmount:     numeric('tax_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  totalAmount:   numeric('total_amount', { precision: 10, scale: 2 }).notNull(),

  status:        invoiceStatusEnum('status').notNull().default('DRAFT'),
  notes:         text('notes'), // appears on the PDF

  // Set after PDF generation — Supabase Storage key
  pdfStorageKey: text('pdf_storage_key'),

  sentAt:        timestamp('sent_at'),
  paidAt:        timestamp('paid_at'),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt:     timestamp('deleted_at'),
})

// ------------------------------------------------------------
// CLIENT ACCESS TOKENS
// Replaces the full Supabase Auth magic link flow for clients.
// No user accounts. No passwords. No CLIENT role in Phase 1.
// A signed HMAC URL gives read-only access to one transaction.
// 256-bit raw token, only the SHA-256 hash stored in the database.
// 30-day expiry. Revocable by attorney.
// ------------------------------------------------------------
export const clientAccessTokens = pgTable('client_access_tokens', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),

  clientEmail:   text('client_email').notNull(),
  // Raw token is never stored. Only SHA-256(rawToken) is stored.
  // If DB is compromised, tokens cannot be reversed.
  tokenHash:     text('token_hash').notNull(),

  expiresAt:     timestamp('expires_at').notNull(), // now() + 30 days
  revoked:       boolean('revoked').notNull().default(false),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
})


// ------------------------------------------------------------
// HOLIDAYS
// Texas state + federal holidays, maintained years forward.
// Read by the TREC deadline calculation engine to apply roll rules.
// ------------------------------------------------------------
export const holidays = pgTable('holidays', {
  id:           uuid('id').primaryKey().defaultRandom(),
  date:         timestamp('date').notNull(),
  name:         text('name').notNull(),        // "Juneteenth", "Thanksgiving"
  jurisdiction: text('jurisdiction').notNull(), // FEDERAL | TX_STATE | COUNTY
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  dateIdx: index('holidays_date_idx').on(table.date),
}))

// ------------------------------------------------------------
// VERIFIED WIRE INSTRUCTIONS
// The trusted baseline for a title company's wire instructions.
// Any future instructions that differ from the active baseline are flagged.
// Account numbers NEVER stored raw — only last 4 + SHA-256 hash, matching
// the client_access_tokens convention. Routing numbers are public bank data.
// ------------------------------------------------------------
export const verifiedWireInstructions = pgTable('verified_wire_instructions', {
  id:              uuid('id').primaryKey().defaultRandom(),
  transactionId:   uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:          uuid('firm_id').notNull().references(() => firms.id),
  partyId:         uuid('party_id').references(() => parties.id),
  verifiedById:    uuid('verified_by_id').notNull().references(() => users.id),

  institutionName: text('institution_name').notNull(),
  routingNumber:   text('routing_number').notNull(), // public bank data — safe to store
  accountLast4:    text('account_last4').notNull(),   // display only
  accountHash:     text('account_hash').notNull(),    // SHA-256 of full account number

  verificationMethod: wireVerificationMethodEnum('verification_method').notNull(),
  verificationNotes:  text('verification_notes'),

  // Only one active baseline per party per transaction
  isActive:        boolean('is_active').notNull().default(true),

  verifiedAt:      timestamp('verified_at').notNull().defaultNow(),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  deletedAt:       timestamp('deleted_at'),
}, (table) => ({
  transactionPartyIdx: index('verified_wire_instructions_transaction_party_idx')
    .on(table.transactionId, table.partyId),
}))

// ------------------------------------------------------------
// WIRE FLAG EVENTS
// Every time wire instructions are flagged — no baseline, or mismatch.
// This is the audit trail: what was detected, when, and how it resolved.
// ------------------------------------------------------------
export const wireFlagEvents = pgTable('wire_flag_events', {
  id:              uuid('id').primaryKey().defaultRandom(),
  transactionId:   uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:          uuid('firm_id').notNull().references(() => firms.id),
  sourceDocumentId: uuid('source_document_id').references(() => documents.id),

  detectedRoutingNumber: text('detected_routing_number'),
  detectedAccountLast4:  text('detected_account_last4'),
  flagType:        text('flag_type').notNull(), // NO_BASELINE | MISMATCH

  resolvedById:    uuid('resolved_by_id').references(() => users.id),
  resolution:      text('resolution'), // VERIFIED_LEGITIMATE | CONFIRMED_FRAUD | DISMISSED
  resolutionNotes: text('resolution_notes'),
  resolvedAt:      timestamp('resolved_at'),

  createdAt:       timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  transactionIdx: index('wire_flag_events_transaction_id_idx').on(table.transactionId),
}))


// ------------------------------------------------------------
// MATTER ACCESS
// Grants a user access to a matter beyond the two assignment fields.
// Covers vacation coverage, second-chairing, paralegal reassignment —
// without changing ownership of the matter.
// Resolution order: OWNER → assigned attorney → assigned paralegal →
// matter_access row → ATTORNEY read-only → denied.
// ------------------------------------------------------------
export const matterAccess = pgTable('matter_access', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),
  userId:        uuid('user_id').notNull().references(() => users.id),
  grantedById:   uuid('granted_by_id').notNull().references(() => users.id),
  // Optional expiry for temporary coverage
  expiresAt:     timestamp('expires_at'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  txUserIdx: uniqueIndex('matter_access_transaction_user_idx')
    .on(table.transactionId, table.userId),
}))

// ------------------------------------------------------------
// CLIENT MESSAGES
// Two-way messaging on the client portal.
// NO client accounts — the client is authenticated by the same signed
// token that gives them read access. senderName comes from the token.
//
// HARD RULE: the AI never auto-responds. An attorney composes every
// outbound reply. Auto-response would be UPL and an Opinion 705 violation.
//
// Every message also writes to the communication log (type CLIENT_PORTAL),
// so two-way messaging feeds institutional memory and AI chat context.
// ------------------------------------------------------------
export const clientMessages = pgTable('client_messages', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),

  direction:     messageDirectionEnum('direction').notNull(),
  // OUTBOUND: the attorney who sent it. Null for INBOUND.
  senderUserId:  uuid('sender_user_id').references(() => users.id),
  // INBOUND: client name from the access token. Null for OUTBOUND.
  senderName:    text('sender_name'),

  body:          text('body').notNull(),  // max 2,000 chars enforced by Zod
  readAt:        timestamp('read_at'),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  deletedAt:     timestamp('deleted_at'),
}, (table) => ({
  txIdx: index('client_messages_transaction_id_created_at_idx')
    .on(table.transactionId, table.createdAt),
}))


// ------------------------------------------------------------
// ACCESS LOG
// Read-access audit trail. Distinct from transaction_activities, which logs
// ACTIONS. This logs VIEWS — who saw which matter and when.
//
// For a system holding privileged client material, read access matters as
// much as writes: it proves matter-level access control is working, and it
// answers "who looked at this file?" if that is ever asked.
//
// Written from an interceptor, never from individual controllers — one place,
// no chance a route forgets.
//
// HIGH VOLUME — grows faster than any other table. Partition by month in
// Phase 2. Retain 2 years, then purge.
// ------------------------------------------------------------
export const accessLog = pgTable('access_log', {
  id:            uuid('id').primaryKey().defaultRandom(),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),
  userId:        uuid('user_id').notNull().references(() => users.id),
  transactionId: uuid('transaction_id').references(() => transactions.id),

  // transaction.viewed | document.downloaded | search.performed
  // | client_portal.accessed | export.generated
  action:        text('action').notNull(),
  resourceId:    uuid('resource_id'),
  ipAddress:     text('ip_address'),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  firmCreatedIdx: index('access_log_firm_id_created_at_idx').on(table.firmId, table.createdAt),
  txIdx:          index('access_log_transaction_id_idx').on(table.transactionId),
}))

// ============================================================
// RELATIONS
// Drizzle relations — for type-safe .with() join syntax.
// These do NOT create DB constraints (that's done by .references() above).
// Both must exist: .references() for DB integrity, relations() for DX.
// ============================================================

export const firmsRelations = relations(firms, ({ many }) => ({
  users:         many(users),
  transactions:  many(transactions),
  leads:         many(leads),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  firm:                    one(firms, { fields: [users.firmId], references: [firms.id] }),
  invitedBy:               one(users, { fields: [users.invitedById], references: [users.id], relationName: 'invited_by' }),
  assignedTransactions:    many(transactions, { relationName: 'assigned_attorney' }),
  paralegalTransactions:   many(transactions, { relationName: 'assigned_paralegal' }),
  confirmedDeadlines:      many(deadlines),
  approvedDrafts:          many(drafts, { relationName: 'approved_by' }),
  createdDrafts:           many(drafts, { relationName: 'created_by' }),
  uploadedDocuments:       many(documents),
  persistentNotifications: many(persistentNotifications),
}))

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  firm:              one(firms, { fields: [transactions.firmId], references: [firms.id] }),
  assignedAttorney:  one(users, { fields: [transactions.assignedAttorneyId], references: [users.id], relationName: 'assigned_attorney' }),
  assignedParalegal: one(users, { fields: [transactions.assignedParalegalId], references: [users.id], relationName: 'assigned_paralegal' }),
  clientUser:        one(users, { fields: [transactions.clientUserId], references: [users.id] }),
  parties:           many(parties),
  documents:         many(documents),
  deadlines:         many(deadlines),
  chatSessions:      many(chatSessions),
  drafts:            many(drafts),
  activities:        many(transactionActivities),
  matterNotes:       many(matterNotes),
  communications:    many(communications),
  checklistItems:    many(documentChecklistItems),
  tasks:             many(tasks),
  timeEntries:       many(timeEntries),
  invoices:          many(invoices),
  clientAccessTokens: many(clientAccessTokens),
  verifiedWireInstructions: many(verifiedWireInstructions),
  wireFlagEvents:    many(wireFlagEvents),
  matterAccess:      many(matterAccess),
  clientMessages:    many(clientMessages),
}))

export const partiesRelations = relations(parties, ({ one }) => ({
  transaction: one(transactions, { fields: [parties.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [parties.firmId], references: [firms.id] }),
}))

export const documentsRelations = relations(documents, ({ one, many }) => ({
  transaction:  one(transactions, { fields: [documents.transactionId], references: [transactions.id] }),
  firm:         one(firms, { fields: [documents.firmId], references: [firms.id] }),
  uploadedBy:   one(users, { fields: [documents.uploadedById], references: [users.id] }),
  chunks:       many(documentChunks),
  deadlines:    many(deadlines, { relationName: 'source_document' }),
}))

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, { fields: [documentChunks.documentId], references: [documents.id] }),
}))

export const deadlinesRelations = relations(deadlines, ({ one }) => ({
  transaction:     one(transactions, { fields: [deadlines.transactionId], references: [transactions.id] }),
  firm:            one(firms, { fields: [deadlines.firmId], references: [firms.id] }),
  sourceDocument:  one(documents, { fields: [deadlines.sourceDocumentId], references: [documents.id], relationName: 'source_document' }),
  supersededBy:    one(deadlines, { fields: [deadlines.supersededById], references: [deadlines.id], relationName: 'superseded_by' }),
  supersedes:      one(deadlines, { fields: [deadlines.supersedesId], references: [deadlines.id], relationName: 'supersedes' }),
  confirmedBy:     one(users, { fields: [deadlines.confirmedById], references: [users.id] }),
}))

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  transaction: one(transactions, { fields: [chatSessions.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [chatSessions.firmId], references: [firms.id] }),
  createdBy:   one(users, { fields: [chatSessions.createdById], references: [users.id] }),
  messages:    many(chatMessages),
}))

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, { fields: [chatMessages.sessionId], references: [chatSessions.id] }),
  firm:    one(firms, { fields: [chatMessages.firmId], references: [firms.id] }),
}))

export const draftsRelations = relations(drafts, ({ one, many }) => ({
  transaction:    one(transactions, { fields: [drafts.transactionId], references: [transactions.id] }),
  firm:           one(firms, { fields: [drafts.firmId], references: [firms.id] }),
  createdBy:      one(users, { fields: [drafts.createdById], references: [users.id], relationName: 'created_by' }),
  approvedBy:     one(users, { fields: [drafts.approvedById], references: [users.id], relationName: 'approved_by' }),
  versions:       many(draftVersions),
}))

export const draftVersionsRelations = relations(draftVersions, ({ one }) => ({
  draft:     one(drafts, { fields: [draftVersions.draftId], references: [drafts.id] }),
  editedBy:  one(users, { fields: [draftVersions.editedById], references: [users.id] }),
}))

export const leadsRelations = relations(leads, ({ one }) => ({
  firm:                 one(firms, { fields: [leads.firmId], references: [firms.id] }),
  assignedAttorney:     one(users, { fields: [leads.assignedAttorneyId], references: [users.id] }),
  duplicateOf:          one(leads, { fields: [leads.duplicateOfId], references: [leads.id] }),
}))

export const persistentNotificationsRelations = relations(persistentNotifications, ({ one }) => ({
  user: one(users, { fields: [persistentNotifications.userId], references: [users.id] }),
  firm: one(firms, { fields: [persistentNotifications.firmId], references: [firms.id] }),
}))

export const transactionActivitiesRelations = relations(transactionActivities, ({ one }) => ({
  transaction: one(transactions, { fields: [transactionActivities.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [transactionActivities.firmId], references: [firms.id] }),
  user:        one(users, { fields: [transactionActivities.userId], references: [users.id] }),
}))


export const matterNotesRelations = relations(matterNotes, ({ one }) => ({
  transaction: one(transactions, { fields: [matterNotes.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [matterNotes.firmId], references: [firms.id] }),
  author:      one(users, { fields: [matterNotes.authorId], references: [users.id] }),
}))

export const communicationsRelations = relations(communications, ({ one }) => ({
  transaction: one(transactions, { fields: [communications.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [communications.firmId], references: [firms.id] }),
  loggedBy:    one(users, { fields: [communications.loggedById], references: [users.id] }),
}))

export const documentChecklistItemsRelations = relations(documentChecklistItems, ({ one }) => ({
  transaction:      one(transactions, { fields: [documentChecklistItems.transactionId], references: [transactions.id] }),
  firm:             one(firms, { fields: [documentChecklistItems.firmId], references: [firms.id] }),
  receivedDocument: one(documents, { fields: [documentChecklistItems.receivedDocumentId], references: [documents.id] }),
}))

export const tasksRelations = relations(tasks, ({ one }) => ({
  transaction:  one(transactions, { fields: [tasks.transactionId], references: [transactions.id] }),
  firm:         one(firms, { fields: [tasks.firmId], references: [firms.id] }),
  createdBy:    one(users, { fields: [tasks.createdById], references: [users.id] }),
  assignedTo:   one(users, { fields: [tasks.assignedToId], references: [users.id], relationName: 'task_assignee' }),
  completedBy:  one(users, { fields: [tasks.completedById], references: [users.id], relationName: 'task_completer' }),
}))

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  transaction: one(transactions, { fields: [timeEntries.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [timeEntries.firmId], references: [firms.id] }),
  attorney:    one(users, { fields: [timeEntries.attorneyId], references: [users.id] }),
}))

export const invoicesRelations = relations(invoices, ({ one }) => ({
  transaction: one(transactions, { fields: [invoices.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [invoices.firmId], references: [firms.id] }),
}))

export const clientAccessTokensRelations = relations(clientAccessTokens, ({ one }) => ({
  transaction: one(transactions, { fields: [clientAccessTokens.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [clientAccessTokens.firmId], references: [firms.id] }),
}))


export const verifiedWireInstructionsRelations = relations(verifiedWireInstructions, ({ one }) => ({
  transaction: one(transactions, { fields: [verifiedWireInstructions.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [verifiedWireInstructions.firmId], references: [firms.id] }),
  party:       one(parties, { fields: [verifiedWireInstructions.partyId], references: [parties.id] }),
  verifiedBy:  one(users, { fields: [verifiedWireInstructions.verifiedById], references: [users.id] }),
}))

export const wireFlagEventsRelations = relations(wireFlagEvents, ({ one }) => ({
  transaction:    one(transactions, { fields: [wireFlagEvents.transactionId], references: [transactions.id] }),
  firm:           one(firms, { fields: [wireFlagEvents.firmId], references: [firms.id] }),
  sourceDocument: one(documents, { fields: [wireFlagEvents.sourceDocumentId], references: [documents.id] }),
  resolvedBy:     one(users, { fields: [wireFlagEvents.resolvedById], references: [users.id] }),
}))


export const matterAccessRelations = relations(matterAccess, ({ one }) => ({
  transaction: one(transactions, { fields: [matterAccess.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [matterAccess.firmId], references: [firms.id] }),
  user:        one(users, { fields: [matterAccess.userId], references: [users.id] }),
  grantedBy:   one(users, { fields: [matterAccess.grantedById], references: [users.id], relationName: 'access_granter' }),
}))

export const clientMessagesRelations = relations(clientMessages, ({ one }) => ({
  transaction: one(transactions, { fields: [clientMessages.transactionId], references: [transactions.id] }),
  firm:        one(firms, { fields: [clientMessages.firmId], references: [firms.id] }),
  sender:      one(users, { fields: [clientMessages.senderUserId], references: [users.id] }),
}))

export const accessLogRelations = relations(accessLog, ({ one }) => ({
  firm:        one(firms, { fields: [accessLog.firmId], references: [firms.id] }),
  user:        one(users, { fields: [accessLog.userId], references: [users.id] }),
  transaction: one(transactions, { fields: [accessLog.transactionId], references: [transactions.id] }),
}))

// ============================================================
// TYPE EXPORTS
// Inferred TypeScript types from the schema.
// Use these everywhere — never manually define entity types.
// Insert types enforce required fields at compile time.
// Select types give you the full row shape after a query.
// ============================================================

export type Firm                     = typeof firms.$inferSelect
export type NewFirm                  = typeof firms.$inferInsert

export type User                     = typeof users.$inferSelect
export type NewUser                  = typeof users.$inferInsert

export type Transaction              = typeof transactions.$inferSelect
export type NewTransaction           = typeof transactions.$inferInsert

export type Party                    = typeof parties.$inferSelect
export type NewParty                 = typeof parties.$inferInsert

export type Document                 = typeof documents.$inferSelect
export type NewDocument              = typeof documents.$inferInsert

export type DocumentChunk            = typeof documentChunks.$inferSelect
export type NewDocumentChunk         = typeof documentChunks.$inferInsert

export type Deadline                 = typeof deadlines.$inferSelect
export type NewDeadline              = typeof deadlines.$inferInsert

export type ChatSession              = typeof chatSessions.$inferSelect
export type NewChatSession           = typeof chatSessions.$inferInsert

export type ChatMessage              = typeof chatMessages.$inferSelect
export type NewChatMessage           = typeof chatMessages.$inferInsert

export type Draft                    = typeof drafts.$inferSelect
export type NewDraft                 = typeof drafts.$inferInsert

export type DraftVersion             = typeof draftVersions.$inferSelect
export type NewDraftVersion          = typeof draftVersions.$inferInsert

export type Lead                     = typeof leads.$inferSelect
export type NewLead                  = typeof leads.$inferInsert

export type EmailJob                 = typeof emailJobs.$inferSelect
export type NewEmailJob              = typeof emailJobs.$inferInsert

export type PersistentNotification   = typeof persistentNotifications.$inferSelect
export type NewPersistentNotification = typeof persistentNotifications.$inferInsert

export type TransactionActivity      = typeof transactionActivities.$inferSelect
export type NewTransactionActivity   = typeof transactionActivities.$inferInsert
```

---

## Migration Notes

These indexes and constraints **cannot be generated by `drizzle-kit`**. They must be added as raw SQL in a manual migration file after the initial schema migration runs.

Create `drizzle/migrations/0002_manual_indexes.sql`:

```sql
-- ============================================================
-- HNSW Vector Index
-- Required for pgvector similarity search performance.
-- Build time: fast at Phase 1 scale. Rebuild if adding millions of rows.
-- ef_search = 40 is set at QUERY TIME, not here.
-- ============================================================
CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);


-- ============================================================
-- Partial Unique Indexes (exclude soft-deleted records)
-- Standard unique constraints would prevent reusing a transaction_number
-- even after soft delete. Partial indexes scope uniqueness to active records.
-- ============================================================

-- transaction_number must be unique per firm among active transactions
CREATE UNIQUE INDEX IF NOT EXISTS transactions_transaction_number_active_key
ON transactions (firm_id, transaction_number)
WHERE deleted_at IS NULL;

-- email must be unique per firm among active users
CREATE UNIQUE INDEX IF NOT EXISTS users_email_firm_active_key
ON users (firm_id, email)
WHERE TRUE; -- users have no deleted_at, but partial index pattern is consistent

-- auth_id must be globally unique (Supabase Auth UUID)
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_id_active_key
ON users (auth_id)
WHERE auth_id IS NOT NULL; -- null until user first authenticates


-- ============================================================
-- Full-Text Search (tsvector generated columns + GIN indexes)
-- Add these in the FIRST migration even if the search UI ships later.
-- Adding a generated column to a table with a year of data means a full
-- table rewrite and a painful backfill. On an empty table it costs nothing.
--
-- This is KEYWORD search. It complements pgvector semantic search — it does
-- not replace it. Vector answers "what does the contract say about
-- financing?"; full-text answers "find the message where Maria mentioned
-- the wire."
-- ============================================================

ALTER TABLE communications ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(contact_name,'') || ' ' || coalesce(summary,''))
  ) STORED;
CREATE INDEX IF NOT EXISTS communications_search_idx
  ON communications USING GIN (search_vector);

ALTER TABLE matter_notes ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED;
CREATE INDEX IF NOT EXISTS matter_notes_search_idx
  ON matter_notes USING GIN (search_vector);

ALTER TABLE document_chunks ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED;
CREATE INDEX IF NOT EXISTS document_chunks_search_idx
  ON document_chunks USING GIN (search_vector);


-- ============================================================
-- Additional Composite Indexes
-- These improve specific query patterns not covered by the
-- table-level index() definitions in schema.ts.
-- ============================================================

-- Soft delete filter: every list query adds WHERE deleted_at IS NULL
-- Partial index makes these scans dramatically faster at scale
CREATE INDEX IF NOT EXISTS transactions_active_idx
ON transactions (firm_id, status)
WHERE deleted_at IS NULL AND is_archived = FALSE;

CREATE INDEX IF NOT EXISTS documents_active_idx
ON documents (transaction_id, type)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS deadlines_active_idx
ON deadlines (firm_id, urgency, due_at)
WHERE status = 'ACTIVE' AND deleted_at IS NULL AND superseded_by_id IS NULL;
```

---

## Phase 2 Tables — Not in This Schema Yet

The following tables will be added in Phase 2 migrations when expanding to PI firms and multi-tenant SaaS. They are designed but not included in `schema.ts` until needed.

**PI-specific tables:**
- `case_dna` — structured extraction and scoring (versioned, append-only)
- `arbitrage_predictions` — settlement predictions (immutable)
- `case_outcomes` — closed case results and platform fee calculation
- `judges` — global behavioral fingerprints (shared across all firms)
- `opposing_counsel` — global behavioral fingerprints
- `carriers` — global behavioral fingerprints

**SaaS operational tables:**
- `time_entries` — billable time tracking with AI suggestions
- `invoices` and `invoice_line_items` — client billing
- `playbooks` and `playbook_steps` — firm workflow templates
- `subscriptions` — Stripe subscription tracking

**Multi-tenancy additions to existing tables:**
- RLS policies enabled on all tables (currently written but not enforced)
- `firm_id` in JWT payload (currently hardcoded in env config)
- `plan` column added to `firms` (STARTER, GROWTH, PARTNER)
- `stripe_customer_id` and `stripe_subscription_id` added to `firms`

---

## Soft Delete Query Pattern

The soft-delete middleware from Prisma does not exist in Drizzle. Every repository list method must explicitly include the soft delete filter. Don't rely on remembering it: repositories extend a base class whose list methods apply `notDeleted` by default, and any hand-written `where` in a list query is a review item. See `18-nestjs-conventions.md` §5.

```typescript
// src/database/helpers.ts
import { isNull } from 'drizzle-orm'
import { transactions, documents, deadlines, drafts, leads } from './schema'

// Use this in every list query on soft-deleteable tables
export const notDeleted = {
  transactions: isNull(transactions.deletedAt),
  documents:    isNull(documents.deletedAt),
  deadlines:    isNull(deadlines.deletedAt),
  drafts:       isNull(drafts.deletedAt),
  leads:        isNull(leads.deletedAt),
}

// Usage in a repository:
// const result = await db
//   .select()
//   .from(transactions)
//   .where(and(eq(transactions.firmId, firmId), notDeleted.transactions))
```

---

## Vector Search Pattern

The standard pgvector query pattern used in `DocumentChunksRepository`:

```typescript
import { sql, and, eq, gt } from 'drizzle-orm'
import { documentChunks } from '../schema'

// Relevance threshold: 0.70 (1 - cosine distance)
// ef_search: 40 (set per-transaction for recall/speed balance)
// Pre-filter runs BEFORE vector scan — critical for performance

await db.execute(sql`SET hnsw.ef_search = 40`)

const results = await db
  .select({
    id:            documentChunks.id,
    content:       documentChunks.content,
    pageNumber:    documentChunks.pageNumber,
    tokenCount:    documentChunks.tokenCount,
    documentId:    documentChunks.documentId,
    similarity:    sql<number>`1 - (${documentChunks.embedding} <=> ${queryEmbedding}::vector)`,
  })
  .from(documentChunks)
  .where(
    and(
      eq(documentChunks.transactionId, transactionId),
      eq(documentChunks.firmId, firmId),
      // Relevance threshold — discard low-similarity chunks before LLM sees them
      sql`1 - (${documentChunks.embedding} <=> ${queryEmbedding}::vector) > 0.70`,
    )
  )
  .orderBy(sql`${documentChunks.embedding} <=> ${queryEmbedding}::vector`)
  .limit(20) // candidate pool before token budget filtering
```

---

*15 tables. 2 circular FK exceptions documented. All enums Postgres-level enforced.
Partial indexes in separate migration. HNSW index in separate migration.
Phase 2 tables documented but not included.*


export type MatterNote                  = typeof matterNotes.$inferSelect
export type NewMatterNote               = typeof matterNotes.$inferInsert

export type Communication               = typeof communications.$inferSelect
export type NewCommunication            = typeof communications.$inferInsert

export type DocumentChecklistItem       = typeof documentChecklistItems.$inferSelect
export type NewDocumentChecklistItem    = typeof documentChecklistItems.$inferInsert

export type Task                        = typeof tasks.$inferSelect
export type NewTask                     = typeof tasks.$inferInsert

export type TimeEntry                   = typeof timeEntries.$inferSelect
export type NewTimeEntry                = typeof timeEntries.$inferInsert

export type Invoice                     = typeof invoices.$inferSelect
export type NewInvoice                  = typeof invoices.$inferInsert

export type ClientAccessToken           = typeof clientAccessTokens.$inferSelect
export type NewClientAccessToken        = typeof clientAccessTokens.$inferInsert


export type Holiday                      = typeof holidays.$inferSelect
export type NewHoliday                   = typeof holidays.$inferInsert

export type VerifiedWireInstruction      = typeof verifiedWireInstructions.$inferSelect
export type NewVerifiedWireInstruction   = typeof verifiedWireInstructions.$inferInsert

export type WireFlagEvent                = typeof wireFlagEvents.$inferSelect
export type NewWireFlagEvent             = typeof wireFlagEvents.$inferInsert

export type MatterAccess        = typeof matterAccess.$inferSelect
export type NewMatterAccess     = typeof matterAccess.$inferInsert

export type ClientMessage       = typeof clientMessages.$inferSelect
export type NewClientMessage    = typeof clientMessages.$inferInsert

export type AccessLog     = typeof accessLog.$inferSelect
export type NewAccessLog  = typeof accessLog.$inferInsert
