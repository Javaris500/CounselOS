'use client';

import styles from './Skeleton.module.css';

/**
 * Content-shaped loading placeholder. The default for an initial page load.
 *
 * CONTENT-SHAPED IS THE REQUIREMENT, not decoration: a skeleton that matches
 * the final layout tells the attorney what is arriving and stops the page
 * jumping when it does. A centered spinner communicates neither.
 */
export interface SkeletonProps {
  /** Number of placeholder rows. Match the real content's shape. */
  rows?: number;
  /** CSS width for the last row, so blocks don't look machine-perfect. */
  lastRowWidth?: string;
}

export function Skeleton({ rows = 3, lastRowWidth = '60%' }: SkeletonProps): React.JSX.Element {
  return (
    <div className={styles.wrap} aria-hidden="true" data-testid="ui-skeleton">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={styles.row}
          style={i === rows - 1 ? { width: lastRowWidth } : undefined}
        />
      ))}
    </div>
  );
}
