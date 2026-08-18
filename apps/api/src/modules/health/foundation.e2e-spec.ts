import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';

import { authHeader, createTestKeyring, type TestKeyring } from '../../../test/helpers/auth.helper';
import { Public } from '../../common/decorators/public.decorator';
import { AppModule } from '../../app.module';
import { SEED_IDS } from '../../database/seed';
import { JWKS } from '../auth/jwks.provider';

/**
 * Routes that exist only in this spec, mounted alongside AppModule.
 *
 * The 500 and 422 paths cannot be reached through any real route yet — Module 1
 * ships no endpoint that takes a body or throws. Adding a throwing route to
 * production code to make a test possible would be worse than the gap, so the
 * test brings its own.
 *
 * This is not hypothetical coverage: the unknown-error path is the one that
 * must leak nothing, and it was silently returning Nest's default body until
 * this test existed.
 */
@Public()
@Controller('__test')
class ExplodingController {
  @Get('boom')
  boom(): never {
    throw new Error('Internal detail: connection string postgres://user:pw@host/db');
  }

  @Get('zod')
  zod(): never {
    // A ZodError escaping a service, rather than being caught by the pipe.
    z.object({ email: z.email() }).parse({ email: 'nope' });
    throw new Error('unreachable');
  }
}

@Module({ controllers: [ExplodingController] })
class TestOnlyModule {}

/**
 * MODULE 1 — THE E2E GATE (01-codebase.md Part 3).
 *
 *   "GET /v1/health returns {status:'ok'}; a deliberately malformed request
 *    returns the standard error envelope with a typed code, not a stack trace."
 *
 * Written before the implementation, because it is the spec. Everything below
 * is a claim the foundation makes to every module built on top of it: that
 * failures have a shape, that the shape carries a typed code, and that nothing
 * internal leaks to a client.
 *
 * Boots the real HTTP stack against the real containers — the globals are
 * registered as APP_* providers, so an app built any other way would not
 * exercise them (18 §3).
 */
