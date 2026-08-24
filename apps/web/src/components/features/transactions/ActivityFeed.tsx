'use client';

import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api/client';

import { useActivity } from './useTransactions';
import styles from './ActivityFeed.module.css';

/** Absolute date + time, Austin. "3 days ago" is useless in a legal record. */
const stamp = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * The matter's institutional memory.
 *
 * Every mutation on a transaction writes a row here, which is the thing the
 * whole product is arguing for: a colleague picking up a matter cold can read
 * what happened and when. `description` is written in code at the moment the
 * event happens — never generated, never assembled here from an enum.
 *
 * It refreshes without a manual reload because invalidation is declared on the
 * mutation (`mutations.ts`), not at any call site. Nothing on this component
 * coordinates that.
 */
export function ActivityFeed({ transactionId }: { transactionId: string }): React.JSX.Element {
  const { entries, isLoading, error } = useActivity(transactionId);

  if (isLoading) return <Skeleton rows={5} />;

  if (error) {
    return (
      <ErrorState
        code={error instanceof ApiError ? error.code : undefined}
        message={error instanceof ApiError ? error.message : undefined}
        details={error instanceof ApiError ? error.details : undefined}
        requestId={error instanceof ApiError ? error.requestId : undefined}
      />
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <EmptyState
        title="Nothing has happened yet"
        description="Every change to this matter lands here — status moves, uploads, deadlines, who did what and when."
      />
    );
  }

  return (
    <ol className={styles.feed} data-testid="transaction-activity-feed">
      {entries.map((entry) => (
        <li key={entry.id} className={styles.item} data-event-type={entry.eventType}>
          <span className={styles.marker} aria-hidden="true" />
          <div className={styles.body}>
            <p className={styles.description}>{entry.description}</p>
            <time className={`${styles.time} tabular`} dateTime={entry.createdAt}>
              {stamp(entry.createdAt)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
