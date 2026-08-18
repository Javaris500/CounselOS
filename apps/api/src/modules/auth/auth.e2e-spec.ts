import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import request from 'supertest';

import { authHeader, createTestKeyring, type TestKeyring } from '../../../test/helpers/auth.helper';
import { AppModule } from '../../app.module';
import { PG_CLIENT_OPTIONS } from '../../database/database.module';
import { SEED_IDS } from '../../database/seed';
import { AuthService } from './auth.service';
import { JWKS } from './jwks.provider';
import { SUPABASE_ADMIN, SUPABASE_PUBLIC } from './supabase.provider';

/**
 * MODULE 2 — THE E2E GATE (01-codebase.md Part 3).
 *
 *   valid JWT → 200 · expired → 401 TOKEN_EXPIRED · deactivated → 401
 *   USER_INACTIVE · wrong role → 403 · no token → 401
 *
 * Written before the implementation, because it is the spec.
 *
 * WHAT IS OVERRIDDEN: only `JWKS`, the key source — Supabase Auth's HTTP
 * surface, which is a true external (18 §285). Not the guard, not the verifier,
 * not the service, repository, Redis, or Postgres. So everything below exercises
 * real signature, algorithm, issuer, audience, and expiry checking. The forgery
 * cases exist to prove that is actually true rather than assumed.
 */
