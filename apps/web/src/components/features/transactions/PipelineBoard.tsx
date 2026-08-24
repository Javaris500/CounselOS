'use client';

import { useState } from 'react';

import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api/client';

import { CreateTransactionDialog } from './CreateTransactionDialog';
import { TransactionCard } from './TransactionCard';
import { PIPELINE_COLUMNS, STATUS_LABELS } from './status-ladder';
import { useTransactionList } from './useTransactions';
import styles from './PipelineBoard.module.css';

/**
 * The pipeline — every live matter, in ladder order.
 *
 * FOUR STATES OR IT ISN'T DONE (06 Part 10): a content-shaped skeleton while
 * loading, a designed empty state, an error mapped by `error.code`, and the
 * board itself. A surface that only works with populated happy-path data is
 * unfinished.
 *
 * READ-ONLY COLUMNS, NOT DRAG-AND-DROP. A status is a legal state the server
 * validates against a transition map; dragging a card implies the move already
 * happened, which is the optimism this slice is specifically forbidden from
 * applying. Status changes happen on the detail page, where the reason for a
 * refusal has somewhere to render.
 */
export function PipelineBoard(): React.JSX.Element {
  const { transactions, total, hasMore, isLoading, error } = useTransactionList();
  const [creating, setCreating] = useState(false);

  const newMatterButton = (
    <Button variant="primary" onClick={() => setCreating(true)} data-testid="transaction-create-btn">
      New matter
    </Button>
  );

  const dialog = (
    <CreateTransactionDialog open={creating} onClose={() => setCreating(false)} />
  );

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Header count={null} action={newMatterButton} />
        <div className={styles.board} data-testid="transaction-pipeline-loading">
          {PIPELINE_COLUMNS.slice(0, 5).map((status) => (
            <section key={status} className={styles.column}>
              <h2 className={styles.columnHeader}>{STATUS_LABELS[status]}</h2>
              <Skeleton rows={3} />
            </section>
          ))}
        </div>
        {dialog}
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <Header count={null} action={newMatterButton} />
        <ErrorState
          code={error instanceof ApiError ? error.code : undefined}
          message={error instanceof ApiError ? error.message : undefined}
          details={error instanceof ApiError ? error.details : undefined}
          requestId={error instanceof ApiError ? error.requestId : undefined}
        />
        {dialog}
      </div>
    );
  }

  const rows = transactions ?? [];

  if (rows.length === 0) {
    return (
      <div className={styles.page}>
        <Header count={0} action={newMatterButton} />
        <EmptyState
          title="No active transactions"
          description="Add your first one and CounselOS starts working immediately — deadlines extracted, documents classified, nothing to configure."
          action={newMatterButton}
        />
        {dialog}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header count={total} action={newMatterButton} />

      {/* Honest about the page boundary rather than silently showing a slice. */}
      {hasMore ? (
        <p className={styles.truncation} data-testid="transaction-pipeline-truncated">
          Showing the {rows.length} most recent of {total} matters.
        </p>
      ) : null}

      <div className={styles.board} data-testid="transaction-pipeline">
        {PIPELINE_COLUMNS.map((status) => {
          const column = rows.filter((row) => row.status === status);

          return (
            <section
              key={status}
              className={styles.column}
              data-testid="pipeline-column"
              data-status={status}
            >
              <h2 className={styles.columnHeader}>
                {STATUS_LABELS[status]}
                <span className={`${styles.count} tabular`}>{column.length}</span>
              </h2>

              <div className={styles.stack}>
                {column.length === 0 ? (
                  <p className={styles.columnEmpty}>Nothing here</p>
                ) : (
                  column.map((transaction) => (
                    <TransactionCard key={transaction.id} transaction={transaction} />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {dialog}
    </div>
  );
}

function Header({
  count,
  action,
}: {
  count: number | null;
  action: React.ReactNode;
}): React.JSX.Element {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.heading}>Transactions</h1>
        {count === null ? null : (
          <p className={styles.subheading}>
            {count} {count === 1 ? 'matter' : 'matters'}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}
