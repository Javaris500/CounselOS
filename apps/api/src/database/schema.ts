import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CHECKLIST_ITEM_STATUSES,
  COMMUNICATION_DIRECTIONS,
  COMMUNICATION_TYPES,
  DEADLINE_STATUSES,
  DEADLINE_TYPES,
  DEADLINE_URGENCIES,
  DOCUMENT_PROCESSING_STATUSES,
  DOCUMENT_TYPES,
  DRAFT_GENERATED_BY,
  DRAFT_STATUSES,
  DRAFT_TYPES,
  EMAIL_JOB_STATUSES,
  INVOICE_STATUSES,
  LEAD_STATUSES,
  MESSAGE_DIRECTIONS,
  MESSAGE_ROLES,
  OUTCOME_REASONS,
  PARTY_ROLES,
  PARTY_TYPES,
  REFERRAL_SOURCE_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TIME_ENTRY_SOURCES,
  TIME_ENTRY_STATUSES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  USER_ROLES,
  WIRE_VERIFICATION_METHODS,
} from '@counselos/shared';

/**
 * THE SCHEMA — single source of truth for data shape (03-schema.md).
 *
 * Never hand-write an entity type. Infer it:
 *     type Transaction = typeof transactions.$inferSelect;
 *     type NewTransaction = typeof transactions.$inferInsert;
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENUMS FIRST, AND THEY DERIVE FROM packages/shared.
 *
 * The value arrays live in @counselos/shared and both apps import them, so a
 * Postgres enum, the API's validation, and the frontend's dropdown are the same
 * list by construction (02-repo-structure.md). Adding a value means editing
 * shared — which produces a compile error anywhere that switches exhaustively,
 * exactly as intended.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * COLUMN ORDER within every table (03-schema.md):
 *   id → firm_id → primary parent FK → secondary FKs → role-based user FKs →
 *   enums → required strings → optional strings → numerics → domain dates →
 *   booleans → jsonb/arrays → created_at/updated_at → deleted_at (last)
 *
 * TWO COLUMNS DELIBERATELY HAVE NO FOREIGN KEY, both circular:
 *   users.transaction_id      (users → transactions → users)
 *   drafts.current_version_id (drafts → draft_versions → drafts)
 * Postgres can express these only with deferred constraints. The application
 * maintains both. A third exception is a design smell, not a precedent.
 * (leads.converted_transaction_id and document_chunks.transaction_id/firm_id
 * are also FK-less, for the different reasons documented at each.)
 *
 * DEVIATIONS FROM 03-schema.md, all deliberate — the doc is updated to match
 * in the same commit:
 *   1. email_jobs added. The doc exports its type and ships its enum but never
 *      defines the table; columns come from 05-backend-checklist.md §9D.
 *   2. users.notification_opted_out added — CAN-SPAM (05 §9F) checks it before
 *      every send, and the doc has no column to check.
 *   3. persistent_notifications NOT created. The doc has a relations() block
 *      and type exports for it; 05 §9H states twice that Phase 1 has no such
 *      table — the deadline dashboard is the notification center.
 *   4. transactions.client_user_id NOT added. The doc references it in
 *      relations only; client access is a signed HMAC token
 *      (client_access_tokens), and no CLIENT accounts exist in Phase 1.
 *   5. $onUpdate(() => sql`now()`) instead of the doc's `new Date()`, which
 *      ESLint bans outside the clock seam. Postgres owning the timestamp also
 *      removes app/DB clock skew.
 *   6. Table extra-config uses the array form; the object form the doc shows is
 *      deprecated in drizzle-orm 0.45.
 *   7. EVERY timestamp is `timestamptz`, where the doc specified `timestamp`.
 *      See below — this one is load-bearing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY timestamptz EVERYWHERE, WITHOUT EXCEPTION
 *
 * `timestamp` stores no zone. It is a wall-clock reading with no anchor, so its
 * meaning depends entirely on every writer agreeing, forever, on which zone was
 * meant — an agreement nothing in the database enforces. `timestamptz` stores a
 * real instant: Postgres converts to UTC on write and back to the session zone
 * on read.
 *
 * This is not a style preference in a product whose core feature is Texas
 * business-day deadline math. With `timestamp`, a deadline written by the HTTP
 * process on Railway (UTC) and one written by an attorney's browser (Central)
 * are stored as different instants while looking identical, and the option-fee
 * vs earnest-money weekend divergence — the thing slice 3's Playwright gate
 * asserts — silently computes off by a day near midnight.
 *
 * Chosen while every table is empty. Converting later is a full table rewrite
 * plus a judgment call about what the already-stored values were supposed to
 * mean, which is exactly the kind of decision nobody can make honestly a year
 * in.
 *
 * ONE EXCEPTION, deliberate: holidays.date is a Postgres `date`. A holiday is a
 * calendar date, not an instant, and the TREC engine compares calendar dates.
 * See the note on that table — it is the only non-timestamptz temporal column
 * in the schema.
 *
 * STILL OPEN: transactions.closing_date / effective_date / option_period_expiry
 * are arguably calendar dates too. They are left as timestamptz because they
 * are attorney-entered and read back in one firm timezone, so the ambiguity is
 * contained — unlike holidays, which the date engine reads on every
 * calculation. Revisit if the TREC engine ends up doing zone gymnastics to
 * compare them. Flagged in 03-schema.md.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * HAND-WRITTEN SQL lives in migration 0002 — drizzle-kit cannot express the
 * HNSW index, partial-unique indexes, or tsvector generated columns.
 */

// ============================================================
// CUSTOM TYPES
// ============================================================

/**
 * pgvector column. Requires the `vector` extension, which the local compose
 * stack, the test containers, and Supabase all enable.
 *
 * The HNSW index is created in migration 0002 — drizzle-kit cannot generate it.
 */
