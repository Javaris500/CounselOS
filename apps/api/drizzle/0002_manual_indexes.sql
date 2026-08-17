-- ============================================================
-- 0002 — HAND-WRITTEN INDEXES
--
-- Everything drizzle-kit cannot express from schema.ts: the HNSW vector index,
-- partial-unique indexes (uniqueness that has to ignore soft-deleted rows),
-- tsvector generated columns, and partial indexes for the hot list queries.
-- Source: 03-schema.md "Migration Notes" + 13-adoption-features.md (search).
--
-- Created with `drizzle-kit generate --custom`, never by hand: the migrator
-- applies only what is registered in meta/_journal.json, so a .sql file dropped
-- into this folder is silently skipped and its indexes never exist anywhere.
--
-- These run on empty tables. Doing it now costs nothing; adding a generated
-- column to a table with a year of matters in it means a full table rewrite.
-- ============================================================


-- ============================================================
-- 1. HNSW VECTOR INDEX
--
-- The index behind document chat. Without it every similarity search is a
-- sequential scan over every chunk in the firm.
--
-- m = 16, ef_construction = 64 are build-time parameters, fixed once the index
-- exists. hnsw.ef_search (recall vs speed) is set per QUERY, not here — the
-- repository issues `SET hnsw.ef_search = 40` before searching.
-- ============================================================
CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
--> statement-breakpoint


-- ============================================================
-- 2. PARTIAL UNIQUE INDEXES
--
-- A plain UNIQUE constraint counts soft-deleted rows, so deleting transaction
-- RE-2025-0042 would burn that number forever — the row is still physically
-- present, still holding the value. Scoping uniqueness to `deleted_at IS NULL`
-- is the only correct form of uniqueness in a soft-delete schema.
--
-- Not repeated here, deliberately:
--   users.auth_id  — the column-level .unique() in schema.ts already does it.
--                    A Postgres UNIQUE constraint permits multiple NULLs, so it
--                    is already equivalent to "unique where auth_id is not
--                    null". A second partial index would be dead weight.
--   users.email    — users have no deleted_at (they deactivate), so a plain
--                    unique index is correct. 03-schema.md wrote this one as
--                    `WHERE TRUE` for symmetry; a constant predicate buys
--                    nothing and obscures why the others have one.
-- ============================================================

-- One transaction number per firm, among live transactions.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_transaction_number_active_key
ON transactions (firm_id, transaction_number)
WHERE deleted_at IS NULL;
--> statement-breakpoint

-- One invoice number per firm, among live invoices.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_invoice_number_active_key
ON invoices (firm_id, invoice_number)
WHERE deleted_at IS NULL;
--> statement-breakpoint

-- One email per firm, among users. No deleted_at on this table — see note above.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_firm_key
ON users (firm_id, email);
--> statement-breakpoint

-- Exactly one ACTIVE wire-instruction baseline per party per transaction.
-- schema.ts states this invariant in a comment ("Only one active baseline per
-- party per transaction"); this is what enforces it. Without the constraint,
-- two active baselines make "does this match the verified account?" ambiguous —
-- and an ambiguous answer in the wire-fraud path is the failure that costs a
-- client their down payment.
CREATE UNIQUE INDEX IF NOT EXISTS verified_wire_instructions_active_baseline_key
ON verified_wire_instructions (transaction_id, party_id)
WHERE is_active = TRUE AND deleted_at IS NULL;
--> statement-breakpoint

-- One holiday per date per jurisdiction. The TREC engine treats "is this date a
-- holiday?" as a yes/no; a duplicated seed row would make a roll rule count the
-- same day twice. holidays.date is a Postgres `date`, so this is a plain unique
-- index — there is no time component to make two rows spuriously distinct.
CREATE UNIQUE INDEX IF NOT EXISTS holidays_date_jurisdiction_key
ON holidays (date, jurisdiction);
--> statement-breakpoint


-- ============================================================
-- 3. FULL-TEXT SEARCH — tsvector generated columns + GIN
--
-- This is KEYWORD search and it complements pgvector, it does not replace it.
-- Vector search answers "what does the contract say about financing?"
-- Full-text answers "find the message where Maria mentioned the wire."
--
-- GENERATED ALWAYS ... STORED means Postgres maintains the column on every
-- insert and update. No trigger to write, no application code to forget.
-- ============================================================

ALTER TABLE communications ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(contact_name, '') || ' ' || coalesce(summary, ''))
  ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS communications_search_idx
  ON communications USING GIN (search_vector);
--> statement-breakpoint

ALTER TABLE matter_notes ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matter_notes_search_idx
  ON matter_notes USING GIN (search_vector);
--> statement-breakpoint

ALTER TABLE document_chunks ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS document_chunks_search_idx
  ON document_chunks USING GIN (search_vector);
--> statement-breakpoint


-- ============================================================
-- 4. PARTIAL INDEXES FOR THE HOT LIST QUERIES
--
-- Every list query in the app appends `WHERE deleted_at IS NULL`. A partial
-- index stores only the rows that filter can return, so it stays small and the
-- planner never reads index entries for deleted rows.
-- ============================================================

-- The transaction list: active, unarchived, by status.
CREATE INDEX IF NOT EXISTS transactions_active_idx
ON transactions (firm_id, status)
WHERE deleted_at IS NULL AND is_archived = FALSE;
--> statement-breakpoint

-- The document list for a transaction, by type.
CREATE INDEX IF NOT EXISTS documents_active_idx
ON documents (transaction_id, type)
WHERE deleted_at IS NULL;
--> statement-breakpoint

-- The deadline dashboard: live, confirmed, not superseded by an amendment.
-- This is the query the morning dashboard and the alert scheduler both run.
CREATE INDEX IF NOT EXISTS deadlines_active_idx
ON deadlines (firm_id, urgency, due_at)
WHERE status = 'ACTIVE'::deadline_status
  AND deleted_at IS NULL
  AND superseded_by_id IS NULL;
