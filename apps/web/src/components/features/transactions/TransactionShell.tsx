'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TransactionDetail } from '@counselos/shared';

import { Badge, ErrorState, Skeleton, Tabs, type TabItem } from '@/components/ui';
import { ApiError } from '@/lib/api/client';

import { STATUS_LABELS, STATUS_TONES, formatDate, formatMoney } from './status-ladder';
import { useTransaction } from './useTransactions';
import styles from './TransactionShell.module.css';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * THE FRAME FIVE OTHER SLICES MOUNT INTO. Its contract is additive and stable.
 *
 * Documents, Deadlines, Chat, Drafts and Case Ops each render inside one of the
 * tabs below. That makes this the one surface in the product other agents
 * depend on, so: TABS ARE ADDED, NEVER RESHAPED, NEVER REORDERED, and never
 * renamed. A change to `TABS` is a shared-file touch even though it lives in
 * this slice's own directory, and it is logged in
 * `.team-5/shared/shared-file-touches.md` in the same commit.
 *
 * HOW ANOTHER SLICE MOUNTS:
 *   1. create `app/(attorney)/transactions/[id]/<your-tab>/page.tsx`
 *   2. give your row in TABS an `href` (it is currently disabled)
 *   3. read the matter with `useTransactionContext()` — DO NOT refetch it
 *   4. fetch your own collection with your own key from `queryKeys.ts`
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * THE SHELL FETCHES THE TRANSACTION ONCE (06 Part 9). Status, parties, address
 * and dates are needed by every tab, so they are fetched here and provided by
 * context; each tab fetches only its own collection. Opening one tab must not
 * load nine collections.
 */
const TransactionContext = createContext<TransactionDetail | null>(null);

/** The matter this tab is rendering inside. Never null below the shell. */
export function useTransactionContext(): TransactionDetail {
  const value = useContext(TransactionContext);
  if (value === null) {
    throw new Error('useTransactionContext must be used inside the transaction shell.');
  }
  return value;
}

/**
 * The tab contract.
 *
 * A tab whose slice has not landed carries no `href` and renders disabled, not
 * hidden — same honesty rule as `not_configured` for a dependency. Hiding it
 * would make every arriving slice a layout change, and would tell the attorney
 * the product is smaller than it is.
 */
export const TABS: readonly Omit<TabItem, 'href'>[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'documents', label: 'Documents' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'deadlines', label: 'Deadlines' },
  { key: 'chat', label: 'Chat' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'notes', label: 'Notes' },
  { key: 'communications', label: 'Communications' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'time', label: 'Time' },
];

/** Only `overview` has a route today. A slice landing adds its own key here. */
const LANDED: ReadonlySet<string> = new Set(['overview']);

export function TransactionShell({
  transactionId,
  activeTab,
  children,
}: {
  transactionId: string;
  activeTab: string;
  children: ReactNode;
}): React.JSX.Element {
  const { transaction, isLoading, error } = useTransaction(transactionId);

  if (isLoading) {
    return (
      <div className={styles.shell} data-testid="transaction-shell-loading">
        <Skeleton rows={2} lastRowWidth="40%" />
        <Skeleton rows={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.shell}>
        <ErrorState
          code={error instanceof ApiError ? error.code : undefined}
          message={error instanceof ApiError ? error.message : undefined}
          details={error instanceof ApiError ? error.details : undefined}
          requestId={error instanceof ApiError ? error.requestId : undefined}
        />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className={styles.shell}>
        <ErrorState code="TRANSACTION_NOT_FOUND" />
      </div>
    );
  }

  const price = formatMoney(transaction.purchasePrice);
  const closing = formatDate(transaction.closingDate);
  const effective = formatDate(transaction.effectiveDate);

  return (
    <TransactionContext.Provider value={transaction}>
      <div className={styles.shell} data-testid="transaction-shell">
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={`${styles.number} tabular`}>{transaction.transactionNumber}</span>
            <h1 className={styles.title} data-testid="transaction-title">
              {transaction.title}
            </h1>
            <p className={styles.address}>
              {transaction.propertyAddress}, {transaction.propertyCity} {transaction.propertyState}
              {transaction.propertyZip === null ? '' : ` ${transaction.propertyZip}`}
            </p>
          </div>

          <div className={styles.facts}>
            <Badge tone={STATUS_TONES[transaction.status]}>
              {STATUS_LABELS[transaction.status]}
            </Badge>
            {transaction.isArchived ? <Badge tone="neutral">Archived</Badge> : null}
            <dl className={styles.factList}>
              {effective === null ? null : (
                <div>
                  <dt>Effective</dt>
                  <dd className="tabular">{effective}</dd>
                </div>
              )}
              {closing === null ? null : (
                <div>
                  <dt>Closing</dt>
                  <dd className="tabular">{closing}</dd>
                </div>
              )}
              {price === null ? null : (
                <div>
                  <dt>Price</dt>
                  <dd className="tabular">{price}</dd>
                </div>
              )}
            </dl>
          </div>
        </header>

        <Tabs
          ariaLabel="Matter sections"
          active={activeTab}
          testId="transaction-tabs"
          items={TABS.map((tab) => ({
            ...tab,
            href: LANDED.has(tab.key)
              ? `/transactions/${transactionId}${tab.key === 'overview' ? '' : `/${tab.key}`}`
              : undefined,
          }))}
        />

        <div className={styles.content}>{children}</div>
      </div>
    </TransactionContext.Provider>
  );
}
