import { execFileSync } from 'node:child_process';
import path from 'node:path';
import postgres from 'postgres';

import { PG_CLIENT_OPTIONS } from './database.module';
import { SEED_ANCHOR, SEED_IDS } from './seed';

/**
 * Runs the real seed script against the real container.
 *
 * `pnpm db:reset` is what CLAUDE.md tells everyone to run before Playwright, so
 * a seed that throws breaks the browser suite for everyone at once — and it
 * would do so at the least convenient moment, with the failure looking like a
 * broken test rather than broken fixtures.
 *
 * It also pins the properties Playwright will depend on: that the exported IDs
 * are the ones actually in the database, and that the deadline fixtures sit at
 * the intended distance from SEED_ANCHOR.
 */
describe('seed', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set — globalSetup did not run.');
    sql = postgres(url, { ...PG_CLIENT_OPTIONS, max: 1 });

    // reset → seed, which is exactly what `pnpm db:reset` does and what
    // CLAUDE.md tells everyone to run before Playwright. Running the shipped
    // scripts rather than reimplementing them is the point: if either breaks,
    // this fails here instead of in the browser suite.
    //
    // The reset is required, not cosmetic — seed.ts inserts rather than upserts,
    // and the migration test in this same tier may have left rows behind.
    for (const script of ['reset.ts', 'seed.ts']) {
      execFileSync('npx', ['tsx', path.resolve(__dirname, script)], {
        env: { ...process.env, NODE_ENV: 'test' },
        cwd: path.resolve(__dirname, '../..'),
        stdio: 'pipe',
      });
    }
  });

  afterAll(async () => {
    await sql?.end();
  });

  it('inserts the firm at the id the tests import', async () => {
    const rows = await sql<{ id: string; slug: string }[]>`
      SELECT id, slug FROM firms WHERE id = ${SEED_IDS.firm}
    `;
    expect(rows[0]?.slug).toBe('rodriguez-associates');
  });

  it('links every seeded user to a stable auth_id', async () => {
    // The guard resolves users WHERE auth_id = <token sub>. A null auth_id means
    // an authenticated person with no application identity, which is a 401 — so
    // an unlinked fixture would make every authenticated E2E unreachable.
    const rows = await sql<{ auth_id: string | null }[]>`
      SELECT auth_id FROM users WHERE firm_id = ${SEED_IDS.firm} ORDER BY email
    `;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.auth_id !== null)).toBe(true);
    expect(new Set(rows.map((r) => r.auth_id)).size).toBe(4);
  });

  it('creates the four roles the Slice 0 gate exercises', async () => {
    const rows = await sql<{ role: string; is_active: boolean }[]>`
      SELECT role, is_active FROM users WHERE firm_id = ${SEED_IDS.firm} ORDER BY role
    `;
    // OWNER, ATTORNEY, PARALEGAL for the access paths; one deactivated ATTORNEY
    // so USER_INACTIVE can be proven without deactivating a live user.
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => !r.is_active)).toHaveLength(1);
  });

  it('leaves one matter unassigned to the paralegal, on purpose', async () => {
    // The gate requires a paralegal denied an unassigned matter to see an
    // explaining error. If every fixture were assigned to her, that path would
    // be untestable and the gap would not be obvious.
    const rows = await sql<{ assigned_paralegal_id: string | null }[]>`
      SELECT assigned_paralegal_id FROM transactions WHERE id = ${SEED_IDS.transactions.sCongress}
    `;
    expect(rows[0]?.assigned_paralegal_id).toBeNull();
  });

  it('places deadlines at known offsets from SEED_ANCHOR', async () => {
    // Playwright pins its clock to SEED_ANCHOR; these offsets are what make an
    // urgency assertion stable instead of drifting a tier every few days.
    const rows = await sql<{ id: string; due_at: Date; status: string }[]>`
      SELECT id, due_at, status FROM deadlines WHERE firm_id = ${SEED_IDS.firm}
    `;
    const byId = new Map(rows.map((r) => [r.id, r]));

    const daysFromAnchor = (due: Date): number =>
      Math.round((due.getTime() - SEED_ANCHOR.getTime()) / 86_400_000);

    expect(daysFromAnchor(byId.get(SEED_IDS.deadlines.financingContingency)!.due_at)).toBe(8);
    expect(daysFromAnchor(byId.get(SEED_IDS.deadlines.closingDate)!.due_at)).toBe(17);
    expect(byId.get(SEED_IDS.deadlines.titleCommitment)?.status).toBe('COMPLETED');
  });

  it('gives every deadline its calculation note and source link', async () => {
    // A bare date is the one thing the Deadlines slice may not ship. Fixtures
    // that lack the note would let that surface look finished while being
    // untestable.
    const rows = await sql<
      { calculation_note: string | null; source_text: string | null; source_page: number | null }[]
    >`
      SELECT calculation_note, source_text, source_page FROM deadlines
      WHERE firm_id = ${SEED_IDS.firm}
    `;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.calculation_note).toBeTruthy();
      expect(row.source_text).toBeTruthy();
      expect(row.source_page).toBeGreaterThan(0);
    }
  });

  it('stores holidays as calendar dates, unshifted', async () => {
    // The TREC engine reads these. If they came back as instants, Juneteenth
    // would land on the 18th in Central time.
    const rows = await sql<{ date: string; name: string }[]>`
      SELECT date::text AS date, name FROM holidays WHERE name = 'Juneteenth'
    `;
    expect(rows[0]?.date).toBe('2026-06-19');
  });

  it('seeds a lead that has not cleared its conflict check', async () => {
    // Conversion is blocked until an attorney clears it (Texas Rules 1.09/1.10),
    // so the fixture has to start PENDING for that path to be reachable.
    const rows = await sql<{ conflict_check_status: string; lead_status: string }[]>`
      SELECT conflict_check_status, lead_status FROM leads WHERE id = ${SEED_IDS.lead}
    `;
    expect(rows[0]?.conflict_check_status).toBe('PENDING');
    expect(rows[0]?.lead_status).toBe('NEW');
  });
});
