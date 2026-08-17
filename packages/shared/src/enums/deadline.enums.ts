export const DEADLINE_TYPES = [
  'OPTION_PERIOD_EXPIRY',
  'OPTION_FEE_DELIVERY', // 3 days, does NOT roll for weekends — the TREC trap
  'EARNEST_MONEY_DELIVERY', // 3 days, DOES roll to the next business day
  'FINANCING_CONTINGENCY',
  'INSPECTION_DEADLINE',
  'CLOSING_DATE',
  'TITLE_COMMITMENT_DEADLINE',
  'SURVEY_DEADLINE',
  'HOA_APPROVAL',
  'POSSESSION_DATE',
  'OTHER',
  // [PHASE 2] PI expansion: FILING, RESPONSE, DISCOVERY_CUTOFF,
  // STATUTE_OF_LIMITATIONS, COURT_DATE, DEPOSITION, MEDIATION, EXPERT_DESIGNATION
] as const;
export type DeadlineType = (typeof DEADLINE_TYPES)[number];

export const DEADLINE_STATUSES = [
  'PENDING_REVIEW', // extracted by AI, awaiting attorney confirmation
  'ACTIVE', // confirmed by attorney, alerts enabled
  'COMPLETED', // attorney marked as done
  'DISMISSED', // attorney dismissed, or superseded by an amendment
] as const;
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

export const DEADLINE_URGENCIES = ['INFO', 'WARNING', 'URGENT', 'CRITICAL'] as const;
export type DeadlineUrgency = (typeof DEADLINE_URGENCIES)[number];

/**
 * Day thresholds behind each urgency tier, as inclusive lower bounds on days
 * remaining. Shared so the dashboard's colour coding and the alert scheduler
 * can never disagree about what "URGENT" means.
 *
 *   INFO      14+ days
 *   WARNING    7–13
 *   URGENT     3–6
 *   CRITICAL   0–2
 */
export const URGENCY_THRESHOLD_DAYS = {
  INFO: 14,
  WARNING: 7,
  URGENT: 3,
  CRITICAL: 0,
} as const satisfies Record<DeadlineUrgency, number>;
