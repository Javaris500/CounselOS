ALTER TYPE "public"."communication_type" ADD VALUE 'CLIENT_PORTAL' BEFORE 'OTHER';--> statement-breakpoint
CREATE TABLE "access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"transaction_id" uuid,
	"action" text NOT NULL,
	"resource_id" uuid,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_used" integer,
	"model_used" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"sender_user_id" uuid,
	"direction" "message_direction" NOT NULL,
	"body" text NOT NULL,
	"sender_name" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"logged_by_id" uuid NOT NULL,
	"type" "communication_type" NOT NULL,
	"direction" "communication_direction" NOT NULL,
	"contact_name" text NOT NULL,
	"summary" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"source_document_id" uuid,
	"superseded_by_id" uuid,
	"supersedes_id" uuid,
	"confirmed_by_id" uuid,
	"type" "deadline_type" NOT NULL,
	"status" "deadline_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"urgency" "deadline_urgency" DEFAULT 'INFO' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone NOT NULL,
	"source_page" integer,
	"source_text" text,
	"source_char_start" integer,
	"source_char_end" integer,
	"extraction_confidence" numeric(3, 2),
	"day_type" text,
	"roll_rule" text,
	"calculation_note" text,
	"is_auto_extracted" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"alerts_sent_at" timestamp with time zone[] DEFAULT '{}'::timestamptz[] NOT NULL,
	"calendar_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"received_document_id" uuid,
	"document_type" "document_type",
	"status" "checklist_item_status" DEFAULT 'PENDING' NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"is_system_item" boolean DEFAULT true NOT NULL,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"page_number" integer,
	"content" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"token_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"type" "document_type" NOT NULL,
	"name" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"processing_status" "document_processing_status" DEFAULT 'PENDING' NOT NULL,
	"processing_error" text,
	"page_count" integer,
	"is_client_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "draft_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"edited_by_id" uuid,
	"generated_by" "draft_generated_by" NOT NULL,
	"version_number" integer NOT NULL,
	"content" text NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"approved_by_id" uuid,
	"current_version_id" uuid,
	"type" "draft_type" NOT NULL,
	"status" "draft_status" DEFAULT 'GENERATING' NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"generation_error" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"was_ai_assisted" boolean DEFAULT true NOT NULL,
	"total_sections_count" integer,
	"sections_reviewed_count" integer DEFAULT 0 NOT NULL,
	"review_started_at" timestamp with time zone,
	"review_duration_seconds" integer,
	"approval_attestation_text" text,
	"ai_disclosure_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"recipient_user_id" uuid,
	"status" "email_job_status" DEFAULT 'QUEUED' NOT NULL,
	"notification_type" text NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"resend_id" text,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"state" text DEFAULT 'TX' NOT NULL,
	"city" text DEFAULT 'Austin' NOT NULL,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"invoice_number" text NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text,
	"notes" text,
	"pdf_storage_key" text,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"assigned_attorney_id" uuid,
	"duplicate_of_id" uuid,
	"converted_transaction_id" uuid,
	"lead_status" "lead_status" DEFAULT 'NEW' NOT NULL,
	"transaction_type" "transaction_type",
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"property_address" text,
	"inquiry_description" text NOT NULL,
	"source" text NOT NULL,
	"referral_name" text,
	"referral_source_type" "referral_source_type",
	"referral_source_name" text,
	"conflict_check_status" text DEFAULT 'PENDING' NOT NULL,
	"conflict_check_notes" text,
	"conflict_check_completed_at" timestamp with time zone,
	"ip_address" text,
	"idempotency_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "matter_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"granted_by_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matter_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"role" "party_role" NOT NULL,
	"type" "party_type" NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company_name" text,
	"license_number" text,
	"address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"assigned_to_id" uuid,
	"completed_by_id" uuid,
	"task_status" "task_status" DEFAULT 'OPEN' NOT NULL,
	"priority" "task_priority" DEFAULT 'NORMAL' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"attorney_id" uuid NOT NULL,
	"source_activity_id" uuid,
	"source" time_entry_source DEFAULT 'MANUAL' NOT NULL,
	"entry_status" time_entry_status DEFAULT 'CONFIRMED' NOT NULL,
	"description" text NOT NULL,
	"hours" numeric(5, 2) NOT NULL,
	"billing_rate" numeric(8, 2) NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"entry_date" timestamp with time zone DEFAULT now() NOT NULL,
	"invoiced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transaction_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid,
	"event_type" text NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"assigned_attorney_id" uuid NOT NULL,
	"assigned_paralegal_id" uuid,
	"transaction_type" "transaction_type" NOT NULL,
	"status" "transaction_status" DEFAULT 'INTAKE' NOT NULL,
	"transaction_number" text NOT NULL,
	"title" text NOT NULL,
	"property_address" text NOT NULL,
	"property_city" text DEFAULT 'Austin' NOT NULL,
	"property_state" text DEFAULT 'TX' NOT NULL,
	"property_zip" text,
	"effective_date" timestamp with time zone,
	"contract_date" timestamp with time zone,
	"option_period_expiry" timestamp with time zone,
	"financing_deadline" timestamp with time zone,
	"inspection_deadline" timestamp with time zone,
	"title_deadline" timestamp with time zone,
	"closing_date" timestamp with time zone,
	"possession_date" timestamp with time zone,
	"purchase_price" numeric(12, 2),
	"earnest_money_amount" numeric(10, 2),
	"option_fee" numeric(8, 2),
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"referral_source_type" "referral_source_type",
	"referral_source_name" text,
	"outcome_reason" "outcome_reason",
	"outcome_notes" text,
	"cycle_time_days" integer,
	"conflict_check_status" text DEFAULT 'PENDING' NOT NULL,
	"conflict_check_notes" text,
	"conflict_check_completed_at" timestamp with time zone,
	"ai_disclosure_acknowledged_at" timestamp with time zone,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"auth_id" uuid,
	"transaction_id" uuid,
	"invited_by_id" uuid,
	"role" "user_role" NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"bar_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notification_opted_out" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"ai_policy_acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_id_unique" UNIQUE("auth_id")
);
--> statement-breakpoint
CREATE TABLE "verified_wire_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"party_id" uuid,
	"verified_by_id" uuid NOT NULL,
	"verification_method" "wire_verification_method" NOT NULL,
	"institution_name" text NOT NULL,
	"routing_number" text NOT NULL,
	"account_last4" text NOT NULL,
	"account_hash" text NOT NULL,
	"verification_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wire_flag_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"source_document_id" uuid,
	"resolved_by_id" uuid,
	"flag_type" text NOT NULL,
	"detected_routing_number" text,
	"detected_account_last4" text,
	"resolution" text,
	"resolution_notes" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access_tokens" ADD CONSTRAINT "client_access_tokens_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_access_tokens" ADD CONSTRAINT "client_access_tokens_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_messages" ADD CONSTRAINT "client_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_logged_by_id_users_id_fk" FOREIGN KEY ("logged_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_superseded_by_id_deadlines_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."deadlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_supersedes_id_deadlines_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."deadlines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_checklist_items" ADD CONSTRAINT "document_checklist_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_checklist_items" ADD CONSTRAINT "document_checklist_items_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_checklist_items" ADD CONSTRAINT "document_checklist_items_received_document_id_documents_id_fk" FOREIGN KEY ("received_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_versions" ADD CONSTRAINT "draft_versions_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_versions" ADD CONSTRAINT "draft_versions_edited_by_id_users_id_fk" FOREIGN KEY ("edited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_attorney_id_users_id_fk" FOREIGN KEY ("assigned_attorney_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_duplicate_of_id_leads_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_access" ADD CONSTRAINT "matter_access_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_access" ADD CONSTRAINT "matter_access_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_access" ADD CONSTRAINT "matter_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_access" ADD CONSTRAINT "matter_access_granted_by_id_users_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_notes" ADD CONSTRAINT "matter_notes_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_notes" ADD CONSTRAINT "matter_notes_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_notes" ADD CONSTRAINT "matter_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_attorney_id_users_id_fk" FOREIGN KEY ("attorney_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_source_activity_id_transaction_activities_id_fk" FOREIGN KEY ("source_activity_id") REFERENCES "public"."transaction_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_activities" ADD CONSTRAINT "transaction_activities_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_activities" ADD CONSTRAINT "transaction_activities_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_activities" ADD CONSTRAINT "transaction_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_assigned_attorney_id_users_id_fk" FOREIGN KEY ("assigned_attorney_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_assigned_paralegal_id_users_id_fk" FOREIGN KEY ("assigned_paralegal_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_wire_instructions" ADD CONSTRAINT "verified_wire_instructions_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_wire_instructions" ADD CONSTRAINT "verified_wire_instructions_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_wire_instructions" ADD CONSTRAINT "verified_wire_instructions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_wire_instructions" ADD CONSTRAINT "verified_wire_instructions_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wire_flag_events" ADD CONSTRAINT "wire_flag_events_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wire_flag_events" ADD CONSTRAINT "wire_flag_events_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wire_flag_events" ADD CONSTRAINT "wire_flag_events_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wire_flag_events" ADD CONSTRAINT "wire_flag_events_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_log_firm_id_created_at_idx" ON "access_log" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE INDEX "access_log_transaction_id_idx" ON "access_log" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_transaction_id_idx" ON "chat_sessions" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "client_messages_transaction_id_created_at_idx" ON "client_messages" USING btree ("transaction_id","created_at");--> statement-breakpoint
