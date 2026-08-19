import { Column, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';

import { notDeleted } from './helpers';
import * as schema from './schema';

/**
 * The map in helpers.ts is hand-maintained, so it can drift from the schema.
 * This test is what makes drift impossible: it derives the truth from
 * schema.ts and fails if the map disagrees in either direction.
 */
describe('notDeleted', () => {
  /** Every exported pgTable that actually carries a deleted_at column. */
  const softDeletable: { exportName: string; sqlName: string }[] = [];

  for (const [exportName, value] of Object.entries(schema)) {
    // schema.ts also exports enums and Relations — only pgTables qualify.
    if (!is(value, PgTable)) continue;
    if (!Object.hasOwn(value, 'deletedAt')) continue;
    softDeletable.push({ exportName, sqlName: getTableName(value) });
  }

  it('finds the soft-deletable tables at all', () => {
    // A guard on the guard: if the reflection above silently stops matching,
    // the two coverage tests below would pass against an empty list.
    expect(softDeletable.length).toBeGreaterThan(0);
  });

  it('covers every table in the schema that carries deleted_at', () => {
    const missing = softDeletable
      .filter(({ exportName }) => !(exportName in notDeleted))
      .map(({ exportName, sqlName }) => `${exportName} (${sqlName})`);

    expect(missing).toEqual([]);
  });

  it('contains no entry for a table that does not carry deleted_at', () => {
    const known = new Set(softDeletable.map(({ exportName }) => exportName));
    const extra = Object.keys(notDeleted).filter((key) => !known.has(key));

    expect(extra).toEqual([]);
  });

  it('points each key at the deleted_at column of its own table', () => {
    // Guards against a copy-paste that points a key at another table's column.
    // Drizzle SQL objects are circular, so inspect the chunks rather than
    // serialising: isNull(col) carries exactly the Column it was built from.
    for (const { exportName, sqlName } of softDeletable) {
      const predicate = notDeleted[exportName as keyof typeof notDeleted];
      const columns = predicate.queryChunks.filter((chunk) => is(chunk, Column));

      expect(columns).toHaveLength(1);
      const [column] = columns as [Column];
      expect(column.name).toBe('deleted_at');
      expect(getTableName(column.table)).toBe(sqlName);
    }
  });
});
