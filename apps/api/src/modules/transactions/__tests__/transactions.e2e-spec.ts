import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import request from 'supertest';

import { authHeader, createTestKeyring, type TestKeyring } from '../../../../test/helpers/auth.helper';
import { AppModule } from '../../../app.module';
import { PG_CLIENT_OPTIONS } from '../../../database/database.module';
import { SEED_IDS } from '../../../database/seed';
import { JWKS } from '../../auth/jwks.provider';
import { SUPABASE_AUTH } from '../../auth/supabase.provider';

/**
 * MODULE 3 + LAYER 8G — THE E2E GATE.
 *
 * The clauses, verbatim from the dispatch:
 *   create → 201 with an auto-generated transaction number · valid transition
 *   → 200 · invalid → 422 INVALID_STATUS_TRANSITION · list excludes
 *   soft-deleted · every mutation writes an activity row · a terminal
 *   transition writes all five columns · a close with no outcome_reason is
 *   rejected.
 *
 * Plus 8G, which ships in the same slice and is the product's primary
 * access-control surface: an unassigned paralegal gets nothing, an unassigned
 * attorney gets READ_ONLY, and the denial explains itself.
 *
 * WHAT IS OVERRIDDEN: `JWKS` and `SUPABASE_AUTH` only — the two true externals
 * (18 §10). Not the guards, not the services, not the repositories, not
 * Postgres. Every access decision below is made by the real MatterAccessGuard
 * against real rows.
 */
