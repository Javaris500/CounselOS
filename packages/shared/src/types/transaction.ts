import type {
  PaginationMeta,
  OutcomeReason,
  PartyRole,
  PartyType,
  ReferralSourceType,
  TransactionStatus,
  TransactionType,
} from '../index.js';

/**
 * The shapes the transaction endpoints return.
 *
 * Hoisted from `apps/web/src/components/features/transactions/transaction.types.ts`
 * by Foundations, 2026-08-23, closing error-log row 3. The transactions agent
 * declared them locally because `packages/shared` is outside its slice
 * boundary, flagged it as a blocker rather than letting it stand, and kept the
 * ENUMS imported from here so values could not drift while the envelope was
 * local. This is the envelope coming home.
 *
 * A response type lives here so it cannot differ between the API and the web
 * app: a mismatch becomes a compile error instead of a bug report.
 */
export interface Party {
  id: string;
  transactionId: string;
  role: PartyRole;
  type: PartyType;
  name: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  licenseNumber: string | null;
  address: string | null;
  notes: string | null;
}

export interface Transaction {
  id: string;
  firmId: string;
  transactionNumber: string;
  title: string;
  status: TransactionStatus;
  transactionType: TransactionType;

  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  propertyZip: string | null;

  assignedAttorneyId: string;
  assignedParalegalId: string | null;

  effectiveDate: string | null;
  contractDate: string | null;
  closingDate: string | null;
  possessionDate: string | null;

  /** `numeric` columns are strings end to end — never routed through a float. */
  purchasePrice: string | null;
  earnestMoneyAmount: string | null;
  optionFee: string | null;

  tags: string[];
  isArchived: boolean;

  referralSourceType: ReferralSourceType | null;
  referralSourceName: string | null;

  outcomeReason: OutcomeReason | null;
  outcomeNotes: string | null;
  cycleTimeDays: number | null;
  closedAt: string | null;
  retentionUntil: string | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * The detail payload.
 *
 * `allowedTransitions` is the server's transition map, evaluated for THIS
 * matter's current status and sent down — so the status control offers exactly
 * the states the server will accept without the frontend keeping a second copy
 * of the ladder. A duplicated map is the classic way a UI starts offering a
 * transition the server refuses, and it drifts silently the first time the
 * ladder changes.
 */
export interface TransactionDetail extends Transaction {
  parties: Party[];
  allowedTransitions: TransactionStatus[];
}

export interface ActivityEntry {
  id: string;
  transactionId: string;
  userId: string | null;
  eventType: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AccessGrant {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  grantedById: string;
  expiresAt: string | null;
  createdAt: string;
}

/** `{ data, meta }` — the envelope's paginated form (04-data-contracts). */
/**
 * What `apiFetch` returns for a paginated route — the envelope, not the bare
 * array. `meta` is required here and optional on `ApiSuccess` because a route
 * either paginates or does not: if you annotate a hook with this type and the
 * endpoint sends no `meta`, the hook is wrong, not the response.
 */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}
