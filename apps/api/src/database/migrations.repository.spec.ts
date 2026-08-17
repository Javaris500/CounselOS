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
});
