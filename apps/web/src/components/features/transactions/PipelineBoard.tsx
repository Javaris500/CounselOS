'use client';

import { useState } from 'react';

import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api/client';

import { CreateTransactionDialog } from './CreateTransactionDialog';
import { TransactionCard } from './TransactionCard';
import { COLUMN_EMPTY, PIPELINE_COLUMNS, STATUS_LABELS } from './status-ladder';
import { MattersList } from './MattersList';
import { ViewSwitch, useMattersView } from './ViewSwitch';
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
  const [view, setView] = useMattersView();

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
          layout="page"
          title="No active matters"
          description="Open your first one and CounselOS starts working immediately — deadlines extracted from the contract, documents classified on upload, nothing to configure."
          action={newMatterButton}
        />
        {dialog}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header
        count={total}
        action={
          <>
            <ViewSwitch view={view} onChange={setView} />
            {newMatterButton}
          </>
        }
      />

      {/* Honest about the page boundary rather than silently showing a slice. */}
      {hasMore ? (
        <p className={styles.truncation} data-testid="transaction-pipeline-truncated">
          Showing the {rows.length} most recent of {total} matters.
        </p>
      ) : null}

      {view === 'list' ? <MattersList rows={rows} /> : null}

      {/*
        Conditionally rendered, NOT `hidden`.
        
        `hidden` sets `display: none` in the UA stylesheet, and `.board` sets
        `display: grid` — an author rule beats a UA one, so the board rendered
        underneath the list. Exactly the bug `<dialog>` had earlier today with
        `display: flex` overriding its closed state. Where a component sets its
        own `display`, `hidden` is not a hiding mechanism.
      */}
      {view === 'list' ? null : (
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
                  /*
                    Not an EmptyState — a page-level state repeated per column
                    would drown the board. One line that names what belongs in
                    THIS rung, because "Nothing here" says neither what is true
                    nor what to do (07, Voice). The header already carries the
                    count, so this never repeats it.
                  */
                  <p className={styles.columnEmpty}>{COLUMN_EMPTY[status]}</p>
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
      )}

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
        {/*
          "Matters", not "Transactions". The rail, the docs and the attorneys
          all say matter; only this heading said transaction, and a product that
          calls one thing two names makes people wonder whether they are two
          things. The TABLE is `transactions` and stays that way — the schema is
          not the vocabulary.
        */}
        <h1 className={styles.heading}>Matters</h1>
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
