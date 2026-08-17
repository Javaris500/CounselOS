'use client';

import styles from './Spinner.module.css';

/**
 * Inline spinner — IN-PLACE ACTIONS ONLY, never page-level.
 *
 * A page-level spinner is a Skeleton's job: it tells the user what is coming
 * back by matching the final layout, where a spinner tells them only that
 * something is busy. And a bare spinner is explicitly forbidden for document
 * pipeline work, which has named stages the attorney needs to see.
 */
export function Spinner({ label }: { label?: string }): React.JSX.Element {
  return (
    <span className={styles.spinner} role="status" aria-label={label ?? 'Loading'}>
      <span className={styles.dot} />
    </span>
  );
}
