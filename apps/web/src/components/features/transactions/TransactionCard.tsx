'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui';

import styles from './TransactionCard.module.css';
import {
  STATUS_LABELS,
  STATUS_TONES,
  TRANSACTION_TYPE_LABELS,
  formatDate,
  formatMoney,
} from './status-ladder';
import type { Transaction } from './transaction.types';

/**
 * One matter on the pipeline board.
 *
 * COMPACT DENSITY. This is scanned twenty times a day, not read — the attorney
 * is looking for "which of these closes this week", so the closing date and the
 * number carry the most weight and everything else is secondary. A comfortable
 * row height here would mean two matters per column instead of six.
 */
export function TransactionCard({ transaction }: { transaction: Transaction }): React.JSX.Element {
  const price = formatMoney(transaction.purchasePrice);
  const closing = formatDate(transaction.closingDate);

  return (
    <Link
      href={`/transactions/${transaction.id}`}
      className={styles.card}
      data-testid="transaction-card"
      data-transaction-id={transaction.id}
      data-status={transaction.status}
    >
      <div className={styles.header}>
        <span className={`${styles.number} tabular`}>{transaction.transactionNumber}</span>
        <Badge tone={STATUS_TONES[transaction.status]}>{STATUS_LABELS[transaction.status]}</Badge>
      </div>

      <p className={styles.title}>{transaction.title}</p>
      <p className={styles.address}>{transaction.propertyAddress}</p>

      <dl className={styles.meta}>
        <div>
          <dt>Type</dt>
          <dd>{TRANSACTION_TYPE_LABELS[transaction.transactionType] ?? transaction.transactionType}</dd>
        </div>
        {price === null ? null : (
          <div>
            <dt>Price</dt>
            <dd className="tabular">{price}</dd>
          </div>
        )}
        {closing === null ? null : (
          <div>
            <dt>Closes</dt>
            <dd className="tabular">{closing}</dd>
          </div>
        )}
      </dl>
    </Link>
  );
}
