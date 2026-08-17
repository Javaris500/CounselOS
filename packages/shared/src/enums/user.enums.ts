export const USER_ROLES = ['OWNER', 'ATTORNEY', 'PARALEGAL', 'CLIENT'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Staff roles — everyone who logs into the attorney product.
 * CLIENT exists in the enum for Phase 2; Phase 1 clients use signed portal
 * tokens and never hold an account (05 §10).
 */
export const STAFF_ROLES = ['OWNER', 'ATTORNEY', 'PARALEGAL'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
