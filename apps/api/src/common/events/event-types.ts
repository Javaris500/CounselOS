/**
 * Every event type the activity log can record (05 §3D).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER A RAW STRING AT A CALL SITE.
 *
 * `transaction_activities.event_type` is a plain text column — Postgres will
 * accept `'transaction.stauts_changed'` without complaint, and the row is
 * indistinguishable from a correct one until someone filters the feed and finds
 * a gap. A typed constant makes the typo a compile error instead.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NAMING: 05 §3D calls this "the `EventType` constant object". It is exported
 * as `EVENT_TYPES` (object) + `EventType` (type) to match the two precedents
 * already in the codebase — `ERROR_CODES`/`ErrorCode` and
 * `SSE_EVENTS`/`SseEventType`. One convention, three files.
 *
 * NOT THE SAME THING AS `SSE_EVENTS`. These are durable facts written to a
 * table and read back as history. SSE events are transient notifications that
 * invalidate a cache key and are never stored. A few names look similar
 * (`document.ready`); they are different concerns and must not be merged.
 *
 * Backend-only, so it lives here rather than in `packages/shared`: the frontend
 * renders `description`, which is written in code at the moment the event
 * happens. It never switches on `event_type`.
 */
export const EVENT_TYPES = {
  // --- transaction (Module 3) ---
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_STATUS_CHANGED: 'transaction.status_changed',
  TRANSACTION_ARCHIVED: 'transaction.archived',
  TRANSACTION_NOTES_UPDATED: 'transaction.notes_updated',

  // --- parties (Module 3) ---
  PARTY_ADDED: 'party.added',
  PARTY_UPDATED: 'party.updated',
  PARTY_REMOVED: 'party.removed',

  // --- documents (Module 4) ---
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_READY: 'document.ready',
  DOCUMENT_FAILED: 'document.failed',
  DOCUMENT_DELETED: 'document.deleted',
  DOCUMENT_MADE_CLIENT_VISIBLE: 'document.made_client_visible',

  // --- deadlines (Module 6) ---
  DEADLINE_EXTRACTED: 'deadline.extracted',
  DEADLINE_CONFIRMED: 'deadline.confirmed',
  DEADLINE_DISMISSED: 'deadline.dismissed',
  DEADLINE_COMPLETED: 'deadline.completed',
  DEADLINE_ALERT_SENT: 'deadline.alert_sent',
  DEADLINE_ADDED_MANUALLY: 'deadline.added_manually',

  // --- drafts (Module 7) ---
  DRAFT_GENERATED: 'draft.generated',
  DRAFT_APPROVED: 'draft.approved',
  DRAFT_SENT: 'draft.sent',

  // --- client portal (Module 10) ---
  CLIENT_INVITED: 'client.invited',
  CLIENT_PORTAL_ACCESSED: 'client.portal_accessed',

  // --- chat (Module 5) ---
  CHAT_SESSION_STARTED: 'chat.session_started',

  // --- matter access (Module 8G) ---
  // Not in 05 §3D's list, which predates 8G. Access grants are exactly the kind
  // of fact the institutional-memory argument is about: "who could see this
  // matter, and who let them" is unanswerable six months later otherwise.
  ACCESS_GRANTED: 'access.granted',
  ACCESS_REVOKED: 'access.revoked',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
