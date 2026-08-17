import type { DocumentProcessingStatus } from '../enums/document.enums.js';
import type { DeadlineUrgency } from '../enums/deadline.enums.js';

/**
 * SSE event types and payloads (05 §11).
 *
 * Both apps import this file, so an event name cannot drift between the emitter
 * and the listener. Events are published through Redis pub/sub because the
 * worker produces most of them while the HTTP process holds the connections
 * (18-nestjs-conventions.md §8).
 *
 * The frontend rule: an SSE event invalidates an SWR key, it does not patch
 * state. Payloads are notifications, not truth. The one exception is
 * `document.status`, which fires many times per document and patches in place
 * (06-frontend-architecture.md).
 */
export const SSE_EVENTS = {
  DOCUMENT_STATUS: 'document.status',
  DOCUMENT_READY: 'document.ready',
  DOCUMENT_FAILED: 'document.failed',
  DEADLINE_ALERT: 'deadline.alert',
  DEADLINE_DISMISSED: 'deadline.dismissed',
  DRAFT_READY: 'draft.ready',
  LEAD_NEW: 'lead.new',
  TASK_ASSIGNED: 'task.assigned',
  CLIENT_PORTAL_ACCESSED: 'client.portal_accessed',
  WIRE_FLAG_RAISED: 'wire.flag_raised',
  /** Sent on reconnect — current state, never a replay of missed events. */
  SNAPSHOT: 'snapshot',
  /** Keepalive every 25s. Railway's proxy kills idle connections at 60s. */
  PING: 'ping',
} as const;

export type SseEventType = (typeof SSE_EVENTS)[keyof typeof SSE_EVENTS];

export interface SseEnvelope<T = unknown> {
  /** Monotonic per firm: INCR sse:eventid:{firmId}. Drives Last-Event-ID. */
  id: number;
  type: SseEventType;
  payload: T;
}

export interface DocumentStatusPayload {
  documentId: string;
  transactionId: string;
  status: DocumentProcessingStatus;
  pageCount?: number;
  /** Human-readable on FAILED. Never a stack trace. */
  processingError?: string;
}

export interface DeadlineAlertPayload {
  deadlineId: string;
  transactionId: string;
  urgency: DeadlineUrgency;
  dueDate: string;
  title: string;
}

export interface DraftReadyPayload {
  draftId: string;
  transactionId: string;
}

export interface LeadNewPayload {
  leadId: string;
  conflictCheckStatus: string;
}

export interface WireFlagPayload {
  transactionId: string;
  flagType: 'NO_BASELINE' | 'MISMATCH';
  sourceDocumentId: string;
}
