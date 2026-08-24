import type {
  OutcomeReason,
  PartyRole,
  PartyType,
  ReferralSourceType,
  TransactionStatus,
  TransactionType,
} from '@counselos/shared';

/**
 * The shapes `GET /v1/transactions` and `/v1/transactions/:id` return.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DECLARED HERE RATHER THAN IN `packages/shared`, WHICH IS FOUNDATIONS' FILE.
 *
 * A response type belongs in packages/shared so it cannot drift between the two
 * apps — that is the rule, and this is a deviation from it forced by the slice
 * boundary, not a preference. Filed in `.team-5/log/error-log.md` to be hoisted
 * into `packages/shared/src/types/transaction.ts` by Foundations, at which point
 * this file is deleted rather than kept in sync.
 *
 * The ENUMS below are imported from packages/shared, so the values cannot
 * drift even while the envelope lives here. That is the part that matters.
 * ─────────────────────────────────────────────────────────────────────────────
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
export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; hasMore: boolean };
}
