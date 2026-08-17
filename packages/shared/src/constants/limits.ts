/**
 * Field limits. Enforced at the Zod pipe as a 422, before anything reaches a
 * service (00 §10, 18 §2). The frontend imports the same numbers to render
 * character counters, so the counter and the validator can never disagree.
 */
export const FIELD_LIMITS = {
  /** Chat message body. */
  CHAT_MESSAGE: 4_000,
  /** Free-text instructions attached to a draft generation request. */
  DRAFT_INSTRUCTIONS: 2_000,
  /** Matter note body. */
  MATTER_NOTE: 2_000,
  /** Communication log summary — deliberately short to keep logging fast. */
  COMMUNICATION_SUMMARY: 500,
} as const;

/** Upload gates, applied in order: MIME whitelist → magic bytes → size (05 §4). */
export const UPLOAD_LIMITS = {
  MAX_FILE_BYTES: 50 * 1024 * 1024, // 50MB
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
} as const;

/** Pagination defaults for every list endpoint. */
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

/**
 * RAG retrieval parameters (05 §5). These are locked — changing one changes
 * answer quality, so they move together and only with a deliberate decision.
 */
export const RAG = {
  /** Chunks below this cosine similarity never reach the model. */
  SIMILARITY_THRESHOLD: 0.7,
  /** Hard ceiling on retrieved context. Never truncate a chunk to fit. */
  CONTEXT_TOKEN_BUDGET: 6_000,
  CHUNK_TOKENS: 512,
  CHUNK_OVERLAP_TOKENS: 50,
} as const;
