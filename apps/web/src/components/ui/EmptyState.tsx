'use client';

import type { ReactNode } from 'react';

import styles from './EmptyState.module.css';

/**
 * The designed empty state. One of the four states a surface needs before it is
 * done — a screen that only works with populated data is unfinished.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * "EMPTY" IS NOT ONE STATE. IT IS THREE, AND THEY HAVE DIFFERENT EXITS.
 *
 *   nothing-yet   the record genuinely does not exist         → create it
 *   no-match      records exist; your filter excludes them    → undo the filter
 *   not-built     the surface itself has not shipped          → go somewhere real
 *
 * A single "No data" answers none of them. The one most often got wrong is
 * `no-match`: a firm with 24 matters filtered to zero is told "no matters",
 * which is false, and the way out is the filter — not a create button.
 *
 * DENIAL IS DELIBERATELY ABSENT. "You may not see this" is an error with a
 * typed code (`MATTER_ACCESS_DENIED`) carrying the assigned attorney's name, so
 * it belongs to `ErrorState`, which already renders it. Adding a fourth kind
 * here would give one condition two components and let them drift.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * BRAND VOICE, NOT CHEER. Not "You don't have any cases yet!" — say what is
 * true and what to do next: "No active matters. Open your first one and
 * CounselOS starts working immediately." (06 Part 10.)
 */
export type EmptyStateKind = 'nothing-yet' | 'no-match' | 'not-built';

/**
 * `page` owns the whole surface — centered, generous, one primary action.
 * `panel` sits inside a card beside real content — inline, quiet, no button.
 *
 * The default is `panel` because it is the one that cannot do damage: a panel
 * state rendered page-size merely looks under-designed, while a page state
 * rendered inside the activity feed shouts over the matter it belongs to.
 */
export type EmptyStateLayout = 'panel' | 'page';

export interface EmptyStateProps {
  kind?: EmptyStateKind;
  layout?: EmptyStateLayout;
  title: string;
  /** What the attorney can do about it. An empty state without a next step is a dead end. */
  description?: string;
  /** Overrides the kind's default mark. Pass an inline SVG, never an emoji. */
  icon?: ReactNode;
  /**
   * The way out, and it belongs to the caller.
   *
   * For `no-match` this is where the applied filters go, rendered as clearable
   * chips — the thing to undo is the thing that caused it. They are not props
   * here on purpose: filter state lives in the feature that owns the query, and
   * a primitive that knew about it would have to know about every query shape.
   */
  action?: ReactNode;
}

const MARKS: Record<EmptyStateKind, ReactNode> = {
  'nothing-yet': (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 11a2 2 0 0 1 2-2h7l3 3.5h14a2 2 0 0 1 2 2V29a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
      <path d="M20 18.5v7M16.5 22h7" />
    </svg>
  ),
  'no-match': (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="18" r="9" />
      <path d="m25 25 7 7" />
      <path d="M14.5 18h7" />
    </svg>
  ),
  'not-built': (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 8 33 30H7z" />
      <path d="M20 17v6M20 26.5h.01" />
    </svg>
  ),
};

export function EmptyState({
  kind = 'nothing-yet',
  layout = 'panel',
  title,
  description,
  icon,
  action,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={`${styles.wrap} ${styles[layout]} ${styles[kind]}`}
      data-testid="ui-empty-state"
      /* Asserted on rather than a class name, which is hashed by CSS Modules. */
      data-kind={kind}
      data-layout={layout}
    >
      <span className={styles.mark}>{icon ?? MARKS[kind]}</span>
      <div className={styles.copy}>
        <p className={styles.title}>{title}</p>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
