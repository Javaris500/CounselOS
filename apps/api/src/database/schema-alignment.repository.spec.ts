import { eq, is, sql as sqlOp } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getTableConfig, PgEnumColumn, PgTable, type PgEnum } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { PG_CLIENT_OPTIONS } from './database.module';
import * as schema from './schema';

/**
 * Does the live database actually match schema.ts, and does schema.ts actually
 * match the shared contract?
 *
 * migrations.repository.spec.ts proves the migrations APPLIED. This proves they
 * applied the right thing — that the three layers which are supposed to be one
 * source of truth have not drifted:
 *
 *     packages/shared enums  →  schema.ts pgEnum  →  Postgres enum type
 *     schema.ts .references() →  Postgres FK constraint
 *     schema.ts column types  →  Postgres column types
 *
 * Every one of these can drift silently. An enum value added to shared without
 * a migration leaves TypeScript happily accepting a value Postgres will reject
 * at 3am. This suite is the tripwire.
 */

/**
 * Object.values(schema) is a union that includes non-table exports (the
 * `vector` custom type, the relations objects). Widen to unknown once so the
 * type predicates below are legal, and filter from there.
 */
const SCHEMA_EXPORTS: unknown[] = Object.values(schema);

const listTables = (): PgTable[] => SCHEMA_EXPORTS.filter((v): v is PgTable => is(v, PgTable));

/** Tables that intentionally carry no firm_id — see the note at each. */
const NO_FIRM_ID = new Set(['firms', 'draft_versions', 'holidays']);

/**
 * Soft-deletable tables. Everything else is either immutable (append-only audit
 * and history) or cascades with its parent. 03-schema.md documents the reason
 * per table; this is the machine-readable version of that list.
 */
const SOFT_DELETE_TABLES = new Set([
  'transactions',
  'documents',
  'deadlines',
  'drafts',
  'leads',
  'matter_notes',
  'communications',
  'document_checklist_items',
  'tasks',
  'time_entries',
  'invoices',
  'verified_wire_instructions',
  'client_messages',
]);

