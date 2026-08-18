-- ============================================================
-- 0003 — ENABLE ROW LEVEL SECURITY ON EVERY TABLE
--
-- Deny-by-default. RLS is enabled with NO policies, which means the `anon`
-- and `authenticated` roles can read nothing.
--
-- WHY THIS IS NOT THE PHASE 2 MULTI-TENANCY WORK
--   03-schema.md and 15-project-context.md describe RLS as the Phase 2
--   mechanism for scoping rows by firm_id from a JWT claim. That is still
--   Phase 2, and nothing here implements it.
--
--   This migration answers a different question, one that goes live the
--   moment a Supabase project exists. Supabase serves the `public` schema
--   over PostgREST at /rest/v1/, and the publishable (anon) key is public
--   BY DESIGN — it ships in the frontend bundle, and it lands in chat logs
--   and screenshots. Tables created by Drizzle migrations do NOT get RLS
--   automatically. So without this, every table here is readable with a key
--   that was never meant to be secret, bypassing the API's matter-access
--   guard and its access_log entirely. Supabase's own security advisor
--   flags precisely this as "RLS Disabled in Public".
--
-- WHY IT COSTS US NOTHING
--   The API connects over a direct Postgres connection as the table OWNER,
--   and RLS does not apply to the owner unless FORCE ROW LEVEL SECURITY is
--   also set — which it deliberately is not. The app, the migrations, the
--   seed, and all three test tiers are unaffected.
--
-- CONSEQUENCE WORTH KNOWING
--   Any future code path connecting as `anon` or `authenticated` will
--   silently receive ZERO ROWS rather than a permission error, which reads
--   as a bug rather than as policy. Phase 1 has no such path: the service
--   key is scoped to AuthService and StorageService, and both use the
--   Supabase SDK for auth and object storage, never for table reads.
--
--   Storage is a separate system with its own RLS on storage.objects. The
--   control there is the private `documents` bucket plus 15-minute signed
--   URLs; this migration does nothing for it. Verify that separately.
--
-- Phase 2 then ADDS policies to tables that already have RLS enabled,
-- rather than flipping a switch across 27 tables holding live client data.
-- ============================================================

ALTER TABLE "access_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "chat_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_access_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "client_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "communications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "deadlines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document_checklist_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "document_chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "draft_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "email_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "firms" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "matter_access" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "matter_notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "parties" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transaction_activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "verified_wire_instructions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "wire_flag_events" ENABLE ROW LEVEL SECURITY;
