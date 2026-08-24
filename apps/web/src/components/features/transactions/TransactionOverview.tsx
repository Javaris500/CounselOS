'use client';

import { ActivityFeed } from './ActivityFeed';
import { PartiesList } from './PartiesList';
import { StatusControl } from './StatusControl';
import { OUTCOME_LABELS, TRANSACTION_TYPE_LABELS, formatDate, formatMoney } from './status-ladder';
import { useTransactionContext } from './TransactionShell';
import styles from './TransactionOverview.module.css';

/**
 * The overview tab — the matter at a glance, and the only place status moves.
 *
 * Reads the transaction from context rather than refetching it: the shell
 * already has it, and a second fetch of the same key would be a duplicate
 * request for a value already in the SWR cache (06 Part 9).
 */
export function TransactionOverview(): React.JSX.Element {
  const transaction = useTransactionContext();

  return (
    <div className={styles.grid}>
      <div className={styles.main}>
        <section className={styles.panel}>
          <h2 className={styles.heading}>Status</h2>
          <StatusControl transaction={transaction} />
        </section>

        {/* The outcome, once it exists, is the answer to "why did this end?" —
            surfaced rather than buried, because it is the reason we insisted on
            capturing it at the one moment it was knowable. */}
        {transaction.outcomeReason === null ? null : (
          <section className={styles.panel} data-testid="transaction-outcome">
            <h2 className={styles.heading}>Outcome</h2>
            <p className={styles.outcome}>
              {OUTCOME_LABELS[transaction.outcomeReason] ?? transaction.outcomeReason}
            </p>
            {transaction.outcomeNotes === null ? null : (
              <p className={styles.outcomeNotes}>{transaction.outcomeNotes}</p>
            )}
            <dl className={styles.details}>
              {transaction.closedAt === null ? null : (
                <div>
                  <dt>Ended</dt>
                  <dd className="tabular">{formatDate(transaction.closedAt)}</dd>
                </div>
              )}
              {transaction.cycleTimeDays === null ? null : (
                <div>
                  <dt>Cycle time</dt>
                  <dd className="tabular">{transaction.cycleTimeDays} days</dd>
                </div>
              )}
              {transaction.retentionUntil === null ? null : (
                <div>
                  <dt>Retain until</dt>
                  <dd className="tabular">{formatDate(transaction.retentionUntil)}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        <section className={styles.panel}>
          <h2 className={styles.heading}>Parties</h2>
          <PartiesList parties={transaction.parties} />
        </section>
      </div>

      <aside className={styles.side}>
        <section className={styles.panel}>
          <h2 className={styles.heading}>Details</h2>
          <dl className={styles.details}>
            <div>
              <dt>Type</dt>
              <dd>
                {TRANSACTION_TYPE_LABELS[transaction.transactionType] ??
                  transaction.transactionType}
              </dd>
            </div>
            <Detail label="Effective" value={formatDate(transaction.effectiveDate)} tabular />
            <Detail label="Contract" value={formatDate(transaction.contractDate)} tabular />
            <Detail label="Closing" value={formatDate(transaction.closingDate)} tabular />
            <Detail label="Purchase price" value={formatMoney(transaction.purchasePrice)} tabular />
            <Detail
              label="Earnest money"
              value={formatMoney(transaction.earnestMoneyAmount)}
              tabular
            />
            <Detail label="Option fee" value={formatMoney(transaction.optionFee)} tabular />
            <Detail
              label="Referred by"
              value={transaction.referralSourceName ?? transaction.referralSourceType}
            />
          </dl>

          {transaction.tags.length === 0 ? null : (
            <ul className={styles.tags}>
              {transaction.tags.map((tag) => (
                <li key={tag} className={styles.tag}>
                  {tag.replaceAll('_', ' ')}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <h2 className={styles.heading}>Activity</h2>
          <ActivityFeed transactionId={transaction.id} />
        </section>
      </aside>
    </div>
  );
}

function Detail({
  label,
  value,
  tabular = false,
}: {
  label: string;
  value: string | null;
  tabular?: boolean;
}): React.JSX.Element | null {
  // An absent optional field renders as nothing, not as "—". A dash reads as a
  // recorded value of none, which for `effective_date` is a different claim.
  if (value === null) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd className={tabular ? 'tabular' : undefined}>{value}</dd>
    </div>
  );
}
