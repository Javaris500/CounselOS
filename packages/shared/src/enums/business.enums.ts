export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PAID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const TIME_ENTRY_SOURCES = [
  'MANUAL', // attorney entered it
  'SUGGESTED', // passive capture proposed it (05 §8H)
] as const;
export type TimeEntrySource = (typeof TIME_ENTRY_SOURCES)[number];

export const TIME_ENTRY_STATUSES = ['DRAFT', 'CONFIRMED'] as const;
export type TimeEntryStatus = (typeof TIME_ENTRY_STATUSES)[number];

/** How a wire-instruction baseline was confirmed (05 §8F, 12-moat-features). */
export const WIRE_VERIFICATION_METHODS = [
  'PHONE', // called a known number and confirmed
  'IN_PERSON', // confirmed face to face
  'SECURE_PORTAL', // confirmed via the title company's verified portal
] as const;
export type WireVerificationMethod = (typeof WIRE_VERIFICATION_METHODS)[number];

export const EMAIL_JOB_STATUSES = ['QUEUED', 'SENT', 'FAILED'] as const;
export type EmailJobStatus = (typeof EMAIL_JOB_STATUSES)[number];