export const vector = customType<{
  data: number[];
  config: { dimensions: number };
  configRequired: true;
  driverData: string;
}>({
  dataType(config) {
    return `vector(${config.dimensions})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(',').map(Number);
  },
});

// ============================================================
// ENUMS
// Adding a value is a safe migration. Removing one is destructive — never
// remove; mark deprecated in @counselos/shared instead.
// ============================================================

export const userRoleEnum = pgEnum('user_role', USER_ROLES);

export const transactionTypeEnum = pgEnum('transaction_type', TRANSACTION_TYPES);
export const transactionStatusEnum = pgEnum('transaction_status', TRANSACTION_STATUSES);
export const partyRoleEnum = pgEnum('party_role', PARTY_ROLES);
export const partyTypeEnum = pgEnum('party_type', PARTY_TYPES);
export const outcomeReasonEnum = pgEnum('outcome_reason', OUTCOME_REASONS);

export const documentTypeEnum = pgEnum('document_type', DOCUMENT_TYPES);
export const documentProcessingStatusEnum = pgEnum(
  'document_processing_status',
  DOCUMENT_PROCESSING_STATUSES,
);
export const checklistItemStatusEnum = pgEnum('checklist_item_status', CHECKLIST_ITEM_STATUSES);

export const deadlineTypeEnum = pgEnum('deadline_type', DEADLINE_TYPES);
export const deadlineStatusEnum = pgEnum('deadline_status', DEADLINE_STATUSES);
export const deadlineUrgencyEnum = pgEnum('deadline_urgency', DEADLINE_URGENCIES);

export const draftTypeEnum = pgEnum('draft_type', DRAFT_TYPES);
export const draftStatusEnum = pgEnum('draft_status', DRAFT_STATUSES);
export const draftGeneratedByEnum = pgEnum('draft_generated_by', DRAFT_GENERATED_BY);

export const taskPriorityEnum = pgEnum('task_priority', TASK_PRIORITIES);
export const taskStatusEnum = pgEnum('task_status', TASK_STATUSES);

export const communicationTypeEnum = pgEnum('communication_type', COMMUNICATION_TYPES);
export const communicationDirectionEnum = pgEnum(
  'communication_direction',
  COMMUNICATION_DIRECTIONS,
);
export const messageRoleEnum = pgEnum('message_role', MESSAGE_ROLES);
export const messageDirectionEnum = pgEnum('message_direction', MESSAGE_DIRECTIONS);

export const leadStatusEnum = pgEnum('lead_status', LEAD_STATUSES);
export const referralSourceTypeEnum = pgEnum('referral_source_type', REFERRAL_SOURCE_TYPES);

export const invoiceStatusEnum = pgEnum('invoice_status', INVOICE_STATUSES);
export const timeEntrySourceEnum = pgEnum('time_entry_source', TIME_ENTRY_SOURCES);
export const timeEntryStatusEnum = pgEnum('time_entry_status', TIME_ENTRY_STATUSES);
export const wireVerificationMethodEnum = pgEnum(
  'wire_verification_method',
  WIRE_VERIFICATION_METHODS,
);
export const emailJobStatusEnum = pgEnum('email_job_status', EMAIL_JOB_STATUSES);

// ============================================================
// TABLES — dependency order, parents before children
// ============================================================

// ------------------------------------------------------------
// FIRMS
// Root entity. Everything in the system belongs to a firm.
// No soft delete — firms deactivate via settings, never delete.
// ------------------------------------------------------------
export const firms = pgTable('firms', {
  id: uuid('id').primaryKey().defaultRandom(),

  name: text('name').notNull(),
  slug: text('slug').notNull().unique(), // url-safe: 'rodriguez-associates'
  state: text('state').notNull().default('TX'),
  city: text('city').notNull().default('Austin'),
  timezone: text('timezone').notNull().default('America/Chicago'),

  // Feature toggles and firm-level config. JSONB because it is always read as
  // a blob, never filtered. Shape: { defaultBillingRate, autoSuggestTimeEntries,
  // intakeEnabled, clientPortalEnabled, alertEmailEnabled, alertSmsEnabled }
  settings: jsonb('settings')
    .notNull()
    .default(sql`'{}'::jsonb`),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

// ------------------------------------------------------------
// USERS
// Attorneys, paralegals, and owners. Role gates access.
//
// Two records per human:
//   1. Supabase auth.users — credentials and sessions (we don't own it)
//   2. this table          — application identity, role, firm membership
// auth_id links them, and is null until the user first authenticates.
//
// No deleted_at — users deactivate (is_active = false), never delete, so that
// every historical FK pointing at them still resolves.
// ------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmId: uuid('firm_id')
    .notNull()
    .references(() => firms.id),

  // Null until the user clicks the magic link or first logs in.
  authId: uuid('auth_id').unique(),

  // CLIENT role only: the one transaction a portal user may read. No
  // .references() — circular with transactions.assigned_attorney_id. Unused in
  // Phase 1, where client access is a signed token instead (05 Layer 10).
  transactionId: uuid('transaction_id'),

  invitedById: uuid('invited_by_id').references((): AnyPgColumn => users.id),

  role: userRoleEnum('role').notNull(),

  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  barNumber: text('bar_number'), // attorneys only

  isActive: boolean('is_active').notNull().default(true),

  // CAN-SPAM (05 §9F): every notification send checks this before queuing.
  // Set by GET /notifications/unsubscribe, which validates a signed token.
  notificationOptedOut: boolean('notification_opted_out').notNull().default(false),

  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }), // updated on each authenticated request

  // Set when the attorney first acknowledges the firm's AI use policy.
  aiPolicyAcknowledgedAt: timestamp('ai_policy_acknowledged_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

// ------------------------------------------------------------
// TRANSACTIONS
// The central entity. Everything else belongs to a transaction.
// Date columns are timestamps for consistent timezone handling; the
// application writes midnight local time for pure dates.
// ------------------------------------------------------------
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    assignedAttorneyId: uuid('assigned_attorney_id')
      .notNull()
      .references(() => users.id),
    assignedParalegalId: uuid('assigned_paralegal_id').references(() => users.id),

    transactionType: transactionTypeEnum('transaction_type').notNull(),
    status: transactionStatusEnum('status').notNull().default('INTAKE'),

    // Auto-generated: RE-2025-0042. Unique per firm among non-deleted rows —
    // partial unique index in migration 0002, not a column constraint.
    transactionNumber: text('transaction_number').notNull(),

    // Auto-generated: "Martinez / Chen — 2847 Manor Rd". Attorney can override.
    title: text('title').notNull(),

    propertyAddress: text('property_address').notNull(),
    propertyCity: text('property_city').notNull().default('Austin'),
    propertyState: text('property_state').notNull().default('TX'),
    propertyZip: text('property_zip'),

    // THE anchor date. Every deadline calculation originates here.
    effectiveDate: timestamp('effective_date', { withTimezone: true }),
    contractDate: timestamp('contract_date', { withTimezone: true }),

    // Computed from effective_date + contract terms at extraction. Stored for
    // fast dashboard display; always superseded by an actual deadline record.
    optionPeriodExpiry: timestamp('option_period_expiry', { withTimezone: true }),
    financingDeadline: timestamp('financing_deadline', { withTimezone: true }),
    inspectionDeadline: timestamp('inspection_deadline', { withTimezone: true }),
    titleDeadline: timestamp('title_deadline', { withTimezone: true }),
    closingDate: timestamp('closing_date', { withTimezone: true }),
    possessionDate: timestamp('possession_date', { withTimezone: true }),

    // Attorneys reference earnest money constantly — it belongs on the root
    // entity, not buried in a document.
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }),
    earnestMoneyAmount: numeric('earnest_money_amount', { precision: 10, scale: 2 }),
    optionFee: numeric('option_fee', { precision: 8, scale: 2 }),

    // Simple label array, never queried for complex conditions. text[] supports
    // @> containment; jsonb would be overkill.
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    isArchived: boolean('is_archived').notNull().default(false),

    // ── Referral attribution (16-compliance-gaps.md §2.2) ────────────────
    // Copied from the lead on conversion so attribution survives lead
    // archival. UNRECOVERABLE — nobody remembers the referrer 18 months on.
    referralSourceType: referralSourceTypeEnum('referral_source_type'),
    // Free text deliberately: forcing a dropdown at intake kills capture rate.
    referralSourceName: text('referral_source_name'),

    // ── Outcome capture (16-compliance-gaps.md §2.3) ─────────────────────
    // Prompted by the transition into CLOSED or FALLEN_THROUGH. Without the
    // WHY there is no honest answer to "what kills our deals?"
    outcomeReason: outcomeReasonEnum('outcome_reason'),
    outcomeNotes: text('outcome_notes'), // max 500 chars, enforced at the Zod pipe
    // effective_date → closed_at, stored rather than derived so cycle-time
    // analysis stays a simple aggregate.
    cycleTimeDays: integer('cycle_time_days'),

    // ── Legal compliance ─────────────────────────────────────────────────
    // PENDING | CLEAR | FLAGGED | REVIEWED. Must be CLEAR or REVIEWED before a
    // lead converts. Texas Rules 1.09/1.10.
    conflictCheckStatus: text('conflict_check_status').notNull().default('PENDING'),
    conflictCheckNotes: text('conflict_check_notes'),
    conflictCheckCompletedAt: timestamp('conflict_check_completed_at', { withTimezone: true }),

    // Attorney confirms the client was told AI tools are used in their
    // representation — Opinion 705 disclosure.
    aiDisclosureAcknowledgedAt: timestamp('ai_disclosure_acknowledged_at', { withTimezone: true }),

    // Texas real estate matters require 7-year retention. Set to
    // closed_at + 7 years on close; surfaces in the firm dashboard.
    retentionUntil: timestamp('retention_until', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    // Set by TransactionsService.updateStatus() on terminal transitions.
    closedAt: timestamp('closed_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Most dashboard queries filter firm + status.
    index('transactions_firm_id_status_idx').on(table.firmId, table.status),
    // Default dashboard sort order.
    index('transactions_closing_date_idx').on(table.closingDate),
    // The "my transactions" view.
    index('transactions_assigned_attorney_id_idx').on(table.assignedAttorneyId),
  ],
);

// ------------------------------------------------------------
// PARTIES
// Everyone involved in a transaction. One table, role-based — which is what
// makes "all transactions where Independence Title is the title company"
// answerable. A JSONB column could not answer it.
// No soft delete — parties cascade with their transaction.
// ------------------------------------------------------------
export const parties = pgTable(
  'parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),

    role: partyRoleEnum('role').notNull(),
    type: partyTypeEnum('type').notNull(),

    name: text('name').notNull(), // person full name or organization name
    email: text('email'),
    phone: text('phone'),
    companyName: text('company_name'), // brokerage for agents, company for orgs
    licenseNumber: text('license_number'), // TREC license, or bar number
    address: text('address'),

    // Role-specific context, freeform.
    // Lender: "Loan #L-2025-09234, 7.25% 30yr conventional"
    // Title:  "File #2025-04821, Closer: Maria Webb, 512-555-0100"
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [index('parties_transaction_id_idx').on(table.transactionId)],
);

// ------------------------------------------------------------
// DOCUMENTS
// Files uploaded to a transaction — the input to every intelligent feature.
//
// storage_key format: {firmId}/{transactionId}/{uuid}.{ext}
// Never store a URL. Generate signed URLs on demand from Supabase Storage.
// ------------------------------------------------------------
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    uploadedById: uuid('uploaded_by_id')
      .notNull()
      .references(() => users.id),

    type: documentTypeEnum('type').notNull(),

    name: text('name').notNull(), // display name, defaults to filename sans extension
    originalFilename: text('original_filename').notNull(), // preserved for audit
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key').notNull(),

    processingStatus: documentProcessingStatusEnum('processing_status')
      .notNull()
      .default('PENDING'),
    // Human-readable, never a stack trace: "No extractable text — may be a
    // scanned image". Set when processing_status = FAILED.
    processingError: text('processing_error'),
    // Set after text extraction. Required to validate citation page numbers.
    pageCount: integer('page_count'),

    // Attorney marks this explicitly — never automatic. The client portal shows
    // only documents where it is true.
    isClientVisible: boolean('is_client_visible').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    // Soft delete: the record is preserved and the object in Supabase Storage
    // is not removed. Chunks are left in place for a potential restore.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('documents_transaction_id_processing_status_idx').on(
      table.transactionId,
      table.processingStatus,
    ),
  ],
);

// ------------------------------------------------------------
// DOCUMENT CHUNKS
// One row per text chunk, with its 1024-dimension voyage-law-2 embedding.
//
// DENORMALIZATION, deliberate: transaction_id and firm_id are derivable from
// document_id, and are stored anyway so the pgvector pre-filter
//   WHERE transaction_id = ? AND firm_id = ?
// runs BEFORE the HNSW scan. Without them every search scans the whole table.
// No FK on either — the cascade through document_id handles cleanup, and the
// application maintains the values.
//
// Immutable: no updated_at, no deleted_at.
//
// CHUNK PARAMETERS (locked — changing them means re-embedding everything):
//   size 512 tokens · overlap 50 tokens · paragraph-aware splitter
// ------------------------------------------------------------
export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    // Denormalized — see note above. No .references() by design.
    transactionId: uuid('transaction_id').notNull(),
    firmId: uuid('firm_id').notNull(),

    chunkIndex: integer('chunk_index').notNull(), // 0-indexed position in the document
    // Source page, required for citations. Null when the document has no page
    // structure (plain text).
    pageNumber: integer('page_number'),
    // Returned with search results so the RAG assembler needs no second query.
    content: text('content').notNull(),
    // 1024 × 4 bytes = 4KB per row.
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    // Used to respect the 6,000-token context budget: chunks are added in
    // relevance order until the budget is consumed.
    tokenCount: integer('token_count').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The pre-filter index. Column order matters: transaction_id first
    // eliminates ~99.9% of rows, firm_id second.
    index('document_chunks_transaction_firm_idx').on(table.transactionId, table.firmId),
  ],
);

// ------------------------------------------------------------
// DEADLINES
// Every contractual and manually-added deadline on a transaction.
//
// 1. STAGING — auto-extracted deadlines start PENDING_REVIEW. Alerts activate
//    only after an attorney confirms. Never auto-confirmed (Opinion 705).
// 2. PROVENANCE — is_auto_extracted drives different UI: "Source: Purchase
//    Agreement, Page 3" versus "Added manually by James Okafor".
// 3. SUPERSEDING — an amendment does not delete the old deadline. The old row
//    gets superseded_by_id, the new row gets supersedes_id, and the chain is
//    preserved. Dashboards filter superseded_by_id IS NULL.
// 4. ALERTS — alerts_sent_at is an array, one entry per alert sent across the
//    urgency tiers. The scheduler checks it to avoid duplicate sends.
// ------------------------------------------------------------
export const deadlines = pgTable(
  'deadlines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    // Null for manually added deadlines.
    sourceDocumentId: uuid('source_document_id').references(() => documents.id, {
      onDelete: 'set null',
    }),
    supersededById: uuid('superseded_by_id').references((): AnyPgColumn => deadlines.id),
    supersedesId: uuid('supersedes_id').references((): AnyPgColumn => deadlines.id),
    confirmedById: uuid('confirmed_by_id').references(() => users.id),

    type: deadlineTypeEnum('type').notNull(),
    status: deadlineStatusEnum('status').notNull().default('PENDING_REVIEW'),
    // Recomputed by the scheduler hourly; stored for dashboard sorting.
    urgency: deadlineUrgencyEnum('urgency').notNull().default('INFO'),

    // Written in code, never generated by AI.
    title: text('title').notNull(),
    description: text('description'),

    // The scheduler queries: WHERE due_at > now() AND status = 'ACTIVE'
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),

    // ── Source linking (16-compliance-gaps.md §2.1) ──────────────────────
    // What turns verification into a five-second glance instead of re-reading
    // the contract. Null for manual entries. UNRECOVERABLE if not captured at
    // extraction time — and it is the Opinion 705 audit trail.
    sourcePage: integer('source_page'),
    sourceText: text('source_text'), // the verbatim triggering sentence
    sourceCharStart: integer('source_char_start'), // for highlight rendering
    sourceCharEnd: integer('source_char_end'),
    // Low-confidence extractions sort first in the review queue.
    extractionConfidence: numeric('extraction_confidence', { precision: 3, scale: 2 }),

    // ── TREC engine provenance — how this date was computed ──────────────
    // Shown to the attorney so they can trust the math. Null for manual.
    dayType: text('day_type'), // CALENDAR | BUSINESS | TREC_DAYS
    rollRule: text('roll_rule'), // NONE | NEXT_BUSINESS_DAY | PREVIOUS_BUSINESS_DAY
    // "3 days. TREC rule: does not extend for weekends. Due Saturday."
    calculationNote: text('calculation_note'),

    // TRUE = extracted from source_document_id. FALSE = typed by an attorney.
    isAutoExtracted: boolean('is_auto_extracted').notNull().default(false),

    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // One entry per alert sent, across all urgency tiers.
    alertsSentAt: timestamp('alerts_sent_at', { withTimezone: true })
      .array()
      .notNull()
      .default(sql`'{}'::timestamptz[]`),
    // External calendar event, stored so the event can be updated or removed
    // when the deadline changes.
    calendarEventId: text('calendar_event_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('deadlines_transaction_id_status_idx').on(table.transactionId, table.status),
    index('deadlines_firm_id_due_at_idx').on(table.firmId, table.dueAt),
  ],
);

// ------------------------------------------------------------
// CHAT SESSIONS
// Container for RAG conversations about a transaction. Multiple per
// transaction — attorneys return to past conversations.
// No soft delete: sessions are permanent history.
// ------------------------------------------------------------
export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id),

    // Auto-generated from the first message. Attorney can rename.
    title: text('title'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [index('chat_sessions_transaction_id_idx').on(table.transactionId)],
);

// ------------------------------------------------------------
// CHAT MESSAGES
// Immutable once created — no updated_at, no deleted_at.
//
// citations JSONB shape (array), always read whole, never filtered by field:
//   [{ documentId, documentName, pageNumber, chunkId, relevanceScore, excerpt }]
//
// System prompts are never stored — they are constructed fresh per request from
// src/common/prompts/.
// ------------------------------------------------------------
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),

    role: messageRoleEnum('role').notNull(), // USER or ASSISTANT

    content: text('content').notNull(),
    // Empty array for USER messages and for the deterministic fallback, which
    // by definition cites nothing.
    citations: jsonb('citations')
      .notNull()
      .default(sql`'[]'::jsonb`),

    tokensUsed: integer('tokens_used'), // cost monitoring
    modelUsed: text('model_used'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('chat_messages_session_id_idx').on(table.sessionId)],
);

// ------------------------------------------------------------
// DRAFTS
// The container record. Content lives in draft_versions, append-only.
//
// current_version_id has no FK — circular with draft_versions.draft_id. This is
// the second and last such exception in the schema.
// ------------------------------------------------------------
export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id),
    approvedById: uuid('approved_by_id').references(() => users.id),
    // No .references() — circular with draft_versions. See header note.
    currentVersionId: uuid('current_version_id'),

    type: draftTypeEnum('type').notNull(),
    status: draftStatusEnum('status').notNull().default('GENERATING'),

    title: text('title').notNull(),
    // The attorney's instructions to the model. Max 2,000 chars at the pipe.
    instructions: text('instructions'),
    // Human-readable, set when status = FAILED.
    generationError: text('generation_error'),

    approvedAt: timestamp('approved_at', { withTimezone: true }),
    // Set manually by the attorney after they send it. Nothing auto-sends, and
    // no code path may set this before approved_at (Opinion 705).
    sentAt: timestamp('sent_at', { withTimezone: true }),

    // ── Opinion 705 compliance (09-legal-compliance.md) ──────────────────
    // True for anything CounselOS generated. Drives the AI-teal marker and
    // federal court disclosure (N.D. Tex. L.R. 7.2(f), S.D. Tex. GO 2025-04).
    wasAiAssisted: boolean('was_ai_assisted').notNull().default(true),

    // Section-by-section review enforcement. The approval endpoint requires
    // sections_reviewed_count === total_sections_count.
    totalSectionsCount: integer('total_sections_count'),
    sectionsReviewedCount: integer('sections_reviewed_count').notNull().default(0),

    // Review timing. Under 30 seconds prompts "are you sure?" before approval.
    reviewStartedAt: timestamp('review_started_at', { withTimezone: true }),
    reviewDurationSeconds: integer('review_duration_seconds'),

    // Stored verbatim at approval: "I have read, verified, and take
    // professional responsibility for this AI-generated document." Together
    // with approved_at this IS the Opinion 705 record.
    approvalAttestationText: text('approval_attestation_text'),

    // Generated on demand, N.D. Tex. L.R. 7.2(f) format.
    aiDisclosureText: text('ai_disclosure_text'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('drafts_transaction_id_idx').on(table.transactionId)],
);

// ------------------------------------------------------------
// DRAFT VERSIONS
// Immutable content versions. One row per AI generation or attorney edit.
// Rollback = point drafts.current_version_id at an earlier row.
// No updated_at, no deleted_at — version history is permanent.
//
// sections JSONB shape (array), read whole by the review UI:
//   [{ key, title, content, ai_generated, attorney_edited }]
// Section schemas per draft type live in modules/drafts/section-schemas.ts.
// ------------------------------------------------------------
export const draftVersions = pgTable(
  'draft_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => drafts.id, { onDelete: 'cascade' }),
    editedById: uuid('edited_by_id').references(() => users.id), // set when generated_by = USER

    generatedBy: draftGeneratedByEnum('generated_by').notNull(),

    versionNumber: integer('version_number').notNull(), // starts at 1
    content: text('content').notNull(), // full markdown
    sections: jsonb('sections')
      .notNull()
      .default(sql`'[]'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('draft_versions_draft_id_version_idx').on(table.draftId, table.versionNumber)],
);

// ------------------------------------------------------------
// LEADS
// Prospective clients, before they become transactions. A lead may never
// convert, which is why it is not just a transaction in an early status.
//
// Duplicate prevention is two-layer, both in the application:
//   1. idempotency key in Redis — kills double-click duplicates
//   2. 48h time-window dedup   — kills re-submission duplicates
// ------------------------------------------------------------
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    assignedAttorneyId: uuid('assigned_attorney_id').references(() => users.id),
    duplicateOfId: uuid('duplicate_of_id').references((): AnyPgColumn => leads.id),
    // Set when lead_status = CONVERTED. No .references(): the transaction does
    // not exist when the lead is created, and this is written after the fact.
    convertedTransactionId: uuid('converted_transaction_id'),

    leadStatus: leadStatusEnum('lead_status').notNull().default('NEW'),
    transactionType: transactionTypeEnum('transaction_type'),

    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    // At least one of email/phone required — enforced at the Zod pipe, because
    // Postgres CHECK constraints are invisible to the error envelope.
    email: text('email'),
    phone: text('phone'), // normalized to E.164 on write
    propertyAddress: text('property_address'),
    // Preserved verbatim — what the prospective client actually told us.
    inquiryDescription: text('inquiry_description').notNull(),
    source: text('source').notNull(), // intake_form | phone | referral | walk_in
    referralName: text('referral_name'),

    // ── Referral attribution — captured at intake, copied on conversion ──
    referralSourceType: referralSourceTypeEnum('referral_source_type'),
    referralSourceName: text('referral_source_name'),

    // ── Conflict check (Texas Rules 1.09/1.10) ───────────────────────────
    // Runs on lead creation against all existing transaction parties. Must be
    // CLEAR or REVIEWED before the lead can convert.
    conflictCheckStatus: text('conflict_check_status').notNull().default('PENDING'),
    conflictCheckNotes: text('conflict_check_notes'),
    conflictCheckCompletedAt: timestamp('conflict_check_completed_at', { withTimezone: true }),

    ipAddress: text('ip_address'), // rate limiting reference and fraud signal
    // Frontend-generated, keyed in Redis as intake:idempotency:{key}.
    idempotencyKey: text('idempotency_key'),
    // Resubmission tracking: [{ submitted_at, ip_address }], plus any lead-level
    // context not worth a dedicated column.
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('leads_firm_id_status_idx').on(table.firmId, table.leadStatus),
    index('leads_firm_id_created_at_idx').on(table.firmId, table.createdAt),
    // Duplicate detection: WHERE firm_id = ? AND (email = ? OR phone = ?) AND created_at > ?
    index('leads_email_idx').on(table.email),
    index('leads_phone_idx').on(table.phone),
  ],
);

