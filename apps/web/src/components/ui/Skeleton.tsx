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
  /**
   * The shape of what is about to render, not a generic bar stack.
   *
   *   paragraph  text — the default, and what every caller used before 2026-08-25
   *   rows       a list or table — equal-height bars, no short last line
   *   cards      a board column or card grid — taller blocks with internal lines
   *
   * The checklist asks for content-matched skeletons because the alternative is
   * a visible layout jump the moment data lands: the placeholder never had the
   * real proportions, so nothing lines up when it is replaced.
   */
  shape?: 'paragraph' | 'rows' | 'cards';
  /** Number of placeholder rows. Match the real content's shape. */
  rows?: number;
  /** CSS width for the last row, so blocks don't look machine-perfect. */
  lastRowWidth?: string;
}

export function Skeleton({
  shape = 'paragraph',
  rows = 3,
  lastRowWidth = '60%',
}: SkeletonProps): React.JSX.Element {
  // A short last line reads as the end of a paragraph. On a list or a set of
  // cards it reads as a rendering bug, so only `paragraph` gets one.
  const ragged = shape === 'paragraph';
  return (
    <div
      className={`${styles.wrap} ${styles[shape]}`}
      aria-hidden="true"
      data-testid="ui-skeleton"
      data-shape={shape}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={styles.row}
          style={ragged && i === rows - 1 ? { width: lastRowWidth } : undefined}
        />
      ))}
    </div>
  );
}