CREATE INDEX "communications_transaction_id_occurred_at_idx" ON "communications" USING btree ("transaction_id","occurred_at");--> statement-breakpoint
CREATE INDEX "deadlines_transaction_id_status_idx" ON "deadlines" USING btree ("transaction_id","status");--> statement-breakpoint
CREATE INDEX "deadlines_firm_id_due_at_idx" ON "deadlines" USING btree ("firm_id","due_at");--> statement-breakpoint
CREATE INDEX "document_checklist_items_transaction_id_idx" ON "document_checklist_items" USING btree ("transaction_id","status");--> statement-breakpoint
CREATE INDEX "document_chunks_transaction_firm_idx" ON "document_chunks" USING btree ("transaction_id","firm_id");--> statement-breakpoint
CREATE INDEX "documents_transaction_id_processing_status_idx" ON "documents" USING btree ("transaction_id","processing_status");--> statement-breakpoint
CREATE INDEX "draft_versions_draft_id_version_idx" ON "draft_versions" USING btree ("draft_id","version_number");--> statement-breakpoint
CREATE INDEX "drafts_transaction_id_idx" ON "drafts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "email_jobs_firm_id_created_at_idx" ON "email_jobs" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE INDEX "holidays_date_idx" ON "holidays" USING btree ("date");--> statement-breakpoint
CREATE INDEX "leads_firm_id_status_idx" ON "leads" USING btree ("firm_id","lead_status");--> statement-breakpoint
CREATE INDEX "leads_firm_id_created_at_idx" ON "leads" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "matter_access_transaction_user_idx" ON "matter_access" USING btree ("transaction_id","user_id");--> statement-breakpoint
CREATE INDEX "matter_notes_transaction_id_created_at_idx" ON "matter_notes" USING btree ("transaction_id","created_at");--> statement-breakpoint
CREATE INDEX "parties_transaction_id_idx" ON "parties" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "tasks_transaction_id_status_idx" ON "tasks" USING btree ("transaction_id","task_status");--> statement-breakpoint
CREATE INDEX "tasks_assigned_to_id_idx" ON "tasks" USING btree ("assigned_to_id");--> statement-breakpoint
CREATE INDEX "time_entries_transaction_id_invoiced_idx" ON "time_entries" USING btree ("transaction_id","invoiced");--> statement-breakpoint
CREATE INDEX "time_entries_attorney_id_idx" ON "time_entries" USING btree ("attorney_id");--> statement-breakpoint
CREATE INDEX "transaction_activities_transaction_id_created_at_idx" ON "transaction_activities" USING btree ("transaction_id","created_at");--> statement-breakpoint
CREATE INDEX "transaction_activities_event_type_idx" ON "transaction_activities" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "transactions_firm_id_status_idx" ON "transactions" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "transactions_closing_date_idx" ON "transactions" USING btree ("closing_date");--> statement-breakpoint
CREATE INDEX "transactions_assigned_attorney_id_idx" ON "transactions" USING btree ("assigned_attorney_id");--> statement-breakpoint
CREATE INDEX "verified_wire_instructions_transaction_party_idx" ON "verified_wire_instructions" USING btree ("transaction_id","party_id");--> statement-breakpoint
CREATE INDEX "wire_flag_events_transaction_id_idx" ON "wire_flag_events" USING btree ("transaction_id");