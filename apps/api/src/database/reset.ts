import postgres from 'postgres';

/**
 * Truncate every table, then reseed. Run before a Playwright suite so browser
 * tests start from the known Austin fixtures rather than from whatever the last
 * run left behind.
 *
 * Truncating is deliberately preferred over dropping and re-migrating: it is far
 * faster, and it keeps the schema fixed so a stale migration can't silently
 * change what the tests run against.
 *
 * Tables are discovered from information_schema rather than listed, so this
 * needs no maintenance as the schema grows — and it works today, with none.
 *
 * REFUSES TO RUN OUTSIDE DEVELOPMENT AND TEST. This deletes everything.
 */
async function reset(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error(`db:reset refuses to run with NODE_ENV=${nodeEnv}. It deletes all data.`);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  const sql = postgres(url, { max: 1 });

  try {
    const tables = await sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE '__drizzle%'
    `;

    if (tables.length === 0) {
      console.warn('No tables found — nothing to truncate. Run db:migrate first.');
      return;
    }

    // Pass the raw names. sql(string[]) escapes each as an identifier and joins
    // them; mapping through sql() first yields Builder objects, which
    // escapeIdentifier then calls .replace() on — "str.replace is not a
    // function", on the first reset against a migrated database.
    const names = tables.map((t) => t.tablename);
    // RESTART IDENTITY resets sequences so generated numbers (transaction
    // numbers, invoice numbers) are stable across runs — Playwright asserts on
    // some of them. CASCADE handles foreign keys without ordering the list.
    await sql`TRUNCATE TABLE ${sql(names)} RESTART IDENTITY CASCADE`;

    console.warn(`Truncated ${tables.length} table(s).`);
  } finally {
    await sql.end();
  }
}

reset()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