describe('Module 1 — foundation (e2e)', () => {
  let app: INestApplication;
  let keyring: TestKeyring;
  /** /v1/health/services is role-gated now (05 §8L), so its tests authenticate. */
  let attorneyToken: string;

  beforeAll(async () => {
    for (const script of ['reset.ts', 'seed.ts']) {
      execFileSync('npx', ['tsx', path.resolve(__dirname, '../../database', script)], {
        env: { ...process.env, NODE_ENV: 'test' },
        cwd: path.resolve(__dirname, '../../..'),
        stdio: 'pipe',
      });
    }

    keyring = await createTestKeyring();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TestOnlyModule],
    })
      .overrideProvider(JWKS)
      .useValue(keyring.jwks)
      .compile();
    app = moduleRef.createNestApplication();
    // Mirror main.ts. The prefix is part of the contract — every documented
    // route is /v1/*, health included.
    app.setGlobalPrefix('v1');
    await app.init();

    attorneyToken = await keyring.sign(SEED_IDS.authIds.attorney, {
      email: 'james@rodriguezlaw.test',
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('liveness', () => {
    it('GET /v1/health returns exactly {status:"ok"}, unwrapped', async () => {
      // NOT the success envelope. Railway's healthcheck parses this body, and
      // 00 §3 documents the literal `curl` output. Wrapping it in
      // { success, data } would break both — hence @NoEnvelope() on the route.
      const res = await request(app.getHttpServer()).get('/v1/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('is not served at the unprefixed /health', async () => {
      // setGlobalPrefix has no exclude list: one endpoint, one documented URL.
      await request(app.getHttpServer()).get('/health').expect(404);
    });
  });

  describe('service honesty (8L)', () => {
    it('returns per-dependency state in the success envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/health/services')
        .set(authHeader(attorneyToken));

      expect(res.status).toBe(200);
      // Unlike liveness, this one IS enveloped — the frontend consumes it as a
      // normal resource.
      expect(res.body.success).toBe(true);
      expect(Object.keys(res.body.data).sort()).toEqual([
        'anthropic',
        'database',
        'redis',
        'resend',
        'storage',
        'voyage',
      ]);
    });

    it('reports live dependencies as ok', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/health/services')
        .set(authHeader(attorneyToken));
      expect(res.body.data.database.status).toBe('ok');
      expect(res.body.data.redis.status).toBe('ok');
    });

    it('reports an unset key as not_configured — never as down, never as ok', async () => {
      // The distinction this whole endpoint exists for. The test containers set
      // no Anthropic, Voyage, or Resend key, so this is the real unconfigured
      // path rather than a simulated one. Calling it `down` would send the UI
      // into an error state for a feature the firm simply has not turned on.
      const res = await request(app.getHttpServer())
        .get('/v1/health/services')
        .set(authHeader(attorneyToken));

      for (const name of ['anthropic', 'voyage', 'resend']) {
        expect(res.body.data[name].status).toBe('not_configured');
        expect(res.body.data[name].message).toEqual(expect.stringContaining('not set'));
      }
    });

    it('leaks no key material or connection detail', async () => {
      const body = JSON.stringify(
        (
          await request(app.getHttpServer())
            .get('/v1/health/services')
            .set(authHeader(attorneyToken))
        ).body,
      );
      expect(body).not.toMatch(/postgres:\/\/|redis:\/\/|rediss:\/\//);
      expect(body).not.toMatch(/test-service-key|test-anon-key/);
    });
  });

  describe('the error envelope', () => {
    it('returns the standard envelope with a typed code, not a stack trace', async () => {
      const res = await request(app.getHttpServer()).get('/v1/does-not-exist');

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: expect.any(String),
          requestId: expect.any(String),
        },
      });
    });

    it('leaks nothing internal — no stack, no SQL, no file paths', async () => {
      const res = await request(app.getHttpServer()).get('/v1/does-not-exist');
      const body = JSON.stringify(res.body);

      expect(body).not.toMatch(/\bat\s+\w+\s+\(/); // stack frame
      expect(body).not.toMatch(/\/(home|usr|var)\//); // absolute path
      expect(body).not.toMatch(/node_modules/);
      expect(body).not.toMatch(/SELECT |INSERT |UPDATE /i);
      expect(res.body.error).not.toHaveProperty('stack');
    });

    it('never returns two different error shapes', async () => {
      const [notFound, badMethod] = await Promise.all([
        request(app.getHttpServer()).get('/v1/does-not-exist'),
        request(app.getHttpServer()).delete('/v1/health'),
      ]);

      for (const res of [notFound, badMethod]) {
        expect(res.body).toHaveProperty('success', false);
        expect(res.body.error).toEqual(
          expect.objectContaining({
            code: expect.any(String),
            message: expect.any(String),
            requestId: expect.any(String),
          }),
        );
      }
    });
  });

  describe('unknown errors — the path that must leak nothing', () => {
    it('returns INTERNAL_ERROR in OUR envelope, not the framework default', async () => {
      // Regression test. The filter previously delegated 500s to
      // SentryGlobalFilter, which ends in BaseExceptionFilter and WRITES Nest's
      // own {statusCode, message} body. The envelope never landed, so a client
      // reading error.code got it off an object that did not exist.
      const res = await request(app.getHttpServer()).get('/v1/__test/boom');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.requestId).toEqual(expect.any(String));
      expect(res.body).not.toHaveProperty('statusCode');
    });

    it('leaks nothing from the thrown error — not even its message', async () => {
      const res = await request(app.getHttpServer()).get('/v1/__test/boom');
      const body = JSON.stringify(res.body);

      // The thrown message deliberately contains a connection string, because
      // that is the realistic shape of an internal detail escaping.
      expect(body).not.toMatch(/postgres:\/\//);
      expect(body).not.toMatch(/Internal detail/);
      expect(body).not.toMatch(/\bat\s+\w+\s+\(/);
      expect(res.body.error.message).toBe('An unexpected error occurred.');
    });

    it('still carries the correlation ID on a 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/__test/boom')
        .set('x-request-id', 'e2e-500-trace');
      expect(res.headers['x-request-id']).toBe('e2e-500-trace');
      expect(res.body.error.requestId).toBe('e2e-500-trace');
    });

    it('maps an escaped ZodError to 422 with field details', async () => {
      const res = await request(app.getHttpServer()).get('/v1/__test/zod');

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toHaveProperty('email');
    });
  });

  describe('correlation ID', () => {
    it('echoes an upstream x-request-id rather than restarting it at our edge', async () => {
      const upstream = 'e2e-upstream-correlation-id';
      const res = await request(app.getHttpServer())
        .get('/v1/health')
        .set('x-request-id', upstream);

      expect(res.headers['x-request-id']).toBe(upstream);
    });

    it('generates one when the caller sends none', async () => {
      const res = await request(app.getHttpServer()).get('/v1/health');
      const generated: unknown = res.headers['x-request-id'];
      expect(typeof generated).toBe('string');
      expect(generated as string).not.toHaveLength(0);
    });

    it('puts the same id on the response header and in the error body', async () => {
      // This pairing is what makes a user-reported error findable in the logs:
      // they quote requestId, and every log line from that request carries it.
      const upstream = 'e2e-traceable-id';
      const res = await request(app.getHttpServer())
        .get('/v1/does-not-exist')
        .set('x-request-id', upstream);

      expect(res.headers['x-request-id']).toBe(upstream);
      expect(res.body.error.requestId).toBe(upstream);
    });
  });
});