describe('schema alignment', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set — globalSetup did not run.');
    sql = postgres(url, { max: 1 });
  });

  afterAll(async () => {
    await sql?.end();
  });

  // ----------------------------------------------------------------
  // Layer 1 — packages/shared → Postgres enum types
  // ----------------------------------------------------------------

  it('every enum in Postgres matches @counselos/shared exactly, in order', async () => {
    // Order matters: Postgres enum ordering drives ORDER BY on an enum column,
    // and the urgency ladder (INFO → CRITICAL) sorts by it.
    const declared = SCHEMA_EXPORTS.filter(
      (value): value is PgEnum<[string, ...string[]]> =>
        // pgEnum() returns a CALLABLE (it doubles as the column builder), so this
        // is 'function', not 'object'. Checking for 'object' silently matched
        // nothing and made the whole assertion vacuous.
        (typeof value === 'function' || typeof value === 'object') &&
        value !== null &&
        'enumName' in value &&
        'enumValues' in value,
    );
    expect(declared.length).toBeGreaterThanOrEqual(28);

    const live = await sql<{ typname: string; labels: string[] }[]>`
      SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
    `;
    const liveByName = new Map(live.map((r) => [r.typname, r.labels]));

    for (const pgEnumDef of declared) {
      expect(liveByName.get(pgEnumDef.enumName)).toEqual([...pgEnumDef.enumValues]);
    }
    // No orphan types left behind by a rename.
    expect(liveByName.size).toBe(declared.length);
  });

  // ----------------------------------------------------------------
  // Layer 2 — schema.ts → Postgres columns
  // ----------------------------------------------------------------

  it('every column declared in schema.ts exists in the database', async () => {
    const tables = listTables();
    expect(tables.length).toBe(27);

    const live = await sql<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
    `;
    const liveCols = new Set(live.map((r) => `${r.table_name}.${r.column_name}`));

    const missing: string[] = [];
    for (const table of tables) {
      const config = getTableConfig(table);
      for (const column of config.columns) {
        if (!liveCols.has(`${config.name}.${column.name}`)) {
          missing.push(`${config.name}.${column.name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every enum column uses its Postgres enum type, not text', async () => {
    // A status column typed `text` accepts 'UNDER_CONTRAKT' forever. The whole
    // point of Postgres-level enums is that the database refuses it.
    const tables = listTables();

    const expected: { table: string; column: string; udt: string }[] = [];
    for (const table of tables) {
      const config = getTableConfig(table);
      for (const column of config.columns) {
        if (is(column, PgEnumColumn)) {
          expected.push({
            table: config.name,
            column: column.name,
            udt: column.enumValues ? column.getSQLType() : '',
          });
        }
      }
    }
    expect(expected.length).toBeGreaterThan(20);

    const live = await sql<{ table_name: string; column_name: string; udt_name: string }[]>`
      SELECT table_name, column_name, udt_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'USER-DEFINED'
    `;
    const liveByKey = new Map(live.map((r) => [`${r.table_name}.${r.column_name}`, r.udt_name]));

    for (const item of expected) {
      // Present at all, and as a user-defined (enum) type rather than text.
      expect(liveByKey.get(`${item.table}.${item.column}`)).toBe(item.udt);
    }
  });

  // ----------------------------------------------------------------
  // Layer 3 — structural invariants the whole architecture rests on
  // ----------------------------------------------------------------

  it('carries firm_id on every table that holds firm data', async () => {
    // The tenancy column. Phase 2 turns it into the RLS predicate; a table
    // without it cannot be scoped and becomes a multi-tenancy blocker.
    const rows = await sql<{ table_name: string }[]>`
      SELECT t.tablename AS table_name
      FROM pg_tables t
      WHERE t.schemaname = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = t.tablename
            AND c.column_name = 'firm_id'
        )
      ORDER BY t.tablename
    `;
    expect(rows.map((r) => r.table_name).sort()).toEqual([...NO_FIRM_ID].sort());
  });

  it('gives every soft-deletable table a deleted_at, and no others', async () => {
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'deleted_at'
      ORDER BY table_name
    `;
    expect(rows.map((r) => r.table_name).sort()).toEqual([...SOFT_DELETE_TABLES].sort());
  });

  it('gives every table a created_at', async () => {
    const rows = await sql<{ tablename: string }[]>`
      SELECT t.tablename
      FROM pg_tables t
      WHERE t.schemaname = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = t.tablename
            AND c.column_name = 'created_at'
        )
    `;
    expect(rows).toEqual([]);
  });

  it('cascades every transaction child, so a purge cannot strand rows', async () => {
    // Soft delete is the normal path, but if a transaction is ever hard-deleted
    // (Phase 2 export-and-purge, TDPSA deletion request), children must go with
    // it. A RESTRICT here would make the deletion request undeliverable.
    const rows = await sql<{ table_name: string; delete_rule: string }[]>`
      SELECT tc.table_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND kcu.column_name = 'transaction_id'
      ORDER BY tc.table_name
    `;
    // access_log deliberately does not cascade — a read-access audit trail that
    // deletes itself along with its subject is not an audit trail.
    const notCascading = rows.filter((r) => r.delete_rule !== 'CASCADE').map((r) => r.table_name);
    expect(notCascading).toEqual(['access_log']);
  });

  it('keeps the deadline superseding chain self-referential', async () => {
    // The amendment chain is what preserves "the closing date used to be the
    // 14th". If these ever pointed anywhere but deadlines, history breaks.
    const rows = await sql<{ column_name: string; foreign_table_name: string }[]>`
      SELECT kcu.column_name, ccu.table_name AS foreign_table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'deadlines'
        AND kcu.column_name IN ('superseded_by_id', 'supersedes_id')
      ORDER BY kcu.column_name
    `;
    expect(rows).toEqual([
      { column_name: 'superseded_by_id', foreign_table_name: 'deadlines' },
      { column_name: 'supersedes_id', foreign_table_name: 'deadlines' },
    ]);
  });

  it('has every index schema.ts declares', async () => {
    const tables = listTables();
    const declared = tables
      .flatMap((table) => getTableConfig(table).indexes.map((index) => index.config.name))
      .filter((name): name is string => typeof name === 'string');
    expect(declared.length).toBeGreaterThanOrEqual(30);

    const live = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `;
    const liveNames = new Set(live.map((r) => r.indexname));
    expect(declared.filter((name) => !liveNames.has(name))).toEqual([]);
  });

  // ----------------------------------------------------------------
  // Layer 4 — behaviour, not just structure
  // ----------------------------------------------------------------

  it('reads back a holiday unshifted from a hostile session timezone', async () => {
    // Asserting the column's TYPE is 'date' proves the DDL. This proves the
    // consequence, which is what the TREC engine actually depends on: the value
    // does not move when the reader's timezone differs from the writer's.
    //
    // Fixtures here use jurisdiction TEST_ONLY so they cannot collide with the
    // seed, which owns the real Texas and federal holidays in this same shared
    // database. Two suites inserting the same (date, jurisdiction) is a
    // cross-suite failure that looks like a schema bug.
    //
    // Asia/Tokyo is UTC+9, far enough that any instant-based storage shifts the
    // calendar day. If this ever returns 2026-11-25 or 2026-11-27, the column
    // regressed to a timestamp and every holiday roll rule is off by a day.
    const db = drizzle(sql, { schema });

    await db.execute(sqlOp`SET TIME ZONE 'Asia/Tokyo'`);
    try {
      const [inserted] = await db
        .insert(schema.holidays)
        .values({ name: 'Roundtrip Probe', jurisdiction: 'TEST_ONLY', date: '2026-11-26' })
        .returning({ date: schema.holidays.date });
      expect(inserted?.date).toBe('2026-11-26');

      const [read] = await db
        .select({ date: schema.holidays.date })
        .from(schema.holidays)
        .where(eq(schema.holidays.name, 'Roundtrip Probe'));
      expect(read?.date).toBe('2026-11-26');
      expect(typeof read?.date).toBe('string');
    } finally {
      await db.delete(schema.holidays).where(eq(schema.holidays.name, 'Roundtrip Probe'));
      await db.execute(sqlOp`SET TIME ZONE 'UTC'`);
    }
  });

  it('keeps a date a date on the raw driver too, not just through Drizzle', async () => {
    // This is the regression test for a bug this suite found. Out of the box,
    // postgres.js parses OID 1082 into a JS Date at UTC midnight: '2026-11-26'
    // arrives as `Wed Nov 25 2026 18:00:00 GMT-0600`, so .getDate() from a
    // Central-time process returns 25. Drizzle's mode: 'string' only covers
    // queries that go THROUGH Drizzle — db.execute(sql`...`), the seed script,
    // and anything hand-written bypassed it.
    //
    // PG_CLIENT_OPTIONS.types.date fixes it at the driver for every client.
    // Asserted on a client built the same way the app builds its own, so this
    // fails if someone constructs a client without the shared options.
    const appLikeClient = postgres(process.env.DATABASE_URL!, PG_CLIENT_OPTIONS);
    try {
      const [row] = await appLikeClient<{ d: unknown }[]>`SELECT '2026-11-26'::date AS d`;
      expect(typeof row?.d).toBe('string');
      expect(row?.d).toBe('2026-11-26');
    } finally {
      await appLikeClient.end();
    }
  });

  it('refuses a duplicate holiday for the same date and jurisdiction', async () => {
    // The TREC engine asks "is this date a holiday?" as a yes/no. A duplicated
    // seed row would let a roll rule count the same day twice.
    await sql`
      INSERT INTO holidays (name, jurisdiction, date)
      VALUES ('Dup Probe', 'TEST_ONLY', '2026-06-19')
    `;
    try {
      await expect(
        sql`
          INSERT INTO holidays (name, jurisdiction, date)
          VALUES ('Dup Probe (second)', 'TEST_ONLY', '2026-06-19')
        `,
      ).rejects.toThrow(/duplicate key/i);
    } finally {
      await sql`DELETE FROM holidays WHERE jurisdiction = 'TEST_ONLY'`;
    }
  });
});