describe('Module 2 — auth (e2e)', () => {
  let app: INestApplication;
  let keyring: TestKeyring;
  let sql: ReturnType<typeof postgres>;

  const ATTORNEY_EMAIL = 'james@rodriguezlaw.test';
  const PARALEGAL_EMAIL = 'sarah@rodriguezlaw.test';
  const GOOD_PASSWORD = 'correct-horse-battery-staple';

  /**
   * Stands in for Supabase Auth's HTTP surface — the true external (18 §285).
   * Only the three calls AuthService makes. Everything downstream of it, from
   * hydration to the cookie, is the real implementation.
   */
  const fakeSupabase = {
    auth: {
      signInWithPassword: ({ email, password }: { email: string; password: string }) =>
        Promise.resolve(
          password === GOOD_PASSWORD
            ? {
                data: {
                  session: {
                    access_token: 'supabase-access-token',
                    refresh_token: 'supabase-refresh-token',
                    user: { id: SEED_IDS.authIds.attorney, email },
                  },
                },
                error: null,
              }
            : { data: { session: null }, error: { message: 'Invalid login credentials' } },
        ),
      refreshSession: ({ refresh_token }: { refresh_token: string }) =>
        Promise.resolve(
          refresh_token === 'supabase-refresh-token'
            ? {
                data: {
                  session: {
                    access_token: 'rotated-access-token',
                    refresh_token: 'rotated-refresh-token',
                    user: { id: SEED_IDS.authIds.attorney, email: ATTORNEY_EMAIL },
                  },
                },
                error: null,
              }
            : { data: { session: null }, error: { message: 'Invalid refresh token' } },
        ),
      admin: { signOut: () => Promise.resolve({ error: null }) },
    },
  };

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set — globalSetup did not run.');
    sql = postgres(url, { ...PG_CLIENT_OPTIONS, max: 1 });

    for (const script of ['reset.ts', 'seed.ts']) {
      execFileSync('npx', ['tsx', path.resolve(__dirname, '../../database', script)], {
        env: { ...process.env, NODE_ENV: 'test' },
        cwd: path.resolve(__dirname, '../../..'),
        stdio: 'pipe',
      });
    }

    keyring = await createTestKeyring();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(JWKS)
      .useValue(keyring.jwks)
      .overrideProvider(SUPABASE_PUBLIC)
      .useValue(fakeSupabase)
      .overrideProvider(SUPABASE_ADMIN)
      .useValue(fakeSupabase)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await sql?.end();
  });

  const tokenFor = (authId: string, email: string): Promise<string> =>
    keyring.sign(authId, { email });

  describe('the five gate cases', () => {
    it('valid JWT → 200, and the hydrated user is the seeded attorney', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set(authHeader(await tokenFor(SEED_IDS.authIds.attorney, ATTORNEY_EMAIL)));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: SEED_IDS.users.attorney,
        email: ATTORNEY_EMAIL,
        role: 'ATTORNEY',
        firmId: SEED_IDS.firm,
      });
    });

    it('expired JWT → 401 TOKEN_EXPIRED, so the frontend refreshes rather than logging out', async () => {
      // exp 60s in the past: expired by construction, whenever this runs. No
      // need to pin the app clock, which would desync it from Postgres now().
      const token = await keyring.sign(
        SEED_IDS.authIds.attorney,
        { email: ATTORNEY_EMAIL },
        { expiresIn: -60 },
      );
      const res = await request(app.getHttpServer()).get('/v1/auth/me').set(authHeader(token));

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('deactivated user → 401 USER_INACTIVE, which routes to /auth/deactivated not login', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set(authHeader(await tokenFor(SEED_IDS.authIds.inactive, 'former@rodriguezlaw.test')));

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('USER_INACTIVE');
    });

    it('wrong role → 403', async () => {
      // /v1/health/services is @Roles(OWNER, ATTORNEY) per 05 §8L.
      const res = await request(app.getHttpServer())
        .get('/v1/health/services')
        .set(authHeader(await tokenFor(SEED_IDS.authIds.paralegal, PARALEGAL_EMAIL)));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('no token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('@Public() still works', () => {
    it('serves /v1/health unauthenticated, or the platform healthcheck dies', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('the verification is real, not a stub', () => {
    it('rejects a token signed by a different keyring with the same kid', async () => {
      // The one test that overriding the verifier instead could never have: if
      // the signature were not genuinely checked, this would pass.
      const attacker = await createTestKeyring();
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set(authHeader(await attacker.sign(SEED_IDS.authIds.attorney, { email: ATTORNEY_EMAIL })));

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    });

    it('rejects an HS256 token forged with the public key as the shared secret', async () => {
      // Algorithm confusion. `algorithms: ['ES256']` is what stops it.
      const token = await keyring.sign(
        SEED_IDS.authIds.attorney,
        { email: ATTORNEY_EMAIL },
        { forgeHs256: true },
      );
      expect(
        (await request(app.getHttpServer()).get('/v1/auth/me').set(authHeader(token))).status,
      ).toBe(401);
    });

    it('rejects a token issued by a different Supabase project', async () => {
      const token = await keyring.sign(
        SEED_IDS.authIds.attorney,
        { email: ATTORNEY_EMAIL },
        { issuer: 'https://someoneelse.supabase.co/auth/v1' },
      );
      expect(
        (await request(app.getHttpServer()).get('/v1/auth/me').set(authHeader(token))).status,
      ).toBe(401);
    });

    it('rejects a wrong audience and an unknown kid — 401, never 500', async () => {
      const wrongAud = await keyring.sign(
        SEED_IDS.authIds.attorney,
        { email: ATTORNEY_EMAIL },
        { audience: 'anon' },
      );
      const unknownKid = await keyring.sign(
        SEED_IDS.authIds.attorney,
        { email: ATTORNEY_EMAIL },
        { kid: 'no-such-key' },
      );
      for (const token of [wrongAud, unknownKid]) {
        const res = await request(app.getHttpServer()).get('/v1/auth/me').set(authHeader(token));
        expect(res.status).toBe(401);
      }
    });

    it('rejects a valid token whose sub has no users row — 401, never 500', async () => {
      // Authenticated by Supabase, but not a member of this firm.
      const token = await keyring.sign('00000000-0000-4000-8000-0000000000ff', {
        email: 'stranger@example.test',
      });
      expect(
        (await request(app.getHttpServer()).get('/v1/auth/me').set(authHeader(token))).status,
      ).toBe(401);
    });
  });

  describe('first-login linking', () => {
    it('links a null auth_id by verified email, then authenticates', async () => {
      // The path every real user takes exactly once: Supabase knows them, our
      // users row does not yet carry their auth_id.
      await sql`UPDATE users SET auth_id = NULL WHERE id = ${SEED_IDS.users.owner}`;
      const freshSub = '00000000-0000-4000-8000-0000000000b1';

      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set(authHeader(await keyring.sign(freshSub, { email: 'elena@rodriguezlaw.test' })));

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(SEED_IDS.users.owner);

      const [row] = await sql<{ auth_id: string }[]>`
        SELECT auth_id FROM users WHERE id = ${SEED_IDS.users.owner}
      `;
      expect(row?.auth_id).toBe(freshSub);
    });

    it('never relinks an email that already belongs to a different auth_id', async () => {
      // Otherwise anyone who can create a Supabase account using a firm
      // member's email inherits that member's access.
      const token = await keyring.sign('00000000-0000-4000-8000-0000000000c9', {
        email: ATTORNEY_EMAIL,
      });
      expect(
        (await request(app.getHttpServer()).get('/v1/auth/me').set(authHeader(token))).status,
      ).toBe(401);
    });
  });

  describe('deactivation takes effect immediately', () => {
    it('busts the cache rather than waiting out the 5-minute TTL', async () => {
      const token = await tokenFor(SEED_IDS.authIds.paralegal, PARALEGAL_EMAIL);

      // Warm the Redis cache.
      expect(
        (await request(app.getHttpServer()).get('/v1/auth/me').set(authHeader(token))).status,
      ).toBe(200);

      // What the future user-management module will do on deactivation.
      await sql`UPDATE users SET is_active = false WHERE id = ${SEED_IDS.users.paralegal}`;
      await app.get(AuthService).invalidateUser(SEED_IDS.authIds.paralegal);

      const after = await request(app.getHttpServer()).get('/v1/auth/me').set(authHeader(token));
      expect(after.status).toBe(401);
      expect(after.body.error.code).toBe('USER_INACTIVE');
    });
  });

  describe('login, refresh, logout — the proxy the browser depends on', () => {
    it('returns the access token in the body and the refresh token as an httpOnly cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: ATTORNEY_EMAIL, password: GOOD_PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body.data.accessToken).toBe('supabase-access-token');
      expect(res.body.data.user).toMatchObject({ email: ATTORNEY_EMAIL, role: 'ATTORNEY' });

      // The refresh token must NEVER be readable by a script — that is the whole
      // reason login proxies through here instead of the browser calling Supabase.
      expect(JSON.stringify(res.body)).not.toContain('supabase-refresh-token');
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toContain('counselos_rt=supabase-refresh-token');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/v1/auth');
    });

    it('rejects a wrong password without revealing whether the account exists', async () => {
      const [wrongPassword, unknownAccount] = await Promise.all([
        request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email: ATTORNEY_EMAIL, password: 'wrong' }),
        request(app.getHttpServer())
          .post('/v1/auth/login')
          .send({ email: 'nobody@rodriguezlaw.test', password: 'wrong' }),
      ]);

      // Identical responses, or the login form becomes an account enumerator.
      expect(wrongPassword.status).toBe(401);
      expect(unknownAccount.status).toBe(401);
      expect(wrongPassword.body.error.message).toBe(unknownAccount.body.error.message);
    });

    it('422s a malformed body at the pipe, before the service runs', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: 'not-an-email', password: '' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(res.body.error.details)).toEqual(
        expect.arrayContaining(['email', 'password']),
      );
    });

    it('throttles repeated failures rather than serving a free password oracle', async () => {
      const email = 'throttle-target@rodriguezlaw.test';
      let last = 0;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        last = (
          await request(app.getHttpServer())
            .post('/v1/auth/login')
            .send({ email, password: 'wrong' })
        ).status;
      }
      expect(last).toBe(429);
    });

    it('rotates the refresh cookie rather than reusing it', async () => {
      // A refresh token that survives its own use is a replayable credential.
      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Cookie', ['counselos_rt=supabase-refresh-token']);

      expect(res.status).toBe(201);
      expect(res.body.data.accessToken).toBe('rotated-access-token');
      expect((res.headers['set-cookie'] as unknown as string[])[0]).toContain(
        'counselos_rt=rotated-refresh-token',
      );
    });

    it('401s a refresh with no cookie', async () => {
      expect((await request(app.getHttpServer()).post('/v1/auth/refresh')).status).toBe(401);
    });

    it('clears the cookie on logout, even without a valid access token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Cookie', ['counselos_rt=supabase-refresh-token']);

      expect(res.status).toBe(201);
      expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/counselos_rt=;/);
    });
  });
});
