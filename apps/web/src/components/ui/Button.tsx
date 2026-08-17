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
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  loading = false,
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
      className={`${styles.button} ${styles[variant]}`}
    >
      {loading ? <Spinner /> : null}
      <span>{children}</span>
    </button>
  );
}
