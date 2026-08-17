CREATE TYPE "public"."checklist_item_status" AS ENUM('PENDING', 'RECEIVED', 'WAIVED', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."communication_direction" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TYPE "public"."communication_type" AS ENUM('PHONE_CALL', 'EMAIL', 'IN_PERSON', 'TEXT', 'VOICEMAIL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."deadline_status" AS ENUM('PENDING_REVIEW', 'ACTIVE', 'COMPLETED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."deadline_type" AS ENUM('OPTION_PERIOD_EXPIRY', 'OPTION_FEE_DELIVERY', 'EARNEST_MONEY_DELIVERY', 'FINANCING_CONTINGENCY', 'INSPECTION_DEADLINE', 'CLOSING_DATE', 'TITLE_COMMITMENT_DEADLINE', 'SURVEY_DEADLINE', 'HOA_APPROVAL', 'POSSESSION_DATE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."deadline_urgency" AS ENUM('INFO', 'WARNING', 'URGENT', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."document_processing_status" AS ENUM('PENDING', 'PROCESSING', 'EXTRACTING', 'EMBEDDING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('PURCHASE_AGREEMENT', 'LEASE', 'TITLE_COMMITMENT', 'SURVEY', 'INSPECTION_REPORT', 'CLOSING_DISCLOSURE', 'DEED', 'AMENDMENT', 'ADDENDUM', 'WIRE_INSTRUCTIONS', 'CORRESPONDENCE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."draft_generated_by" AS ENUM('AI', 'USER');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('GENERATING', 'READY', 'IN_REVIEW', 'APPROVED', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."draft_type" AS ENUM('AMENDMENT', 'EXTENSION_ADDENDUM', 'EARNEST_MONEY_DEMAND', 'LEASE_MODIFICATION', 'CLOSING_INSTRUCTION_LETTER', 'ENGAGEMENT_LETTER', 'STATUS_UPDATE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."email_job_status" AS ENUM('QUEUED', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'SENT', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('NEW', 'REVIEWED', 'CONVERTED', 'REJECTED', 'DUPLICATE');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('USER', 'ASSISTANT');--> statement-breakpoint
CREATE TYPE "public"."outcome_reason" AS ENUM('CLOSED_ON_TIME', 'CLOSED_DELAYED', 'FINANCING_DENIED', 'INSPECTION_ISSUES', 'TITLE_DEFECT', 'APPRAISAL_GAP', 'BUYER_TERMINATED_OPTION', 'SELLER_TERMINATED', 'PARTIES_RENEGOTIATED_ELSEWHERE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."party_role" AS ENUM('BUYER', 'SELLER', 'BUYERS_AGENT', 'SELLERS_AGENT', 'TITLE_COMPANY', 'LENDER', 'INSPECTOR', 'SURVEYOR', 'OPPOSING_COUNSEL', 'HOA', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."party_type" AS ENUM('PERSON', 'ORGANIZATION');--> statement-breakpoint
CREATE TYPE "public"."referral_source_type" AS ENUM('REALTOR', 'PAST_CLIENT', 'ATTORNEY', 'LENDER', 'TITLE_COMPANY', 'WEB_SEARCH', 'WALK_IN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('NORMAL', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."time_entry_source" AS ENUM('MANUAL', 'SUGGESTED');--> statement-breakpoint
CREATE TYPE "public"."time_entry_status" AS ENUM('DRAFT', 'CONFIRMED');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('INTAKE', 'UNDER_CONTRACT', 'DUE_DILIGENCE', 'TITLE_REVIEW', 'CLOSING_PREP', 'CLOSED', 'FALLEN_THROUGH');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('PURCHASE', 'SALE', 'REFINANCE', 'LEASE', 'COMMERCIAL');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('OWNER', 'ATTORNEY', 'PARALEGAL', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."wire_verification_method" AS ENUM('PHONE', 'IN_PERSON', 'SECURE_PORTAL');