// ------------------------------------------------------------
// TRANSACTION ACTIVITIES
// Append-only audit log of everything that happens on a transaction.
// No updated_at, no deleted_at — facts are not editable.
//
// event_type is an EventType constant from common/events/event-types.ts, never
// a raw string. user_id is null for system events (worker, scheduler).
//
// metadata JSONB shape varies by event_type:
//   transaction.status_changed → { from, to }
//   document.uploaded          → { documentId, documentName, documentType }
//
// WARNING: grows fast. Consider time-based partitioning in Phase 2.
// ------------------------------------------------------------
export const transactionActivities = pgTable(
  'transaction_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    // Null for system-generated events.
    userId: uuid('user_id').references(() => users.id),

    eventType: text('event_type').notNull(),
    // Human-readable, written in code, shown in the activity feed.
    description: text('description').notNull(),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('transaction_activities_transaction_id_created_at_idx').on(
      table.transactionId,
      table.createdAt,
    ),
    index('transaction_activities_event_type_idx').on(table.eventType),
  ],
);

// ------------------------------------------------------------
// MATTER NOTES
// Individual timestamped journal entries — the running narrative of a matter,
// and how a colleague gets up to speed. Replaces a single internal_notes blob.
// No updated_at: notes are immutable like a legal pad. A mistake gets a new
// note. Clients never see them.
// ------------------------------------------------------------
export const matterNotes = pgTable(
  'matter_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),

    content: text('content').notNull(), // max 2,000 chars at the Zod pipe

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // OWNER soft delete only
  },
  (table) => [
    index('matter_notes_transaction_id_created_at_idx').on(table.transactionId, table.createdAt),
  ],
);

