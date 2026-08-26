'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { Spinner } from './Spinner';
import styles from './Button.module.css';

/**
 * The button primitive. Registry-canonical — do not build another.
 *
 * Variants live here rather than per-slice, which is the point: five agents
 * each inventing a "primary" button produces five slightly different blues, and
 * no review catches it because each one looks reasonable alone.
 *
 * `loading` disables the control and shows an inline spinner ON it, which is
 * the documented pattern for an in-place action (06 Part 10). A page-level
 * spinner for a button click is the wrong scale of feedback.
 */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO DESTRUCTIVE VARIANTS, AND THE CHOICE BETWEEN THEM IS A SAFETY DECISION.
 *
 *   danger          solid crimson — irreversible, or expensive to undo
 *   danger-outline  crimson on paper — destructive but reversible
 *
 * `docs/19` §2.1: legal data is soft-deleted, so most "destructive" actions in
 * this product are recoverable, and dressing them all in solid red trains
 * people to click through red. Reserve the solid for the ones that genuinely
 * cannot be taken back. Both are visually distinct from `primary`, so neither
 * can be confused with the routine action beside it — which is the other half
 * of the checklist rule that destructive actions be harder to trigger.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';

/**
 * `sm` for dense chrome — table row actions, filter bars, drawer headers.
 * `md` for everything a page presents as a real choice.
 *
 * There is no `lg`. A button that needs to be bigger than 36px is usually a
 * button in the wrong place, and the login submit — the one genuinely
 * full-width, 56px control in the product — sets its own height because it is a
 * page, not a control in a row.
 */
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Inline SVG on a 16px grid. Never an emoji — 07 carries no glyph set. */
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  iconLeft,
  iconRight,
  fullWidth = false,
  disabled,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      {...props}
      // Genuinely disabled, not styled to look it. A control that only *appears*
      // disabled is still clickable — which on the draft-approval gate would be
      // an Opinion 705 failure, so the primitive never offers that shortcut.
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      data-variant={variant}
      className={[
        styles.button,
        styles[variant],
        styles[size],
        fullWidth ? styles.fullWidth : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/*
        The spinner REPLACES the left icon rather than joining it. Both at once
        makes the label jump sideways on every click, which reads as a glitch
        at exactly the moment the user is watching for feedback.
      */}
      {loading ? <Spinner /> : iconLeft ? <span className={styles.icon}>{iconLeft}</span> : null}
      <span className={styles.label}>{children}</span>
      {iconRight && !loading ? <span className={styles.icon}>{iconRight}</span> : null}
    </button>
  );
}
