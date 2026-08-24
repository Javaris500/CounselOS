import { execFileSync } from 'node:child_process';
import path from 'node:path';

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
/**
 * `packages/shared` IS BUILT HERE, BEFORE ANY SERVER STARTS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Both servers below import `@counselos/shared`, which resolves through its
 * package.json `main` to `dist/index.js`. That directory is gitignored, so on a
 * clean clone it does not exist and BOTH servers fail — the API with ~40 lines
 * of `TS2307: Cannot find module '@counselos/shared'` and the web server with a
 * module-not-found on the first page compile. Neither failure mentions the
 * build, so it reads as a broken import in `src/`.
 *
 * It cannot go in `globalSetup` (Playwright starts webServers BEFORE global
 * setup), and it cannot go inside either webServer `command`: the two start
 * concurrently, so whichever one did not own the build would race an empty or
 * half-written `dist/`. Config module scope is the only point that is
 * guaranteed to run once, before both. `tsc` is incremental, so a warm tree
 * pays roughly nothing.
 *
 * The real fix is upstream and outside this harness: `@counselos/api`'s own
 * `build` script does not build its workspace dependency. Filed as a finding.
 * ─────────────────────────────────────────────────────────────────────────────
 */
// Skipped inside a worker: Playwright loads this config once per worker
// process too, and TEST_WORKER_INDEX is how a worker announces itself. Building
// again there is pure noise, and two tsc runs writing one dist/ is a race.
if (process.env.TEST_WORKER_INDEX === undefined) {
  execFileSync('pnpm', ['--filter', '@counselos/shared', 'build'], {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'inherit',
  });
}

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