// ------------------------------------------------------------
// COMMUNICATIONS
// Every call, email, meeting, and text related to a transaction. This is the
// institutional memory that survives when people leave, and the AI chat reads
// it alongside document chunks.
//
// contact_name is free text, NOT an FK to parties: attorneys talk to people who
// are not in the system constantly, and friction here means no adoption.
// ------------------------------------------------------------
export const communications = pgTable(
  'communications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    loggedById: uuid('logged_by_id')
      .notNull()
      .references(() => users.id),

    type: communicationTypeEnum('type').notNull(),
    direction: communicationDirectionEnum('direction').notNull(),

    contactName: text('contact_name').notNull(), // max 100 chars
    // What was said or decided — 1-3 sentences, not a transcript.
    summary: text('summary').notNull(), // max 500 chars

    // When it happened, not when it was logged. Attorneys can backdate.
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // OWNER soft delete only
  },
  (table) => [
    index('communications_transaction_id_occurred_at_idx').on(
      table.transactionId,
      table.occurredAt,
    ),
  ],
);

// ------------------------------------------------------------
// DOCUMENT CHECKLIST ITEMS
// Expected versus received documents. Auto-populated on transaction creation
// from transaction_type, and auto-checked when a matching document reaches
// READY. PENDING → RECEIVED is automatic; WAIVED and NOT_APPLICABLE are manual.
//
// "Did we get the lender approval?" is currently answered by searching email.
// This answers it in one glance.
// ------------------------------------------------------------
export const documentChecklistItems = pgTable(
  'document_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    receivedDocumentId: uuid('received_document_id').references(() => documents.id),

    // When set, uploading a document of this type auto-checks the item. Null
    // for custom items and types with no clean mapping.
    documentType: documentTypeEnum('document_type'),
    status: checklistItemStatusEnum('status').notNull().default('PENDING'),

    name: text('name').notNull(), // "Title Commitment", "Lender Approval Letter"
    // "Ordered from Independence Title June 5, expected June 18."
    notes: text('notes'), // max 300 chars

    sortOrder: integer('sort_order').notNull().default(0),

    isRequired: boolean('is_required').notNull().default(true),
    // System items cannot be deleted, only WAIVED or NOT_APPLICABLE. Custom
    // items (false) can be soft-deleted.
    isSystemItem: boolean('is_system_item').notNull().default(true),

    receivedAt: timestamp('received_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('document_checklist_items_transaction_id_idx').on(table.transactionId, table.status),
  ],
);

