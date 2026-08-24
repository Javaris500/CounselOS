import { TERMINAL_TRANSACTION_STATUSES, type TransactionStatus } from '@counselos/shared';

/**
 * The status ladder, enforced in the service layer before any write (05 §3C).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS MAP IS THE RULE. The UI renders its verdict, never its own.
 *
 * A status is a legal state. `DUE_DILIGENCE → CLOSED` skips title review and
 * closing prep, and nothing in the database prevents it — the column is an enum
 * of seven values, not a state machine. This map is the state machine.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Backward edges are deliberate and only where a real deal goes backward: an
 * amendment reopens due diligence from title review, and a title defect sends
 * closing prep back. Both happen. Nothing exits a terminal state — a deal that
 * closed and then unwound is a new matter, not an edited one.
 */
export const VALID_TRANSITIONS: Readonly<Record<TransactionStatus, readonly TransactionStatus[]>> =
  {
    INTAKE: ['UNDER_CONTRACT', 'FALLEN_THROUGH'],
    UNDER_CONTRACT: ['DUE_DILIGENCE', 'FALLEN_THROUGH'],
    DUE_DILIGENCE: ['TITLE_REVIEW', 'UNDER_CONTRACT', 'FALLEN_THROUGH'],
    TITLE_REVIEW: ['CLOSING_PREP', 'DUE_DILIGENCE', 'FALLEN_THROUGH'],
    CLOSING_PREP: ['CLOSED', 'FALLEN_THROUGH'],
    // Terminal. No exits, by design.
    CLOSED: [],
    FALLEN_THROUGH: [],
  } as const;

/** The columns of the pipeline board, in ladder order. */
export const PIPELINE_ORDER: readonly TransactionStatus[] = [
  'INTAKE',
  'UNDER_CONTRACT',
  'DUE_DILIGENCE',
  'TITLE_REVIEW',
  'CLOSING_PREP',
  'CLOSED',
  'FALLEN_THROUGH',
] as const;

/** Where a matter can legally go from here. The UI renders exactly this list. */
export const allowedTransitionsFrom = (from: TransactionStatus): readonly TransactionStatus[] =>
  VALID_TRANSITIONS[from];

export const isValidTransition = (from: TransactionStatus, to: TransactionStatus): boolean =>
  VALID_TRANSITIONS[from].includes(to);

/**
 * CLOSED and FALLEN_THROUGH. Reaching either writes five columns, not one
 * (05 §3C, corrected 2026-08-18) — see `TransactionsService.updateStatus()`.
 */
export const isTerminal = (status: TransactionStatus): boolean =>
  (TERMINAL_TRANSACTION_STATUSES as readonly TransactionStatus[]).includes(status);

/** Texas real estate matters retain for 7 years from close (05 §3C). */
export const RETENTION_YEARS = 7;
