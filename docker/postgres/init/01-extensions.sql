-- Runs once, on first boot of an empty postgres-data volume.
-- Re-run it manually after `docker compose down -v`, or just let this fire again.
--
-- Supabase enables pgvector through its dashboard (Database → Extensions → vector).
-- This is the local equivalent, so the same migrations apply to both.

CREATE EXTENSION IF NOT EXISTS vector;

-- gen_random_uuid() for uuid('id').primaryKey().defaultRandom().
-- Built into Postgres 13+, but created explicitly so the requirement is visible.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigram indexes back the full-text search in 13-adoption-features.md (8I).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
