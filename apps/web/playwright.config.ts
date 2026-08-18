import { defineConfig, devices } from '@playwright/test';

/**
 * The browser gate. Proves a slice works in a real browser against the real
 * stack — distinct from the API E2E tier, which gates a module (10-tdd-guide).
 *
 * WHAT IS REAL HERE: the browser, Next, the NestJS API, Postgres, Redis, the
 * guards, the httpOnly cookie, and apiFetch's whole auth lifecycle.
 *
 * WHAT IS FAKED: Supabase Auth, and only Supabase Auth — a local stub at
 * :54321 that mints real ES256 tokens and serves the matching JWKS, so the
 * API's verification is genuine. Mocking our own API here instead would make
 * the gate prove the frontend can render given a fake token, which is not what
 * "login → dashboard" is supposed to establish (CLAUDE.md: mock only the true
 * externals).
 */
const WEB_PORT = 3100;
const API_PORT = 3101;
const FAKE_AUTH_PORT = 54321;

const apiEnv = {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  SUPABASE_URL: `http://127.0.0.1:${String(FAKE_AUTH_PORT)}`,
  SUPABASE_ANON_KEY: 'fake-publishable-key',
  SUPABASE_SERVICE_KEY: 'fake-secret-key',
  CORS_ORIGINS: `http://127.0.0.1:${String(WEB_PORT)}`,
  FRONTEND_URL: `http://127.0.0.1:${String(WEB_PORT)}`,
};

export default defineConfig({
  testDir: './e2e',
  // Sequential: the suite shares one database, and parallel workers reseeding
  // underneath each other is a flake source, not a speedup.
  workers: 1,
  fullyParallel: false,
  // A retry masks exactly the intermittency worth finding. CI can raise it.
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: `http://127.0.0.1:${String(WEB_PORT)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      name: 'fake-supabase-auth',
      command: 'pnpm --filter @counselos/api exec tsx test/fake-supabase-auth.ts',
      url: `http://127.0.0.1:${String(FAKE_AUTH_PORT)}/auth/v1/.well-known/jwks.json`,
      reuseExistingServer: !process.env.CI,
      env: { FAKE_SUPABASE_PORT: String(FAKE_AUTH_PORT) },
    },
    {
      name: 'api',
      // Built, not tsx: esbuild does not emit decorator metadata, and NestJS DI
      // is built entirely on it — under tsx the container fails to resolve.
      // cwd matters: ConfigModule resolves envFilePath relative to the working
      // directory, so running this from apps/web would read the WEB .env and
      // fail validation on every backend variable.
      cwd: '../api',
      command: 'pnpm build && node dist/main.js',
      url: `http://127.0.0.1:${String(API_PORT)}/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: apiEnv,
    },
    {
      name: 'web',
      // dev, not build: NEXT_PUBLIC_* is inlined at build time, so a prebuilt
      // bundle would carry whatever URL it was built with rather than this one.
      command: `next dev --port ${String(WEB_PORT)}`,
      url: `http://127.0.0.1:${String(WEB_PORT)}/auth/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: `http://127.0.0.1:${String(API_PORT)}` },
    },
  ],
});
