'use client';

import type { ReactNode } from 'react';

import styles from './Badge.module.css';

/**
 * Status pill, and the home of the urgency ladder.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER HUE ALONE.
 *
 * Every urgency tier pairs its colour with a second signal — the `label` text
 * is mandatory, and `icon` adds a third. This is an accessibility requirement
 * AND how the ladder stays readable in a dense list where four colours at small
 * size are genuinely hard to tell apart. Test the surface with colour removed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type BadgeTone = 'neutral' | 'done' | 'info' | 'warning' | 'urgent' | 'critical';

export interface BadgeProps {
  tone?: BadgeTone;
  /** Required. The text IS the second signal — a colour-only badge is a bug. */
  children: ReactNode;
  icon?: ReactNode;
}

export function Badge({ tone = 'neutral', children, icon }: BadgeProps): React.JSX.Element {
  return (
    <span className={`${styles.badge} ${styles[tone]}`} data-tone={tone}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}
