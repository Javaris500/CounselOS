'use client';

import type { ReactNode } from 'react';

import styles from './EmptyState.module.css';

/**
 * The designed empty state. One of the four states a surface needs before it is
 * done — a screen that only works with populated data is unfinished.
 *
 * BRAND VOICE, NOT CHEER. Not "You don't have any cases yet!" — say what is
 * true and what to do next: "No active transactions. Add your first one and
 * CounselOS starts working immediately." (06 Part 10.)
 */
export interface EmptyStateProps {
  title: string;
  /** What the attorney can do about it. An empty state without a next step is a dead end. */
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps): React.JSX.Element {
  return (
    <div className={styles.wrap} data-testid="ui-empty-state">
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
