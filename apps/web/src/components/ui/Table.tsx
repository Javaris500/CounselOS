'use client';

import type { ReactNode } from 'react';

import styles from './Table.module.css';

/**
 * Data table. Compact density by default — attorney surfaces are dense lists
 * that get scanned, not read, and the compact row height is a design token
 * rather than a per-slice guess.
 *
 * Numeric cells use the mono token with tabular-nums so columns of figures
 * line up. Money that doesn't align is money that gets misread.
 */
export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Right-aligns and applies tabular figures. Use for money, counts, dates. */
  numeric?: boolean;
}

export interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  density?: 'compact' | 'comfortable';
  caption?: string;
  testId?: string;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  density = 'compact',
  caption,
  testId,
}: TableProps<T>): React.JSX.Element {
  return (
    <table className={`${styles.table} ${styles[density]}`} data-testid={testId ?? 'ui-table'}>
      {caption ? <caption className={styles.caption}>{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={column.numeric ? styles.numeric : undefined}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column) => (
              <td key={column.key} className={column.numeric ? styles.numeric : undefined}>
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