describe('Module 3 — transactions + 8G matter access (e2e)', () => {
  let app: INestApplication;
  let keyring: TestKeyring;
  let sql: ReturnType<typeof postgres>;

  /** Tokens, minted once. The role comes from the users table, never a claim. */
  let ownerToken: string;
  let attorneyToken: string;
  let paralegalToken: string;

  const TX = SEED_IDS.transactions;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set — globalSetup did not run.');
    sql = postgres(url, { ...PG_CLIENT_OPTIONS, max: 1 });

    for (const script of ['reset.ts', 'seed.ts']) {
      execFileSync('npx', ['tsx', path.resolve(__dirname, '../../../database', script)], {
        env: { ...process.env, NODE_ENV: 'test' },
        cwd: path.resolve(__dirname, '../../../..'),
        stdio: 'pipe',
      });
    }

    keyring = await createTestKeyring();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JWKS)
      .useValue(keyring.jwks)
      .overrideProvider(SUPABASE_AUTH)
      .useValue({
        signInWithPassword: () => Promise.resolve(null),
        refresh: () => Promise.resolve(null),
        signOut: () => Promise.resolve(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();

    [ownerToken, attorneyToken, paralegalToken] = await Promise.all([
      keyring.sign(SEED_IDS.authIds.owner, { email: 'elena@rodriguezlaw.test' }),
      keyring.sign(SEED_IDS.authIds.attorney, { email: 'james@rodriguezlaw.test' }),
      keyring.sign(SEED_IDS.authIds.paralegal, { email: 'sarah@rodriguezlaw.test' }),
    ]);
  });

  afterAll(async () => {
    await app?.close();
    await sql?.end();
  });

  const api = (): request.Agent => request(app.getHttpServer());

  const activityFor = async (transactionId: string): Promise<{ event_type: string }[]> =>
    sql<{ event_type: string }[]>`
      SELECT event_type FROM transaction_activities
      WHERE transaction_id = ${transactionId}
      ORDER BY created_at ASC`;

  interface CreatedMatter {
    id: string;
    transactionNumber: string;
    status: string;
    title: string;
  }

  /** A fresh matter owned by the seeded attorney. Tests that mutate use this
   *  rather than a fixture, so nothing depends on execution order. */
  const createMatter = async (
    overrides: Record<string, unknown> = {},
  ): Promise<CreatedMatter> => {
    const res = await api()
      .post('/v1/transactions')
      .set(authHeader(attorneyToken))
      .send({
        transactionType: 'PURCHASE',
        propertyAddress: '1100 Congress Ave',
        propertyZip: '78701',
        effectiveDate: '2026-06-01T05:00:00.000Z',
        ...overrides,
      });
    expect(res.status).toBe(201);
    return res.body.data as CreatedMatter;
  };

  /** postgres-js types a row as possibly-absent; these queries return one. */
  const one = <T>(rows: T[]): T => {
    const [row] = rows;
    if (row === undefined) throw new Error('Expected exactly one row.');
    return row;
  };

  // ───────────────────────────────────────────────────────────────────────────
  describe('create — the number is the server\'s, never the client\'s', () => {
    it('→ 201 with an auto-generated transaction number and INTAKE status', async () => {
      const res = await api()
        .post('/v1/transactions')
        .set(authHeader(attorneyToken))
        .send({
          transactionType: 'PURCHASE',
          propertyAddress: '2100 E Cesar Chavez St',
          propertyZip: '78702',
          purchasePrice: '540000.00',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      // RE-<year>-<4 digits>, and never one the client chose.
      expect(res.body.data.transactionNumber).toMatch(/^RE-\d{4}-\d{4}$/);
      expect(res.body.data.status).toBe('INTAKE');
      expect(res.body.data.assignedAttorneyId).toBe(SEED_IDS.users.attorney);
      expect(res.body.data.firmId).toBe(SEED_IDS.firm);
    });

    it('ignores a client-supplied transactionNumber and status rather than honouring them', async () => {
      const res = await api()
        .post('/v1/transactions')
        .set(authHeader(attorneyToken))
        .send({
          transactionType: 'SALE',
          propertyAddress: '3400 Red River St',
          transactionNumber: 'RE-1999-0001',
          status: 'CLOSED',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.transactionNumber).not.toBe('RE-1999-0001');
      expect(res.body.data.status).toBe('INTAKE');
    });

    it('generates numbers that do not collide under concurrent creates', async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          api()
            .post('/v1/transactions')
            .set(authHeader(attorneyToken))
            .send({ transactionType: 'REFINANCE', propertyAddress: `${900 + i} W 6th St` }),
        ),
      );

      const numbers = results.map((r) => {
        expect(r.status).toBe(201);
        return r.body.data.transactionNumber as string;
      });
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    it('auto-generates a title from the parties and address, and stores the parties', async () => {
      const res = await api()
        .post('/v1/transactions')
        .set(authHeader(attorneyToken))
        .send({
          transactionType: 'PURCHASE',
          propertyAddress: '4402 Avenue G',
          parties: [
            { role: 'BUYER', type: 'PERSON', name: 'Alicia Martinez' },
            { role: 'SELLER', type: 'PERSON', name: 'Wen Chen' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Martinez / Chen — 4402 Avenue G');
      expect(res.body.data.parties).toHaveLength(2);
    });

    it('writes a transaction.created activity row', async () => {
      const created = await createMatter();
      expect((await activityFor(created.id)).map((a) => a.event_type)).toContain(
        'transaction.created',
      );
    });

    it('rejects a create with no property address → 422 with the field named', async () => {
      const res = await api()
        .post('/v1/transactions')
        .set(authHeader(attorneyToken))
        .send({ transactionType: 'PURCHASE' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toHaveProperty('propertyAddress');
    });

    it('rejects an unauthenticated create → 401', async () => {
      const res = await api()
        .post('/v1/transactions')
        .send({ transactionType: 'PURCHASE', propertyAddress: '1 Nowhere' });
      expect(res.status).toBe(401);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('status transitions — the map is the rule', () => {
    it('a legal transition → 200, and writes transaction.status_changed', async () => {
      const matter = await createMatter();

      const res = await api()
        .patch(`/v1/transactions/${matter.id}/status`)
        .set(authHeader(attorneyToken))
        .send({ status: 'UNDER_CONTRACT' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNDER_CONTRACT');

      const events = (await activityFor(matter.id)).map((a) => a.event_type);
      expect(events).toContain('transaction.status_changed');
    });

    it('an illegal transition → 422 INVALID_STATUS_TRANSITION, naming the legal next states', async () => {
      const matter = await createMatter();

      const res = await api()
        .patch(`/v1/transactions/${matter.id}/status`)
        .set(authHeader(attorneyToken))
        // INTAKE cannot reach CLOSED. Skipping four rungs of a legal ladder is
        // exactly what the map exists to refuse.
        .send({ status: 'CLOSED', outcomeReason: 'CLOSED_ON_TIME' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');

      // THE HARD STOP: a rejected transition must carry a reason the UI can
      // render. "Could not update" teaches an attorney nothing.
      expect(res.body.error.details.allowedTransitions).toEqual(
        expect.arrayContaining(['UNDER_CONTRACT', 'FALLEN_THROUGH']),
      );
      expect(res.body.error.details.allowedTransitions).not.toContain('CLOSED');
      expect(res.body.error.details.from).toEqual(['INTAKE']);
    });

    it('a rejected transition writes nothing — no status change, no activity row', async () => {
      const matter = await createMatter();
      const before = (await activityFor(matter.id)).length;

      await api()
        .patch(`/v1/transactions/${matter.id}/status`)
        .set(authHeader(attorneyToken))
        .send({ status: 'TITLE_REVIEW' });

      const after = await api()
        .get(`/v1/transactions/${matter.id}`)
        .set(authHeader(attorneyToken));

      expect(after.body.data.status).toBe('INTAKE');
      expect((await activityFor(matter.id)).length).toBe(before);
    });

    it('a terminal state has no exits — CLOSED → anything is refused', async () => {
      const matter = await createMatter();
      for (const status of ['UNDER_CONTRACT', 'DUE_DILIGENCE', 'TITLE_REVIEW', 'CLOSING_PREP']) {
        await api()
          .patch(`/v1/transactions/${matter.id}/status`)
          .set(authHeader(attorneyToken))
          .send({ status })
          .expect(200);
      }
      await api()
        .patch(`/v1/transactions/${matter.id}/status`)
        .set(authHeader(attorneyToken))
        .send({ status: 'CLOSED', outcomeReason: 'CLOSED_ON_TIME' })
        .expect(200);

      const res = await api()
        .patch(`/v1/transactions/${matter.id}/status`)
        .set(authHeader(attorneyToken))
        .send({ status: 'CLOSING_PREP' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(res.body.error.details.allowedTransitions).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('the terminal transition writes FIVE columns, not one', () => {
    it('a close with no outcomeReason is REJECTED — it is unrecoverable after the fact', async () => {
      const matter = await createMatter();
      await api()
        .patch(`/v1/transactions/${matter.id}/status`)
        .set(authHeader(attorneyToken))
        .send({ status: 'FALLEN_THROUGH' })
        .expect(422)
        .expect((res) => {
          expect(res.body.error.code).toBe('VALIDATION_ERROR');
          // Keyed on the field, so the form marks the dropdown rather than
          // showing a toast the attorney has to interpret.
          expect(res.body.error.details).toHaveProperty('outcomeReason');
        });

      // And nothing moved.
      const after = await api()
        .get(`/v1/transactions/${matter.id}`)
        .set(authHeader(attorneyToken));
      expect(after.body.data.status).toBe('INTAKE');
      expect(after.body.data.closedAt).toBeNull();
    });

    it('CLOSED writes closed_at, outcome_reason, outcome_notes, cycle_time_days and retention_until', async () => {
      const matter = await createMatter({ effectiveDate: '2026-06-01T05:00:00.000Z' });
      for (const status of ['UNDER_CONTRACT', 'DUE_DILIGENCE', 'TITLE_REVIEW', 'CLOSING_PREP']) {
        await api()
          .patch(`/v1/transactions/${matter.id}/status`)
          .set(authHeader(attorneyToken))
          .send({ status })
          .expect(200);
      }

      const res = await api()
        .patch(`/v1/transactions/${matter.id}/status`)
        .set(authHeader(attorneyToken))
        .send({
          status: 'CLOSED',
          outcomeReason: 'CLOSED_DELAYED',
          outcomeNotes: 'Lender re-underwrote after the appraisal came in low.',
        });

      expect(res.status).toBe(200);

      const row = one(
        await sql<
          {
            closed_at: Date | null;
            outcome_reason: string | null;
            outcome_notes: string | null;
            cycle_time_days: number | null;
            retention_until: Date | null;
            effective_date: Date | null;
          }[]
        >`SELECT closed_at, outcome_reason, outcome_notes, cycle_time_days, retention_until,
                 effective_date
            FROM transactions WHERE id = ${matter.id}`,
      );

      // All five. This is the clause that silently regresses to one.
      expect(row.closed_at).not.toBeNull();
      expect(row.outcome_reason).toBe('CLOSED_DELAYED');
      expect(row.outcome_notes).toContain('re-underwrote');
      expect(row.cycle_time_days).not.toBeNull();
      expect(row.retention_until).not.toBeNull();

      // cycle time is effective_date → closed_at, in whole days.
      const closedAt = row.closed_at as Date;
      const effectiveDate = row.effective_date as Date;
      const retentionUntil = row.retention_until as Date;

      const expectedDays = Math.floor(
        (closedAt.getTime() - effectiveDate.getTime()) / 86_400_000,
      );
      expect(row.cycle_time_days).toBe(expectedDays);

      // Texas real estate retains for 7 years from close.
      expect(retentionUntil.getUTCFullYear() - closedAt.getUTCFullYear()).toBe(7);
    });

    it('FALLEN_THROUGH captures the outcome the same way CLOSED does', async () => {
      const matter = await createMatter();
      await api()
        .patch(`/v1/transactions/${matter.id}/status`)
        .set(authHeader(attorneyToken))
        .send({ status: 'FALLEN_THROUGH', outcomeReason: 'FINANCING_DENIED' })
        .expect(200);

      const row = one(
        await sql<{ outcome_reason: string | null; closed_at: Date | null }[]>`
          SELECT outcome_reason, closed_at FROM transactions WHERE id = ${matter.id}`,
      );
      expect(row.outcome_reason).toBe('FINANCING_DENIED');
      expect(row.closed_at).not.toBeNull();
    });

    it('rejects an outcomeReason on a non-terminal transition', async () => {
      const matter = await createMatter();
      const res = await api()
        .patch(`/v1/transactions/${matter.id}/status`)
        .set(authHeader(attorneyToken))
        .send({ status: 'UNDER_CONTRACT', outcomeReason: 'CLOSED_ON_TIME' });

      expect(res.status).toBe(422);
      expect(res.body.error.details).toHaveProperty('outcomeReason');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('list — soft-deleted matters do not exist', () => {
    it('excludes a soft-deleted transaction', async () => {
      const doomed = await createMatter({ propertyAddress: '6 Soft Delete Ln' });

      const before = await api().get('/v1/transactions').set(authHeader(attorneyToken));
      expect(before.body.data.map((t: { id: string }) => t.id)).toContain(doomed.id);

      // Soft delete directly: there is no DELETE endpoint in 05 §3E, and adding
      // one purely to make a test convenient would be inventing API.
      await sql`UPDATE transactions SET deleted_at = now() WHERE id = ${doomed.id}`;

      const after = await api()
        .get('/v1/transactions')
        .query({ limit: 100 })
        .set(authHeader(attorneyToken));
      expect(after.body.data.map((t: { id: string }) => t.id)).not.toContain(doomed.id);

      // And it is gone from the detail route too, as a 404 rather than a 200
      // with a tombstone.
      const detail = await api()
        .get(`/v1/transactions/${doomed.id}`)
        .set(authHeader(attorneyToken));
      expect(detail.status).toBe(404);
      expect(detail.body.error.code).toBe('TRANSACTION_NOT_FOUND');
    });

    it('returns pagination meta and never exceeds MAX_LIMIT', async () => {
      const res = await api()
        .get('/v1/transactions')
        .query({ limit: 5 })
        .set(authHeader(attorneyToken));

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 5 });
      expect(typeof res.body.meta.total).toBe('number');

      const tooBig = await api()
        .get('/v1/transactions')
        .query({ limit: 5_000 })
        .set(authHeader(attorneyToken));
      expect(tooBig.status).toBe(422);
    });

    it('filters by status', async () => {
      const res = await api()
        .get('/v1/transactions')
        .query({ status: 'TITLE_REVIEW', limit: 100 })
        .set(authHeader(attorneyToken));

      expect(res.status).toBe(200);
      for (const row of res.body.data as { status: string }[]) {
        expect(row.status).toBe('TITLE_REVIEW');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('8G — access is assignment, not job title', () => {
    it('the assigned attorney gets FULL: reads and writes', async () => {
      await api().get(`/v1/transactions/${TX.manorRd}`).set(authHeader(attorneyToken)).expect(200);
      await api()
        .patch(`/v1/transactions/${TX.manorRd}`)
        .set(authHeader(attorneyToken))
        .send({ propertyZip: '78722' })
        .expect(200);
    });

    it('an UNASSIGNED attorney gets READ_ONLY — the GET passes, the write does not', async () => {
      // sCongress is the owner's matter. James is an attorney at the firm and
      // may cover; he may not edit.
      await api().get(`/v1/transactions/${TX.sCongress}`).set(authHeader(attorneyToken)).expect(200);

      const write = await api()
        .patch(`/v1/transactions/${TX.sCongress}`)
        .set(authHeader(attorneyToken))
        .send({ propertyZip: '78704' });

      expect(write.status).toBe(403);
      expect(write.body.error.code).toBe('MATTER_ACCESS_DENIED');
      expect(write.body.error.details.reason).toEqual(['READ_ONLY_ROLE']);
    });

    it('an ASSIGNED paralegal gets FULL on her matter', async () => {
      await api().get(`/v1/transactions/${TX.manorRd}`).set(authHeader(paralegalToken)).expect(200);
    });

    it('an UNASSIGNED paralegal gets NOTHING — no read-only fallback', async () => {
      // The Slice 0 clause deferred to here. clawsonRd has no assignedParalegalId.
      const res = await api()
        .get(`/v1/transactions/${TX.clawsonRd}`)
        .set(authHeader(paralegalToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('MATTER_ACCESS_DENIED');

      // THE HARD STOP: the denial explains itself. A bare 403 is a support
      // ticket every time.
      expect(res.body.error.details.reason).toEqual(['NOT_ASSIGNED']);
      expect(res.body.error.details.assignedAttorney).toEqual(['James Okafor']);
      expect(res.body.error.details.requestAccessFrom).toEqual(['James Okafor']);
      expect(res.body.error.message).not.toMatch(/forbidden/i);
    });

    it('the OWNER bypasses matter checks entirely', async () => {
      await api().get(`/v1/transactions/${TX.manorRd}`).set(authHeader(ownerToken)).expect(200);
      await api()
        .patch(`/v1/transactions/${TX.annieSt}`)
        .set(authHeader(ownerToken))
        .send({ propertyZip: '78704' })
        .expect(200);
    });

    it('a grant promotes the unassigned paralegal to FULL, and a revoke takes it back', async () => {
      await api()
        .post(`/v1/transactions/${TX.clawsonRd}/access`)
        .set(authHeader(attorneyToken))
        .send({ userId: SEED_IDS.users.paralegal })
        .expect(201);

      await api()
        .get(`/v1/transactions/${TX.clawsonRd}`)
        .set(authHeader(paralegalToken))
        .expect(200);

      await api()
        .delete(`/v1/transactions/${TX.clawsonRd}/access/${SEED_IDS.users.paralegal}`)
        .set(authHeader(attorneyToken))
        .expect(200);

      await api()
        .get(`/v1/transactions/${TX.clawsonRd}`)
        .set(authHeader(paralegalToken))
        .expect(403);
    });

    it('an EXPIRED grant is not a grant, and says so', async () => {
      await api()
        .post(`/v1/transactions/${TX.annieSt}/access`)
        .set(authHeader(attorneyToken))
        .send({ userId: SEED_IDS.users.paralegal, expiresAt: '2026-06-16T00:00:00.000Z' })
        .expect(201);

      await sql`UPDATE matter_access SET expires_at = now() - interval '1 day'
                WHERE transaction_id = ${TX.annieSt} AND user_id = ${SEED_IDS.users.paralegal}`;

      const res = await api()
        .get(`/v1/transactions/${TX.annieSt}`)
        .set(authHeader(paralegalToken));

      expect(res.status).toBe(403);
      expect(res.body.error.details.reason).toEqual(['ACCESS_EXPIRED']);
    });

    it('a matter that does not exist is a 404, never a 403 that confirms it might', async () => {
      const res = await api()
        .get('/v1/transactions/00000000-0000-4000-8000-0000000009ff')
        .set(authHeader(paralegalToken));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TRANSACTION_NOT_FOUND');
    });

    it('a malformed id is a 404, not a 500 from a failed uuid cast', async () => {
      const res = await api().get('/v1/transactions/not-a-uuid').set(authHeader(attorneyToken));
      expect(res.status).toBe(404);
    });

    /**
     * THE FIVE-OF-SIX TEST.
     *
     * A decorator missing from one late-added GET is invisible to tooling and
     * to review. So every matter-scoped route is enumerated here and hit with
     * the one identity that must never pass — and this list is the thing to
     * extend when a route is added, which is cheaper than remembering the
     * decorator.
     */
    describe('every matter-scoped route refuses the unassigned paralegal', () => {
      /**
       * OBJECT ROWS, ONE CALLBACK PARAMETER — not a tuple.
       *
       * With tuple rows of differing length, jest sees a callback declaring
       * more parameters than the row supplies and passes its `done` callback
       * into the gap. The body then becomes a function, supertest tries to
       * serialise it, and the test times out waiting for a `done` that the
       * async function will never call. Every row here has the same arity by
       * construction, so that cannot happen.
       */
      interface ScopedRoute {
        method: 'get' | 'post' | 'patch' | 'delete';
        suffix: string;
        body?: Record<string, unknown>;
      }

      const routes: ScopedRoute[] = [
        { method: 'get', suffix: '' },
        { method: 'patch', suffix: '', body: { propertyZip: '78704' } },
        {
          method: 'patch',
          suffix: '/status',
          body: { status: 'CLOSED', outcomeReason: 'CLOSED_ON_TIME' },
        },
        { method: 'patch', suffix: '/archive' },
        { method: 'get', suffix: '/activity' },
        { method: 'get', suffix: '/parties' },
        {
          method: 'post',
          suffix: '/parties',
          body: { role: 'BUYER', type: 'PERSON', name: 'Nobody' },
        },
        {
          method: 'patch',
          suffix: `/parties/${SEED_IDS.users.paralegal}`,
          body: { name: 'Nobody' },
        },
        { method: 'delete', suffix: `/parties/${SEED_IDS.users.paralegal}` },
        { method: 'get', suffix: '/access' },
        { method: 'post', suffix: '/access', body: { userId: SEED_IDS.users.paralegal } },
        { method: 'delete', suffix: `/access/${SEED_IDS.users.paralegal}` },
      ];

      it.each(routes)('$method /v1/transactions/:id$suffix', async ({ method, suffix, body }) => {
        const call = api()[method](`/v1/transactions/${TX.clawsonRd}${suffix}`).set(
          authHeader(paralegalToken),
        );
        const res = await (body === undefined ? call : call.send(body));

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('MATTER_ACCESS_DENIED');
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe('parties and the activity feed', () => {
    it('adding, updating and removing a party each write an activity row', async () => {
      const matter = await createMatter({ propertyAddress: '77 Party Ln' });

      const added = await api()
        .post(`/v1/transactions/${matter.id}/parties`)
        .set(authHeader(attorneyToken))
        .send({
          role: 'TITLE_COMPANY',
          type: 'ORGANIZATION',
          name: 'Independence Title',
          notes: 'File #2025-04821, Closer: Maria Webb',
        });
      expect(added.status).toBe(201);
      const partyId = added.body.data.id as string;

      await api()
        .patch(`/v1/transactions/${matter.id}/parties/${partyId}`)
        .set(authHeader(attorneyToken))
        .send({ phone: '512-555-0100' })
        .expect(200);

      await api()
        .delete(`/v1/transactions/${matter.id}/parties/${partyId}`)
        .set(authHeader(attorneyToken))
        .expect(200);

      const events = (await activityFor(matter.id)).map((a) => a.event_type);
      expect(events).toEqual(
        expect.arrayContaining(['party.added', 'party.updated', 'party.removed']),
      );
    });

    it('the activity feed reads back newest-first through the API', async () => {
      const matter = await createMatter({ propertyAddress: '88 Feed St' });
      await api()
        .patch(`/v1/transactions/${matter.id}/status`)
        .set(authHeader(attorneyToken))
        .send({ status: 'UNDER_CONTRACT' })
        .expect(200);

      const res = await api()
        .get(`/v1/transactions/${matter.id}/activity`)
        .set(authHeader(attorneyToken));

      expect(res.status).toBe(200);
      expect(res.body.data[0].eventType).toBe('transaction.status_changed');
      // Human-readable, written in code — never generated, never a raw enum.
      expect(res.body.data[0].description).toMatch(/Intake.*Under Contract/i);
      expect(res.body.data[0].userId).toBe(SEED_IDS.users.attorney);
      expect(res.body.data[0].metadata).toMatchObject({
        from: 'INTAKE',
        to: 'UNDER_CONTRACT',
      });
    });

    it('archiving writes transaction.archived and drops the matter from the default list', async () => {
      const matter = await createMatter({ propertyAddress: '99 Archive Way' });

      await api()
        .patch(`/v1/transactions/${matter.id}/archive`)
        .set(authHeader(attorneyToken))
        .expect(200);

      const list = await api()
        .get('/v1/transactions')
        .query({ limit: 100 })
        .set(authHeader(attorneyToken));
      expect(list.body.data.map((t: { id: string }) => t.id)).not.toContain(matter.id);

      const withArchived = await api()
        .get('/v1/transactions')
        .query({ limit: 100, includeArchived: 'true' })
        .set(authHeader(attorneyToken));
      expect(withArchived.body.data.map((t: { id: string }) => t.id)).toContain(matter.id);

      expect((await activityFor(matter.id)).map((a) => a.event_type)).toContain(
        'transaction.archived',
      );
    });
  });
});
