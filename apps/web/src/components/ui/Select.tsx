'use client';

import { useId, type SelectHTMLAttributes } from 'react';

import styles from './Select.module.css';

/**
 * The dropdown primitive — a real `<select>`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOT A CUSTOM LISTBOX.
 *
 * The status control is the surface where a wrong value is a wrong legal state,
 * and a hand-rolled listbox is where keyboard support, typeahead, and mobile
 * behaviour quietly go missing. The native control gets all three from the
 * platform. When a slice genuinely needs a combobox (search, party lookup),
 * that is a new registry entry with its own argument — not a widened version
 * of this one.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `options` rather than children, so a caller cannot slip arbitrary markup
 * inside a `<select>` — which browsers do not render and which produces an
 * empty dropdown with no error anywhere.
 */
export interface SelectOption {
  value: string;
  label: string;
  /** A value the caller may see but not choose — e.g. an illegal transition. */
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'children'> {
  options: SelectOption[];
  /** Rendered as a disabled first option when there is no value yet. */
  placeholder?: string;
  invalid?: boolean;
  testId?: string;
}

export function Select({
  options,
  placeholder,
  invalid = false,
  testId,
  id,
  ...props
}: SelectProps): React.JSX.Element {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <select
      {...props}
      id={selectId}
      className={`${styles.select} ${invalid ? styles.invalid : ''}`}
      aria-invalid={invalid || undefined}
      data-testid={testId}
    >
      {placeholder === undefined ? null : (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
