'use client';

import type { ReactNode } from 'react';

import styles from './Tooltip.module.css';

/**
 * The collapsed-rail tooltip. Registry-canonical for THIS job only.
 *
 * It exists because a rail collapsed to icons has no visible labels, and an
 * icon-only nav that cannot be read is a nav that only its author can use. The
 * bubble appears below 1000px and is suppressed above it, where the label is
 * already on screen — a tooltip that repeats a visible label is noise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT IS NOT THE ACCESSIBLE NAME, AND MUST NEVER BE TREATED AS ONE.
 *
 * The rail's own label stays in the DOM, clipped rather than `display: none`,
 * so a screen reader already announces the row correctly whether the rail is
 * collapsed or not. This bubble is redundant for that user by design —
 * `aria-hidden`, so it is not announced twice.
 *
 * `title` is deliberately not used: it is unstyleable, delayed by ~1s, and does
 * not appear on keyboard focus at all.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface TooltipProps {
  /** The visible bubble text. Keep it to the control's own name. */
  label: string;
  /** A second line, for state a name cannot carry — "Lands with slice 3". */
  note?: string;
  /**
   * Whether the bubble may appear at all.
   *
   * The CALLER decides, because only the caller knows whether the label it
   * wraps is currently visible. This was a `@media (min-width: 1001px)` block
   * in the stylesheet — the tooltip guessing at a breakpoint the rail owned,
   * with nothing linking the two numbers. User-driven collapse broke that
   * immediately: the rail collapses at any width, and the bubble stayed hidden
   * above 1000px.
   */
  enabled?: boolean;
  /**
   * `right` suits a vertical rail; `bottom` suits a horizontal toolbar.
   *
   * A toolbar control near the panel's right edge would push a right-placed
   * bubble off screen, and this primitive has no collision detection — it is
   * CSS-only by design. Naming the placement is the honest alternative to
   * pretending it can find its own.
   */
  placement?: 'right' | 'bottom';
  children: ReactNode;
}

export function Tooltip({
  label,
  note,
  enabled = true,
  placement = 'right',
  children,
}: TooltipProps): React.JSX.Element {
  return (
    <span className={styles.anchor} data-tooltip-enabled={enabled} data-placement={placement}>
      {children}
      <span className={styles.bubble} role="presentation" aria-hidden="true" data-testid="ui-tooltip">
        <span>{label}</span>
        {note ? <span className={styles.note}>{note}</span> : null}
      </span>
    </span>
  );
}