// ------------------------------------------------------------
// TASKS
// Internal work items — assignments, not contractual deadlines.
// "Order title search", "Call lender to confirm approval".
// Overdue tasks surface in the morning dashboard alongside deadlines.
// ------------------------------------------------------------
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id),
    assignedToId: uuid('assigned_to_id').references(() => users.id), // null = unassigned
    completedById: uuid('completed_by_id').references(() => users.id),

    taskStatus: taskStatusEnum('task_status').notNull().default('OPEN'),
    priority: taskPriorityEnum('priority').notNull().default('NORMAL'),

    title: text('title').notNull(), // max 200 chars
    description: text('description'), // max 1,000 chars

    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('tasks_transaction_id_status_idx').on(table.transactionId, table.taskStatus),
    index('tasks_assigned_to_id_idx').on(table.assignedToId),
  ],
);

// ------------------------------------------------------------
// TIME ENTRIES
// Billable hours. billing_rate is snapshotted at creation so historical entries
// never move when an attorney's rate changes. Invoiced entries are immutable.
//
// Passive capture: SUGGESTED entries are generated nightly from activity and
// land as DRAFT. A DRAFT entry NEVER appears on an invoice, and is purged after
// 14 days if the attorney never confirms it.
// ------------------------------------------------------------
export const timeEntries = pgTable(
  'time_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    attorneyId: uuid('attorney_id')
      .notNull()
      .references(() => users.id),
    // Which activity produced this suggestion. Null for manual entries.
    sourceActivityId: uuid('source_activity_id').references(() => transactionActivities.id),

    source: timeEntrySourceEnum('source').notNull().default('MANUAL'),
    entryStatus: timeEntryStatusEnum('entry_status').notNull().default('CONFIRMED'),

    description: text('description').notNull(), // max 500 chars

    hours: numeric('hours', { precision: 5, scale: 2 }).notNull(), // 0.25 min, 24.00 max
    billingRate: numeric('billing_rate', { precision: 8, scale: 2 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),

    entryDate: timestamp('entry_date', { withTimezone: true }).notNull().defaultNow(), // when the work happened

    invoiced: boolean('invoiced').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('time_entries_transaction_id_invoiced_idx').on(table.transactionId, table.invoiced),
    index('time_entries_attorney_id_idx').on(table.attorneyId),
  ],
);

