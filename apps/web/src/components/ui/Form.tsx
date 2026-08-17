'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type DefaultValues, type FieldValues, type UseFormReturn } from 'react-hook-form';
import type { ZodType } from 'zod';

import { ApiError } from '@/lib/api/client';

import styles from './Form.module.css';

/**
 * The form primitive: react-hook-form + zodResolver, schema from
 * packages/shared. There is no hand-rolled form in this codebase.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE SCHEMA, BOTH SIDES.
 *
 * The same Zod object validates in the browser and in the backend's Zod pipe,
 * so the 4,000-character chat limit and the 500-character communication summary
 * cannot drift between them. A client-side limit that disagrees with the server
 * is a form that looks valid and 422s on submit.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function useZodForm<T extends FieldValues>(
  schema: ZodType<T>,
  defaultValues?: DefaultValues<T>,
): UseFormReturn<T> {
  return useForm<T>({
    resolver: zodResolver(schema as never),
    defaultValues,
    mode: 'onBlur',
  });
}

/**
 * Maps a 422 onto the form, field by field.
 *
 * `error.details` is keyed by field name precisely so this is mechanical — a
 * server-side failure surfaces exactly where a client-side one would, instead
 * of as a toast that leaves the user hunting for the offending field.
 *
 * Anything that is not a 422 is re-thrown: it belongs in a toast or an
 * ErrorState, not silently swallowed by a form.
 */
export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
): void {
  if (!(error instanceof ApiError) || Object.keys(error.fieldErrors).length === 0) {
    throw error;
  }
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    form.setError(field as never, { message: messages[0] ?? 'Invalid value.' });
  }
}

export interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}

/** Label, control, hint, error — wired so the error is announced, not just coloured. */
export function Field({ label, htmlFor, error, children, hint }: FieldProps): React.JSX.Element {
  const errorId = `${htmlFor}-error`;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className={styles.hint}>{hint}</p> : null}
      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
