'use client';

import Link from 'next/link';
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
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE FORMS, AND `href` IS THE ONE THAT WAS MISSING.
 *
 *   href      → an <a>. A card that navigates.
 *   onClick   → a <button>. A card that acts without leaving the page.
 *   neither   → a <div>. A card that is only a surface.
 *
 * `href` was absent until 2026-08-25 and its absence had already cost something:
 * nemi's slice-1 audit found this primitive registered as canonical with ZERO
 * consumers and two hand-rolled bordered surfaces shipped in the same commit,
 * because a pipeline card must be an `<a>` for keyboard activation and
 * open-in-new-tab and there was no way to ask for one. The data table hit the
 * identical wall independently, and `Tabs` already carried the precedent —
 * "Links not buttons, so tabs deep-link".
 *
 * Three elements wanting the same thing is not a coincidence. Passing both
 * `href` and `onClick` is a mistake, not a feature: `href` wins and the click
 * is ignored, because a control cannot be two things.
 * ─────────────────────────────────────────────────────────────────────────────
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
  /** Makes the whole card a link. Preferred over `onClick` when it navigates. */
  href?: string;
  /** Makes the whole card a button. Ignored when `href` is set. */
  onClick?: () => void;
  /** Left rule — the second signal that pairs with an urgency tint. */
  accent?: 'none' | 'info' | 'warning' | 'urgent' | 'critical' | 'done';
  testId?: string;
  ariaLabel?: string;
}

export function Card({
  children,
  elevation = 'flat',
  href,
  onClick,
  accent = 'none',
  testId,
  ariaLabel,
}: CardProps): React.JSX.Element {
  const className = `${styles.card} ${styles[elevation]} ${styles[`accent-${accent}`]}`;

  /*
   * A real <a> when it navigates. Not a div with an onClick and not a button
   * that calls router.push: middle-click, cmd-click, "open in new tab" and the
   * status bar preview are how people actually work a caseload, and every one
   * of them comes free from the element or not at all.
   */
  if (href !== undefined) {
    return (
      <Link href={href} className={className} data-testid={testId} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

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
