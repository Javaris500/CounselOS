export const DOCUMENT_TYPES = [
  'PURCHASE_AGREEMENT',
  'LEASE',
  'TITLE_COMMITMENT',
  'SURVEY',
  'INSPECTION_REPORT',
  'CLOSING_DISCLOSURE',
  'DEED',
  'AMENDMENT',
  'ADDENDUM',
  'WIRE_INSTRUCTIONS', // triggers wire-fraud verification (05 §8F)
  'CORRESPONDENCE',
  'OTHER',
  // [PHASE 2] PI expansion: MEDICAL_RECORD, COURT_FILING, POLICE_REPORT,
  // INSURANCE_LETTER, DEMAND_LETTER, DEPOSITION, EXPERT_REPORT
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_PROCESSING_STATUSES = [
  'PENDING',
  'PROCESSING',
  'EXTRACTING',
  'EMBEDDING',
  'READY',
  'FAILED',
] as const;
export type DocumentProcessingStatus = (typeof DOCUMENT_PROCESSING_STATUSES)[number];

/**
 * Statuses that mean the pipeline is still running — the UI shows live progress.
 *
 * `satisfies` is load-bearing: without it, renaming a status above still
 * compiles here and silently drops it from the in-flight set, so the UI stops
 * showing progress for that stage. Drift, in the package that exists to prevent
 * drift.
 */
export const IN_FLIGHT_PROCESSING_STATUSES = [
  'PENDING',
  'PROCESSING',
  'EXTRACTING',
  'EMBEDDING',
] as const satisfies readonly DocumentProcessingStatus[];

export const CHECKLIST_ITEM_STATUSES = ['PENDING', 'RECEIVED', 'WAIVED', 'NOT_APPLICABLE'] as const;
export type ChecklistItemStatus = (typeof CHECKLIST_ITEM_STATUSES)[number];
