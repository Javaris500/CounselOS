import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'node:path';
import postgres from 'postgres';

/**
 * Jest globalSetup for the integration and e2e projects (jest.config.ts).
 *
 * Boots a real Postgres and a real Redis in Docker, migrates the database, and
 * points the process at them. This is what makes the two lower test tiers
 * honest: integration and E2E run against the real thing, and only the true
 * externals — Anthropic, Voyage, Resend, Supabase Auth — are ever mocked
 * (10-tdd-guide.md).
 *
 * Runs ONCE per jest invocation, not per suite. Container boot is the expensive
 * part (~5-15s cold), which is why jest.config.ts allows a 60s testTimeout.
 *
 * WHY process.env WORKS HERE: jest forks its workers after globalSetup returns,
 * so they inherit whatever this sets. `test:int` and `test:e2e` also run
 * --runInBand, where there is no fork at all. Do not move this into a
 * per-suite setupFiles — you would get one container pair per suite.
 *
 * The Prisma version of this file in 10-tdd-guide.md §"Global Test Setup"
 * predates the Drizzle decision. This is the current one.
 */

declare global {
  // eslint-disable-next-line no-var
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
  // eslint-disable-next-line no-var
  var __REDIS_CONTAINER__: StartedRedisContainer | undefined;
}

/**
 * Matches docker-compose.yml and Supabase. pgvector's image is Postgres 16 with
 * the extension already compiled in — the plain postgres image cannot run the
 * migrations once vector columns land.
 */
const POSTGRES_IMAGE = 'pgvector/pgvector:pg16';
const REDIS_IMAGE = 'redis:7-alpine';

/**
 * The same extensions docker/postgres/init/01-extensions.sql creates locally and
 * Supabase enables through its dashboard. Created here so a migration behaves
 * identically in all three places.
 */
const EXTENSIONS = ['vector', 'pgcrypto', 'pg_trgm'] as const;

/**
 * Env vars the app validates at boot (config/env.validation.ts) but that no test
 * needs to be real. Without these, booting the Nest app inside an E2E test fails
 * validation before a single request is made — and requiring a live Supabase
 * project to run the test suite would be a bad trade.
 *
 * DATABASE_URL and REDIS_URL are deliberately absent: those come from the
 * containers below and must never fall back to a developer's real database.
 */
const TEST_ENV_DEFAULTS: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  PORT: '3001',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_KEY: 'test-service-key',
  SUPABASE_STORAGE_BUCKET: 'documents',
  HMAC_SECRET: 'test-hmac-secret-at-least-32-characters-long',
  FRONTEND_URL: 'http://localhost:3000',
  CLIENT_PORTAL_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  FIRM_ID: '00000000-0000-4000-8000-000000000001',
};

export default async function setup(): Promise<void> {
  const [postgresContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase('counselos_test')
      .withUsername('test')
      .withPassword('test')
      .start(),
    new RedisContainer(REDIS_IMAGE).start(),
  ]);

  // sslmode=disable is correct here and only here: the container is on a local
  // bridge network. env.validation.ts requires sslmode=require outside
  // development and test, and this is test.
  const databaseUrl = `${postgresContainer.getConnectionUri()}?sslmode=disable`;
  const redisUrl = redisContainer.getConnectionUrl();

  for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
    process.env[key] ??= value;
  }
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    for (const extension of EXTENSIONS) {
      await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS ${extension}`);
    }

    // The committed SQL, not a schema push — tests must run against exactly the
    // migrations production will run, or a bad migration passes CI and fails on
    // deploy.
    await migrate(drizzle(sql), {
      migrationsFolder: path.resolve(__dirname, '../../drizzle'),
    });
  } finally {
    await sql.end();
  }

  // Read back in teardown.ts. globalThis is the only channel jest gives between
  // globalSetup and globalTeardown.
  globalThis.__PG_CONTAINER__ = postgresContainer;
  globalThis.__REDIS_CONTAINER__ = redisContainer;
}
