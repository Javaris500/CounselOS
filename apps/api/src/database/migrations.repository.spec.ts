import postgres from 'postgres';

/**
 * The integration tier's own smoke test: proves the testcontainers harness in
 * test/setup/containers.ts actually delivered a migrated database, before any
 * module test relies on it.
 *
 * It is named *.repository.spec.ts so jest routes it to the `integration`
 * project (jest.config.ts), which is the tier that gets a real Postgres.
 *
 * When this fails, no module's integration or E2E tests can be trusted — read
 * it as "the harness is broken", not "the database is wrong".
 */
describe('test database harness', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    // Set by globalSetup. If it points anywhere else, the container never
    // started and every assertion below would run against a developer's real
    // database — hence the guard rather than a bare connect.
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set — globalSetup did not run.');
    sql = postgres(url, { max: 1 });
  });

  afterAll(async () => {
    await sql?.end();
  });

  it('runs against the throwaway container database, never a real one', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.DATABASE_URL).toContain('counselos_test');
    expect(process.env.REDIS_URL).toMatch(/^redis:\/\//);
  });

  it('has the extensions the migrations and search depend on', async () => {
    const rows = await sql<{ extname: string }[]>`
      SELECT extname FROM pg_extension
      WHERE extname IN ('vector', 'pgcrypto', 'pg_trgm')
    `;
    expect(rows.map((r) => r.extname).sort()).toEqual(['pg_trgm', 'pgcrypto', 'vector']);
  });

  it('applied the committed migrations, not a schema push', async () => {
    const rows = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations
    `;
    expect(rows[0]?.count).toBeGreaterThan(0);
  });

  it('created the enum types from migration 0000', async () => {
    const rows = await sql<{ typname: string }[]>`
      SELECT typname FROM pg_type WHERE typname = 'deadline_status'
    `;
    expect(rows).toHaveLength(1);
  });

  it('added CLIENT_PORTAL to communication_type', async () => {
    // 03-schema.md omitted the value while 13-adoption-features.md and 05 §8J
    // both require the client portal to write a communication row with it.
    // Added in 0001 as an ALTER TYPE, which is the migration most likely to
    // misbehave inside a transaction — hence an explicit assertion.
    const rows = await sql<{ enumlabel: string }[]>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'communication_type'
      ORDER BY e.enumsortorder
    `;
    expect(rows.map((r) => r.enumlabel)).toEqual([
      'PHONE_CALL',
      'EMAIL',
      'IN_PERSON',
      'TEXT',
      'VOICEMAIL',
      'CLIENT_PORTAL',
      'OTHER',
    ]);
  });

  it('created every table from migration 0001', async () => {
    const rows = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    // The full Phase 1 set. A table added to schema.ts without landing here
    // means the migration was never generated — the exact failure this pass
    // exists to prevent.
    expect(rows.map((r) => r.tablename)).toEqual([
      'access_log',
      'chat_messages',
      'chat_sessions',
      'client_access_tokens',
      'client_messages',
      'communications',
      'deadlines',
      'document_checklist_items',
      'document_chunks',
      'documents',
      'draft_versions',
      'drafts',
      'email_jobs',
      'firms',
      'holidays',
      'invoices',
      'leads',
      'matter_access',
      'matter_notes',
      'parties',
      'tasks',
      'time_entries',
      'transaction_activities',
      'transactions',
      'users',
      'verified_wire_instructions',
      'wire_flag_events',
    ]);
  });

  it('stores every timestamp with a time zone', async () => {
    // `timestamp` stores a wall-clock reading with no anchor, so its meaning
    // depends on every writer agreeing forever on which zone was meant. In a
    // product built on Texas business-day deadline math, a value written by the
    // worker (UTC on Railway) and one written from a browser (Central) are
    // different instants that look identical. Zero tolerance: one zone-less
    // column is a latent off-by-one-day in the TREC engine.
    const rows = await sql<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('timestamp without time zone', 'timestamp without time zone[]')
      ORDER BY table_name, column_name
    `;
    expect(rows).toEqual([]);
  });

  it('stores holidays.date as a calendar date, not an instant', async () => {
    // The single deliberate exception to timestamptz. A holiday is a date, not a
    // moment — Thanksgiving is the 27th all day. As timestamptz the TREC engine
    // would have to pick a time of day and then ask "is this instant before
    // midnight in whichever zone the session is set to?", which flips near
    // midnight and across DST. That is how an option-fee deadline lands on the
    // wrong side of a holiday weekend.
    const rows = await sql<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'holidays' AND column_name = 'date'
    `;
    expect(rows[0]?.data_type).toBe('date');
  });

  it('stores embeddings as a real pgvector column, not text', async () => {
    const rows = await sql<{ format_type: string }[]>`
      SELECT format_type(a.atttypid, a.atttypmod)
      FROM pg_attribute a
      WHERE a.attrelid = 'document_chunks'::regclass AND a.attname = 'embedding'
    `;
    expect(rows[0]?.format_type).toBe('vector(1024)');
  });

  it('created the HNSW index from migration 0002', async () => {
    // Without this, every document-chat search is a sequential scan. It is
    // invisible in application code, so nothing else would ever catch its
    // absence.
    const rows = await sql<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'document_chunks'
        AND indexname = 'document_chunks_embedding_hnsw_idx'
    `;
    expect(rows[0]?.indexdef).toContain('USING hnsw');
    expect(rows[0]?.indexdef).toContain('vector_cosine_ops');
  });

  it('scopes uniqueness to non-deleted rows', async () => {
    // A plain UNIQUE would burn a transaction number permanently on soft
    // delete. Assert the predicate is actually present, not just the index.
    const rows = await sql<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexdef LIKE '%WHERE%deleted_at IS NULL%'
      ORDER BY indexname
    `;
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));
    expect(byName.has('transactions_transaction_number_active_key')).toBe(true);
    expect(byName.has('invoices_invoice_number_active_key')).toBe(true);
    expect(byName.get('transactions_transaction_number_active_key')).toContain('UNIQUE');
  });

  it('maintains the full-text search columns automatically', async () => {
    const rows = await sql<{ table_name: string; is_generated: string }[]>`
      SELECT table_name, is_generated
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'search_vector'
      ORDER BY table_name
    `;
    expect(rows.map((r) => r.table_name)).toEqual([
      'communications',
      'document_chunks',
      'matter_notes',
    ]);
    // GENERATED ALWAYS ... STORED — Postgres maintains it, so no trigger and no
    // application code can forget to update it.
    expect(rows.every((r) => r.is_generated === 'ALWAYS')).toBe(true);
  });

  it('leaves exactly the two circular columns without a foreign key', async () => {
    // users.transaction_id and drafts.current_version_id are FK-less BY DESIGN
    // — each closes a cycle Postgres can only express with deferred
    // constraints. Asserted as an exact (table, column) pair set so that a
    // well-meaning future change adding a constraint fails loudly, and so this
    // test cannot be satisfied by the wrong column: drafts.transaction_id is a
    // different column that SHOULD have an FK, and does.
    const fks = await sql<{ table_name: string; column_name: string }[]>`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    `;
    const has = (table: string, column: string): boolean =>
      fks.some((r) => r.table_name === table && r.column_name === column);

    // FK-less by design.
    expect(has('users', 'transaction_id')).toBe(false);
    expect(has('drafts', 'current_version_id')).toBe(false);
    // Denormalized for the pgvector pre-filter — no FK, cascade via document_id.
    expect(has('document_chunks', 'transaction_id')).toBe(false);
    expect(has('document_chunks', 'firm_id')).toBe(false);
    // Written after the fact, when a lead converts.
    expect(has('leads', 'converted_transaction_id')).toBe(false);

    // The control: every other *_id column of the same name IS constrained.
    expect(has('drafts', 'transaction_id')).toBe(true);
    expect(has('deadlines', 'transaction_id')).toBe(true);
    expect(has('users', 'firm_id')).toBe(true);
  });

  it('constrains every firm_id except the denormalized one', async () => {
    // firm_id is the tenancy column. Phase 2 turns it into the RLS predicate, so
    // an unconstrained one is a row that can outlive its firm.
    const unconstrained = await sql<{ table_name: string }[]>`
      SELECT c.table_name
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'firm_id'
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = c.table_name
            AND kcu.column_name = 'firm_id'
        )
      ORDER BY c.table_name
    `;
    // document_chunks is the single documented exception.
    expect(unconstrained.map((r) => r.table_name)).toEqual(['document_chunks']);
  });
});
