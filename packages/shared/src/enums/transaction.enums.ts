export const TRANSACTION_TYPES = ['PURCHASE', 'SALE', 'REFINANCE', 'LEASE', 'COMMERCIAL'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = [
  'INTAKE',
  'UNDER_CONTRACT',
  'DUE_DILIGENCE',
  'TITLE_REVIEW',
  'CLOSING_PREP',
  'CLOSED',
  'FALLEN_THROUGH',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Terminal states. No transition leaves these — enforced in TransactionsService. */
export const TERMINAL_TRANSACTION_STATUSES = ['CLOSED', 'FALLEN_THROUGH'] as const;

export const PARTY_ROLES = [
  'BUYER',
  'SELLER',
  'BUYERS_AGENT',
  'SELLERS_AGENT',
  'TITLE_COMPANY',
  'LENDER',
  'INSPECTOR',
  'SURVEYOR',
  'OPPOSING_COUNSEL',
  'HOA',
  'OTHER',
  // [PHASE 2] PI expansion: PLAINTIFF, DEFENDANT, INSURANCE_CARRIER, ADJUSTER,
  // JUDGE, EXPERT_WITNESS, TREATING_PROVIDER, CO_COUNSEL
] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const PARTY_TYPES = ['PERSON', 'ORGANIZATION'] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const OUTCOME_REASONS = [
  'CLOSED_ON_TIME',
  'CLOSED_DELAYED',
  'FINANCING_DENIED',
  'INSPECTION_ISSUES',
  'TITLE_DEFECT',
  'APPRAISAL_GAP',
  'BUYER_TERMINATED_OPTION',
  'SELLER_TERMINATED',
  'PARTIES_RENEGOTIATED_ELSEWHERE',
  'OTHER',
] as const;
export type OutcomeReason = (typeof OUTCOME_REASONS)[number];
