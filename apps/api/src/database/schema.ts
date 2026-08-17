import { pgEnum } from 'drizzle-orm/pg-core';
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
 * TABLES ARE NOT WRITTEN YET. They come next, in one pass, from 03-schema.md
 * read alongside 16-compliance-gaps.md — the columns that cannot be honestly
 * backfilled later must exist in the first migration. Do not add tables
 * piecemeal as modules need them.
 */

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
