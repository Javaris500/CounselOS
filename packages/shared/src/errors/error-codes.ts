/**
 * Every error code the API can return.
 *
 * The frontend switches on `error.code`, never on `error.message` (00 §10).
 * That inversion is the whole point: changing a message is free, changing a
 * code is a breaking change to the client.
 *
 * ADDING A CODE
 *   Modules add their own as they are built. Add it here first — never throw a
 *   string literal from service code, and never let a code exist in only one of
 *   the two apps.
 *
 * REMOVING OR RENAMING A CODE
 *   Breaking. The frontend may be branching on it. Treat it like an API change.
 *
 * This list is seeded from the codes named in 05-backend-checklist.md and
 * 13-adoption-features.md, plus the structural ones the error envelope needs.
 * It is deliberately not speculative — a code appears when a module throws it.
 */
export const ERROR_CODES = {
  // --- structural: every module can return these ---
  /** Zod pipe rejection. Always 422, always with field-level `details`. */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** Unknown failure. Zero internal detail to the client; full detail to Sentry. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // --- auth (Module 2) ---
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  /** Deactivated user. The frontend routes this to /auth/deactivated, not login. */
  USER_INACTIVE: 'USER_INACTIVE',

  // --- matter access (Module 8G) ---
  /** Denials explain themselves — the UI shows who to ask, not a bare 403. */
  MATTER_ACCESS_DENIED: 'MATTER_ACCESS_DENIED',

  // --- transactions (Module 3) ---
  TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',

  // --- documents (Module 4) ---
  /** Gate 1: MIME type not on the whitelist. */
  FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
  /** Gate 2: declared type and actual bytes disagree. Never trust Content-Type. */
  INVALID_FILE_MAGIC_BYTES: 'INVALID_FILE_MAGIC_BYTES',
  /** Gate 3: over UPLOAD_LIMITS.MAX_FILE_BYTES. */
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',

  // --- drafts (Module 7) — Opinion 705 gate ---
  DRAFT_SECTIONS_NOT_REVIEWED: 'DRAFT_SECTIONS_NOT_REVIEWED',

  // --- business operations (Module 8D) ---
  ENTRY_ALREADY_INVOICED: 'ENTRY_ALREADY_INVOICED',

  // --- leads (Module 8) ---
  CONFLICT_CHECK_REQUIRED: 'CONFLICT_CHECK_REQUIRED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