// ------------------------------------------------------------
// INVOICES
// line_items is a JSONB SNAPSHOT, not live references to time entries. An
// invoice is a historical record: time entries may change afterward, the
// invoice does not. Attorney downloads the PDF and emails it in Phase 1.
// ------------------------------------------------------------
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id')
    .notNull()
    .references(() => transactions.id, { onDelete: 'cascade' }),
  firmId: uuid('firm_id')
    .notNull()
    .references(() => firms.id),

  status: invoiceStatusEnum('status').notNull().default('DRAFT'),

  // INV-2025-0042. Partial unique index in migration 0002.
  invoiceNumber: text('invoice_number').notNull(),

  clientName: text('client_name').notNull(), // copied from the buyer party, editable
  clientEmail: text('client_email'),
  notes: text('notes'), // appears on the PDF
  pdfStorageKey: text('pdf_storage_key'), // set after PDF generation

  subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
  taxRate: numeric('tax_rate', { precision: 5, scale: 4 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),

  // Shape: [{ description, hours, rate, amount }]
  lineItems: jsonb('line_items')
    .notNull()
    .default(sql`'[]'::jsonb`),

  sentAt: timestamp('sent_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ------------------------------------------------------------
// CLIENT ACCESS TOKENS
// No client accounts, no passwords, no CLIENT role in Phase 1. A signed HMAC
// URL grants read-only access to one transaction for 30 days.
//
// The raw 256-bit token is NEVER stored — only SHA-256(raw). If the database
// leaks, the tokens cannot be reversed. Any access failure returns 404, never
// 401/403, so the existence of a transaction is never revealed.
// ------------------------------------------------------------
export const clientAccessTokens = pgTable('client_access_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id')
    .notNull()
    .references(() => transactions.id, { onDelete: 'cascade' }),
  firmId: uuid('firm_id')
    .notNull()
    .references(() => firms.id),

  clientEmail: text('client_email').notNull(),
  tokenHash: text('token_hash').notNull(), // SHA-256 of the raw token

  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // now() + 30 days
  revoked: boolean('revoked').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ------------------------------------------------------------
// HOLIDAYS
// Texas state and federal holidays, maintained years forward. Read by the TREC
// deadline engine to apply roll rules. Seeded, not user-managed.
//
// `date` IS THE ONE COLUMN IN THE SCHEMA THAT IS NOT A timestamptz, and the
// exception is the whole point rather than an oversight.
//
// A holiday is a calendar date, not an instant. Thanksgiving is not "an instant
// in UTC" — it is the 27th, all day, everywhere in Texas. Storing it as
// timestamptz forces the engine to pick a time of day, and then every
// comparison against it is really asking "is this instant before midnight in
// whichever zone the session happens to be set to?" Near midnight and across a
// DST boundary that answer flips, which is exactly how an option-fee deadline
// lands on the wrong side of a holiday weekend.
//
// mode: 'string' deliberately, not mode: 'date'. Drizzle's 'date' mode would
// hand back a JS Date — an instant — reintroducing the ambiguity this column
// exists to remove. As 'YYYY-MM-DD' the value has exactly one meaning, and the
// business-day engine compares calendar dates to calendar dates.
// ------------------------------------------------------------
export const holidays = pgTable(
  'holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    name: text('name').notNull(), // "Juneteenth", "Thanksgiving"
    jurisdiction: text('jurisdiction').notNull(), // FEDERAL | TX_STATE | COUNTY

    // Postgres `date`. Reads and writes as 'YYYY-MM-DD' — no zone, no time.
    date: date('date', { mode: 'string' }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('holidays_date_idx').on(table.date)],
);

// ------------------------------------------------------------
// VERIFIED WIRE INSTRUCTIONS
// The trusted baseline for a party's wire instructions. Anything that differs
// from the active baseline gets flagged (moat feature M2).
//
// Account numbers are NEVER stored raw — last 4 for display, SHA-256 for
// comparison, matching the client_access_tokens convention. Routing numbers are
// public bank data and safe to store.
// ------------------------------------------------------------
export const verifiedWireInstructions = pgTable(
  'verified_wire_instructions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    partyId: uuid('party_id').references(() => parties.id),
    verifiedById: uuid('verified_by_id')
      .notNull()
      .references(() => users.id),

    verificationMethod: wireVerificationMethodEnum('verification_method').notNull(),

    institutionName: text('institution_name').notNull(),
    routingNumber: text('routing_number').notNull(), // public bank data
    accountLast4: text('account_last4').notNull(), // display only
    accountHash: text('account_hash').notNull(), // SHA-256 of the full number
    verificationNotes: text('verification_notes'),

    // Only one active baseline per party per transaction.
    isActive: boolean('is_active').notNull().default(true),

    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('verified_wire_instructions_transaction_party_idx').on(
      table.transactionId,
      table.partyId,
    ),
  ],
);

// ------------------------------------------------------------
// WIRE FLAG EVENTS
// Every time wire instructions are flagged — no baseline, or a mismatch. The
// audit trail: what was detected, when, and how it resolved.
// ------------------------------------------------------------
export const wireFlagEvents = pgTable(
  'wire_flag_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    sourceDocumentId: uuid('source_document_id').references(() => documents.id),
    resolvedById: uuid('resolved_by_id').references(() => users.id),

    flagType: text('flag_type').notNull(), // NO_BASELINE | MISMATCH

    detectedRoutingNumber: text('detected_routing_number'),
    detectedAccountLast4: text('detected_account_last4'),
    resolution: text('resolution'), // VERIFIED_LEGITIMATE | CONFIRMED_FRAUD | DISMISSED
    resolutionNotes: text('resolution_notes'),

    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('wire_flag_events_transaction_id_idx').on(table.transactionId)],
);

// ------------------------------------------------------------
// MATTER ACCESS
// Grants a user access to a matter beyond the two assignment columns — vacation
// coverage, second-chairing, paralegal reassignment — without changing who owns
// the matter.
//
// Resolution order: OWNER → assigned attorney → assigned paralegal →
// matter_access row → ATTORNEY read-only → denied.
// ------------------------------------------------------------
export const matterAccess = pgTable(
  'matter_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    grantedById: uuid('granted_by_id')
      .notNull()
      .references(() => users.id),

    expiresAt: timestamp('expires_at', { withTimezone: true }), // optional, for temporary coverage

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('matter_access_transaction_user_idx').on(table.transactionId, table.userId),
  ],
);

// ------------------------------------------------------------
// CLIENT MESSAGES
// Two-way messaging on the client portal. No client accounts — the client is
// authenticated by the same signed token that grants read access, and
// sender_name comes from that token.
//
// HARD RULE: the AI never auto-responds. An attorney composes every outbound
// reply. Auto-response would be UPL and an Opinion 705 violation.
//
// Every message also writes a communications row (type CLIENT_PORTAL) so
// two-way messaging feeds institutional memory and AI chat context.
// ------------------------------------------------------------
export const clientMessages = pgTable(
  'client_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    // OUTBOUND: the attorney who sent it. Null for INBOUND.
    senderUserId: uuid('sender_user_id').references(() => users.id),

    direction: messageDirectionEnum('direction').notNull(),

    body: text('body').notNull(), // max 2,000 chars at the Zod pipe
    // INBOUND: client name from the access token. Null for OUTBOUND.
    senderName: text('sender_name'),

    readAt: timestamp('read_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('client_messages_transaction_id_created_at_idx').on(table.transactionId, table.createdAt),
  ],
);

