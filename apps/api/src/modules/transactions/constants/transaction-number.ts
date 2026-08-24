/**
 * `RE-2026-0042` — the identifier attorneys actually use.
 *
 * It appears in emails to title companies, in phone calls, and on
 * correspondence. A UUID is not usable in a sentence, which is the entire
 * reason this column exists alongside the primary key.
 *
 * SERVER-GENERATED, ALWAYS. The client never computes or submits one: it is
 * unique per firm among live rows (partial unique index
 * `transactions_transaction_number_active_key`, migration 0002), so a
 * client-side guess races every concurrent create.
 */
const PREFIX = 'RE';
const SEQUENCE_DIGITS = 4;

/** `RE-2026-` — the LIKE prefix for one firm-year's numbers. */
export const transactionNumberPrefix = (year: number): string => `${PREFIX}-${String(year)}-`;

export const formatTransactionNumber = (year: number, sequence: number): string =>
  `${transactionNumberPrefix(year)}${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;

/**
 * The trailing sequence, or 0 for anything that does not parse.
 *
 * Deliberately forgiving. A hand-edited or CSV-imported number that does not
 * match the format must not crash the next create — it reads as 0, the next
 * matter gets a fresh sequence, and an actual duplicate is refused by the
 * unique index rather than by a guess made here.
 */
export const parseSequence = (transactionNumber: string): number => {
  const digits = /-(\d+)$/.exec(transactionNumber)?.[1];
  if (digits === undefined) return 0;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};
