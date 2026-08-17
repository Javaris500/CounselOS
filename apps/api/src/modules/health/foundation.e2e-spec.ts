import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../app.module';

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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mirror main.ts. The prefix is part of the contract — every documented
    // route is /v1/*, health included.
    app.setGlobalPrefix('v1');
    await app.init();
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
      const res = await request(app.getHttpServer()).get('/v1/health/services');

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
      const res = await request(app.getHttpServer()).get('/v1/health/services');
      expect(res.body.data.database.status).toBe('ok');
      expect(res.body.data.redis.status).toBe('ok');
    });

    it('reports an unset key as not_configured — never as down, never as ok', async () => {
      // The distinction this whole endpoint exists for. The test containers set
      // no Anthropic, Voyage, or Resend key, so this is the real unconfigured
      // path rather than a simulated one. Calling it `down` would send the UI
      // into an error state for a feature the firm simply has not turned on.
      const res = await request(app.getHttpServer()).get('/v1/health/services');

      for (const name of ['anthropic', 'voyage', 'resend']) {
        expect(res.body.data[name].status).toBe('not_configured');
        expect(res.body.data[name].message).toEqual(expect.stringContaining('not set'));
      }
    });

    it('leaks no key material or connection detail', async () => {
      const body = JSON.stringify(
        (await request(app.getHttpServer()).get('/v1/health/services')).body,
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