// ------------------------------------------------------------
// ACCESS LOG
// Read-access audit trail. Distinct from transaction_activities, which logs
// ACTIONS — this logs VIEWS: who saw which matter, and when.
//
// For a system holding privileged material, reads matter as much as writes: it
// proves matter-level access control works, and answers "who looked at this
// file?" if that is ever asked (16-compliance-gaps.md §2.4).
//
// Written from an interceptor, never from individual controllers — one place,
// so no route can forget.
//
// HIGH VOLUME. Partition by month in Phase 2; retain 2 years, then purge.
// ------------------------------------------------------------
export const accessLog = pgTable(
  'access_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    transactionId: uuid('transaction_id').references(() => transactions.id),

    // transaction.viewed | document.downloaded | search.performed
    // | client_portal.accessed | export.generated
    action: text('action').notNull(),
    resourceId: uuid('resource_id'),
    ipAddress: text('ip_address'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('access_log_firm_id_created_at_idx').on(table.firmId, table.createdAt),
    index('access_log_transaction_id_idx').on(table.transactionId),
  ],
);

// ------------------------------------------------------------
// EMAIL JOBS
// Audit trail for every notification email (05-backend-checklist.md §9D).
// A row is written with status QUEUED before the job is enqueued, so an email
// that vanishes is still evidenced. On send: SENT + resend_id + sent_at. On
// retry exhaustion: FAILED + last_error.
//
// Surfaced by GET /notifications/email-log, OWNER only. Also the table
// 09-legal-compliance.md's quarterly review reads for AI-feature failures.
//
// firm_id is not in the checklist's column list and is added here deliberately:
// every other table carries it, the OWNER log query needs to scope by it, and
// Phase 2 multi-tenancy requires it.
// ------------------------------------------------------------
export const emailJobs = pgTable(
  'email_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmId: uuid('firm_id')
      .notNull()
      .references(() => firms.id),
    recipientUserId: uuid('recipient_user_id').references(() => users.id),

    status: emailJobStatusEnum('status').notNull().default('QUEUED'),

    notificationType: text('notification_type').notNull(), // NotificationType constant
    recipientEmail: text('recipient_email').notNull(),
    subject: text('subject').notNull(), // stored for audit
    resendId: text('resend_id'), // Resend's message ID, set on success
    lastError: text('last_error'), // set when all retries are exhausted

    attempts: integer('attempts').notNull().default(0),

    sentAt: timestamp('sent_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('email_jobs_firm_id_created_at_idx').on(table.firmId, table.createdAt)],
);

// ============================================================
// RELATIONS
// These create NO database constraints — .references() above does that. These
// exist so db.query.x.findMany({ with: { y: true } }) is typed. Both are
// required and they do different jobs.
// ============================================================

export const firmsRelations = relations(firms, ({ many }) => ({
  users: many(users),
  transactions: many(transactions),
  leads: many(leads),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  firm: one(firms, { fields: [users.firmId], references: [firms.id] }),
  invitedBy: one(users, {
    fields: [users.invitedById],
    references: [users.id],
    relationName: 'invited_by',
  }),
  assignedTransactions: many(transactions, { relationName: 'assigned_attorney' }),
  paralegalTransactions: many(transactions, { relationName: 'assigned_paralegal' }),
  confirmedDeadlines: many(deadlines),
  createdDrafts: many(drafts, { relationName: 'created_by' }),
  approvedDrafts: many(drafts, { relationName: 'approved_by' }),
  uploadedDocuments: many(documents),
  emailJobs: many(emailJobs),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  firm: one(firms, { fields: [transactions.firmId], references: [firms.id] }),
  assignedAttorney: one(users, {
    fields: [transactions.assignedAttorneyId],
    references: [users.id],
    relationName: 'assigned_attorney',
  }),
  assignedParalegal: one(users, {
    fields: [transactions.assignedParalegalId],
    references: [users.id],
    relationName: 'assigned_paralegal',
  }),
  parties: many(parties),
  documents: many(documents),
  deadlines: many(deadlines),
  chatSessions: many(chatSessions),
  drafts: many(drafts),
  activities: many(transactionActivities),
  matterNotes: many(matterNotes),
  communications: many(communications),
  checklistItems: many(documentChecklistItems),
  tasks: many(tasks),
  timeEntries: many(timeEntries),
  invoices: many(invoices),
  clientAccessTokens: many(clientAccessTokens),
  verifiedWireInstructions: many(verifiedWireInstructions),
  wireFlagEvents: many(wireFlagEvents),
  matterAccess: many(matterAccess),
  clientMessages: many(clientMessages),
}));

export const partiesRelations = relations(parties, ({ one }) => ({
  transaction: one(transactions, {
    fields: [parties.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [parties.firmId], references: [firms.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  transaction: one(transactions, {
    fields: [documents.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [documents.firmId], references: [firms.id] }),
  uploadedBy: one(users, { fields: [documents.uploadedById], references: [users.id] }),
  chunks: many(documentChunks),
  deadlines: many(deadlines, { relationName: 'source_document' }),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, { fields: [documentChunks.documentId], references: [documents.id] }),
}));

export const deadlinesRelations = relations(deadlines, ({ one }) => ({
  transaction: one(transactions, {
    fields: [deadlines.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [deadlines.firmId], references: [firms.id] }),
  sourceDocument: one(documents, {
    fields: [deadlines.sourceDocumentId],
    references: [documents.id],
    relationName: 'source_document',
  }),
  supersededBy: one(deadlines, {
    fields: [deadlines.supersededById],
    references: [deadlines.id],
    relationName: 'superseded_by',
  }),
  supersedes: one(deadlines, {
    fields: [deadlines.supersedesId],
    references: [deadlines.id],
    relationName: 'supersedes',
  }),
  confirmedBy: one(users, { fields: [deadlines.confirmedById], references: [users.id] }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  transaction: one(transactions, {
    fields: [chatSessions.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [chatSessions.firmId], references: [firms.id] }),
  createdBy: one(users, { fields: [chatSessions.createdById], references: [users.id] }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
  firm: one(firms, { fields: [chatMessages.firmId], references: [firms.id] }),
}));

export const draftsRelations = relations(drafts, ({ one, many }) => ({
  transaction: one(transactions, {
    fields: [drafts.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [drafts.firmId], references: [firms.id] }),
  createdBy: one(users, {
    fields: [drafts.createdById],
    references: [users.id],
    relationName: 'created_by',
  }),
  approvedBy: one(users, {
    fields: [drafts.approvedById],
    references: [users.id],
    relationName: 'approved_by',
  }),
  versions: many(draftVersions),
}));

export const draftVersionsRelations = relations(draftVersions, ({ one }) => ({
  draft: one(drafts, { fields: [draftVersions.draftId], references: [drafts.id] }),
  editedBy: one(users, { fields: [draftVersions.editedById], references: [users.id] }),
}));

export const leadsRelations = relations(leads, ({ one }) => ({
  firm: one(firms, { fields: [leads.firmId], references: [firms.id] }),
  assignedAttorney: one(users, { fields: [leads.assignedAttorneyId], references: [users.id] }),
  duplicateOf: one(leads, {
    fields: [leads.duplicateOfId],
    references: [leads.id],
    relationName: 'duplicate_of',
  }),
}));

export const transactionActivitiesRelations = relations(transactionActivities, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionActivities.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [transactionActivities.firmId], references: [firms.id] }),
  user: one(users, { fields: [transactionActivities.userId], references: [users.id] }),
}));

export const matterNotesRelations = relations(matterNotes, ({ one }) => ({
  transaction: one(transactions, {
    fields: [matterNotes.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [matterNotes.firmId], references: [firms.id] }),
  author: one(users, { fields: [matterNotes.authorId], references: [users.id] }),
}));

export const communicationsRelations = relations(communications, ({ one }) => ({
  transaction: one(transactions, {
    fields: [communications.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [communications.firmId], references: [firms.id] }),
  loggedBy: one(users, { fields: [communications.loggedById], references: [users.id] }),
}));

export const documentChecklistItemsRelations = relations(documentChecklistItems, ({ one }) => ({
  transaction: one(transactions, {
    fields: [documentChecklistItems.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [documentChecklistItems.firmId], references: [firms.id] }),
  receivedDocument: one(documents, {
    fields: [documentChecklistItems.receivedDocumentId],
    references: [documents.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  transaction: one(transactions, { fields: [tasks.transactionId], references: [transactions.id] }),
  firm: one(firms, { fields: [tasks.firmId], references: [firms.id] }),
  createdBy: one(users, {
    fields: [tasks.createdById],
    references: [users.id],
    relationName: 'task_creator',
  }),
  assignedTo: one(users, {
    fields: [tasks.assignedToId],
    references: [users.id],
    relationName: 'task_assignee',
  }),
  completedBy: one(users, {
    fields: [tasks.completedById],
    references: [users.id],
    relationName: 'task_completer',
  }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  transaction: one(transactions, {
    fields: [timeEntries.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [timeEntries.firmId], references: [firms.id] }),
  attorney: one(users, { fields: [timeEntries.attorneyId], references: [users.id] }),
  sourceActivity: one(transactionActivities, {
    fields: [timeEntries.sourceActivityId],
    references: [transactionActivities.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  transaction: one(transactions, {
    fields: [invoices.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [invoices.firmId], references: [firms.id] }),
}));

export const clientAccessTokensRelations = relations(clientAccessTokens, ({ one }) => ({
  transaction: one(transactions, {
    fields: [clientAccessTokens.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [clientAccessTokens.firmId], references: [firms.id] }),
}));

export const verifiedWireInstructionsRelations = relations(verifiedWireInstructions, ({ one }) => ({
  transaction: one(transactions, {
    fields: [verifiedWireInstructions.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [verifiedWireInstructions.firmId], references: [firms.id] }),
  party: one(parties, { fields: [verifiedWireInstructions.partyId], references: [parties.id] }),
  verifiedBy: one(users, {
    fields: [verifiedWireInstructions.verifiedById],
    references: [users.id],
  }),
}));

export const wireFlagEventsRelations = relations(wireFlagEvents, ({ one }) => ({
  transaction: one(transactions, {
    fields: [wireFlagEvents.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [wireFlagEvents.firmId], references: [firms.id] }),
  sourceDocument: one(documents, {
    fields: [wireFlagEvents.sourceDocumentId],
    references: [documents.id],
  }),
  resolvedBy: one(users, { fields: [wireFlagEvents.resolvedById], references: [users.id] }),
}));

export const matterAccessRelations = relations(matterAccess, ({ one }) => ({
  transaction: one(transactions, {
    fields: [matterAccess.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [matterAccess.firmId], references: [firms.id] }),
  user: one(users, {
    fields: [matterAccess.userId],
    references: [users.id],
    relationName: 'access_grantee',
  }),
  grantedBy: one(users, {
    fields: [matterAccess.grantedById],
    references: [users.id],
    relationName: 'access_granter',
  }),
}));

export const clientMessagesRelations = relations(clientMessages, ({ one }) => ({
  transaction: one(transactions, {
    fields: [clientMessages.transactionId],
    references: [transactions.id],
  }),
  firm: one(firms, { fields: [clientMessages.firmId], references: [firms.id] }),
  sender: one(users, { fields: [clientMessages.senderUserId], references: [users.id] }),
}));

export const accessLogRelations = relations(accessLog, ({ one }) => ({
  firm: one(firms, { fields: [accessLog.firmId], references: [firms.id] }),
  user: one(users, { fields: [accessLog.userId], references: [users.id] }),
  transaction: one(transactions, {
    fields: [accessLog.transactionId],
    references: [transactions.id],
  }),
}));

export const emailJobsRelations = relations(emailJobs, ({ one }) => ({
  firm: one(firms, { fields: [emailJobs.firmId], references: [firms.id] }),
  recipientUser: one(users, { fields: [emailJobs.recipientUserId], references: [users.id] }),
}));

// ============================================================
// TYPE EXPORTS
// Inferred, never hand-written. $inferSelect is the row shape after a query;
// $inferInsert enforces required fields at compile time.
// ============================================================

export type Firm = typeof firms.$inferSelect;
export type NewFirm = typeof firms.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;

export type Deadline = typeof deadlines.$inferSelect;
export type NewDeadline = typeof deadlines.$inferInsert;

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type Draft = typeof drafts.$inferSelect;
export type NewDraft = typeof drafts.$inferInsert;

export type DraftVersion = typeof draftVersions.$inferSelect;
export type NewDraftVersion = typeof draftVersions.$inferInsert;

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

export type TransactionActivity = typeof transactionActivities.$inferSelect;
export type NewTransactionActivity = typeof transactionActivities.$inferInsert;

export type MatterNote = typeof matterNotes.$inferSelect;
export type NewMatterNote = typeof matterNotes.$inferInsert;

export type Communication = typeof communications.$inferSelect;
export type NewCommunication = typeof communications.$inferInsert;

export type DocumentChecklistItem = typeof documentChecklistItems.$inferSelect;
export type NewDocumentChecklistItem = typeof documentChecklistItems.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type ClientAccessToken = typeof clientAccessTokens.$inferSelect;
export type NewClientAccessToken = typeof clientAccessTokens.$inferInsert;

export type Holiday = typeof holidays.$inferSelect;
export type NewHoliday = typeof holidays.$inferInsert;

export type VerifiedWireInstruction = typeof verifiedWireInstructions.$inferSelect;
export type NewVerifiedWireInstruction = typeof verifiedWireInstructions.$inferInsert;

export type WireFlagEvent = typeof wireFlagEvents.$inferSelect;
export type NewWireFlagEvent = typeof wireFlagEvents.$inferInsert;

export type MatterAccess = typeof matterAccess.$inferSelect;
export type NewMatterAccess = typeof matterAccess.$inferInsert;

export type ClientMessage = typeof clientMessages.$inferSelect;
export type NewClientMessage = typeof clientMessages.$inferInsert;

export type AccessLog = typeof accessLog.$inferSelect;
export type NewAccessLog = typeof accessLog.$inferInsert;

export type EmailJob = typeof emailJobs.$inferSelect;
export type NewEmailJob = typeof emailJobs.$inferInsert;
