import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Reset and reseed before the suite.
 *
 * CLAUDE.md: run db:reset before Playwright, and import seeded IDs rather than
 * clicking through the UI to find a fixture. Doing it here rather than by hand
 * means the suite cannot run against whatever the last run left behind — which
 * is the difference between a failure that means something and one that means
 * "someone forgot".
 */
export default function globalSetup(): void {
  const apiDir = path.resolve(__dirname, '../../api');

  /**
   * Migrate first. The local development database is NOT the one the jest
   * integration tier uses — that tier boots throwaway testcontainers — so
   * nothing else ever applies migrations here. Without this the first run on a
   * fresh clone dies with `relation "firms" does not exist`, which reads like a
   * broken seed rather than an unmigrated database.
   *
   * drizzle-kit loads .env by itself; the tsx scripts below do not, hence
   * --env-file on those.
   */
  execFileSync('npx', ['drizzle-kit', 'migrate'], {
    cwd: apiDir,
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit',
  });

  for (const script of ['reset.ts', 'seed.ts']) {
    // --env-file, exactly as package.json's db:reset does. These are standalone
    // CLI scripts, not Nest — nothing loads .env for them otherwise, and the
    // failure is a bare "DATABASE_URL is not set".
    execFileSync('npx', ['tsx', '--env-file=.env', path.join('src/database', script)], {
      cwd: apiDir,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'inherit',
    });
  }
}
