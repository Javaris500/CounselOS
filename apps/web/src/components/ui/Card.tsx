'use client';

import type { ReactNode } from 'react';

import styles from './Card.module.css';

/**
 * The surface primitive. A bordered panel on paper.
 *
 * Registered because it was the element every slice was about to invent: a
 * pipeline card, a party card, a deadline card, a draft card. Four
 * near-identical divs with four slightly different border colours is exactly
 * the divergence the registry exists to prevent, and none of them looks wrong
 * on its own.
 *
 * ELEVATION IS A TOKEN, NOT A CHOICE. In light, elevation is carried by border
 * and shadow; in dark, by a lighter fill (07 "Elevation"). Both come from the
 * same `--surface-*` / `--shadow-*` names, so a card is correct in either theme
 * without a per-theme branch here.
 */
export interface CardProps {
  children: ReactNode;
  /** `flat` for a list row, `raised` for something that lifts on hover. */
  elevation?: 'flat' | 'raised';
  /** Makes the whole card a button. Used by the pipeline card. */
  onClick?: () => void;
  /** Left rule — the second signal that pairs with an urgency tint. */
  accent?: 'none' | 'info' | 'warning' | 'urgent' | 'critical' | 'done';
  testId?: string;
  ariaLabel?: string;
}

export function Card({
  children,
  elevation = 'flat',
  onClick,
  accent = 'none',
  testId,
  ariaLabel,
}: CardProps): React.JSX.Element {
  const className = `${styles.card} ${styles[elevation]} ${styles[`accent-${accent}`]}`;

  // A real <button> when it is clickable, so keyboard and screen-reader
  // behaviour comes from the platform rather than from a div with a role.
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} data-testid={testId} aria-label={ariaLabel}>
        {children}
      </button>
    );
  }

  return (
    <div className={className} data-testid={testId} aria-label={ariaLabel}>
      {children}
    </div>
  );
}
