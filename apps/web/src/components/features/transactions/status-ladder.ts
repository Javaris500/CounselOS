import type { TransactionStatus } from '@counselos/shared';
import type { BadgeTone } from '@/components/ui';

/**
 * How a status is DISPLAYED. Not which transitions are legal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THERE IS NO TRANSITION MAP ON THE FRONTEND, DELIBERATELY.
 *
 * The server owns the ladder (`constants/status-transitions.ts`) and sends the
 * legal next states down as `allowedTransitions` on the detail payload. A
 * second copy here would look harmless and would drift the first time the
 * ladder changes — the UI would offer a transition the server refuses, which
 * reads to an attorney as the product being broken.
 *
 * Labels and colours are presentation, and presentation is the frontend's.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Column order on the pipeline board. Mirrors the ladder's reading order. */
export const PIPELINE_COLUMNS: readonly TransactionStatus[] = [
  'INTAKE',
  'UNDER_CONTRACT',
  'DUE_DILIGENCE',
  'TITLE_REVIEW',
  'CLOSING_PREP',
  'CLOSED',
  'FALLEN_THROUGH',
];

export const STATUS_LABELS: Record<TransactionStatus, string> = {
  INTAKE: 'Intake',
  UNDER_CONTRACT: 'Under Contract',
  DUE_DILIGENCE: 'Due Diligence',
  TITLE_REVIEW: 'Title Review',
  CLOSING_PREP: 'Closing Prep',
  CLOSED: 'Closed',
  FALLEN_THROUGH: 'Fell Through',
};

/**
 * Badge tone per status.
 *
 * NEVER HUE ALONE — the Badge's label text is mandatory and is the second
 * signal, so the ladder still reads with colour removed. Tones climb with
 * proximity to closing, which is the thing an attorney is scanning for.
 */
export const STATUS_TONES: Record<TransactionStatus, BadgeTone> = {
  INTAKE: 'neutral',
  UNDER_CONTRACT: 'info',
  DUE_DILIGENCE: 'info',
  TITLE_REVIEW: 'warning',
  CLOSING_PREP: 'urgent',
  CLOSED: 'done',
  FALLEN_THROUGH: 'neutral',
};

export const OUTCOME_LABELS: Record<string, string> = {
  CLOSED_ON_TIME: 'Closed on time',
  CLOSED_DELAYED: 'Closed, delayed',
  FINANCING_DENIED: 'Financing denied',
  INSPECTION_ISSUES: 'Inspection issues',
  TITLE_DEFECT: 'Title defect',
  APPRAISAL_GAP: 'Appraisal gap',
  BUYER_TERMINATED_OPTION: 'Buyer terminated in option period',
  SELLER_TERMINATED: 'Seller terminated',
  PARTIES_RENEGOTIATED_ELSEWHERE: 'Parties renegotiated elsewhere',
  OTHER: 'Other',
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Purchase',
  SALE: 'Sale',
  REFINANCE: 'Refinance',
  LEASE: 'Lease',
  COMMERCIAL: 'Commercial',
};

export const PARTY_ROLE_LABELS: Record<string, string> = {
  BUYER: 'Buyer',
  SELLER: 'Seller',
  BUYERS_AGENT: "Buyer's Agent",
  SELLERS_AGENT: "Seller's Agent",
  TITLE_COMPANY: 'Title Company',
  LENDER: 'Lender',
  INSPECTOR: 'Inspector',
  SURVEYOR: 'Surveyor',
  OPPOSING_COUNSEL: 'Opposing Counsel',
  HOA: 'HOA',
  OTHER: 'Other',
};

/** `615000.00` → `$615,000`. Cents are noise on a list scanned at a glance. */
export const formatMoney = (value: string | null): string | null => {
  if (value === null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
};

/** Dates render in the firm's timezone, not the browser's — Austin, always. */
export const formatDate = (value: string | null): string | null => {
  if (value === null) return null;
  return new Date(value).toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
