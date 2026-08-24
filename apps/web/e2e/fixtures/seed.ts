import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * The seeded fixtures, read from the module that writes them.
 *
 * CLAUDE.md's Playwright rules: "Import seeded IDs from the seed module. Never
 * hardcode a UUID; never click through the UI to find a fixture." A test that
 * navigates to find its own data is testing navigation, and it breaks the first
 * time the list order changes. `seed.ts` guards its own execution behind
 * `require.main === module`, so reading it writes no row.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SPAWNS A PROCESS INSTEAD OF WRITING `import { SEED_IDS } from …`.
 *
 * The direct import is what the rule asks for and what `seed.ts`'s own header
 * promises. It does not compile under Playwright:
 *
 *   SyntaxError: apps/api/src/database/database.module.ts:87
 *   Decorators cannot be used to decorate parameters.
 *
 * `seed.ts` imports `PG_CLIENT_OPTIONS` from `database.module.ts`, which is a
 * NestJS module using constructor parameter decorators. Playwright transpiles
 * spec files with its own Babel setup, which does not enable the legacy
 * decorator transform — so pulling in one exported constant drags an entire
 * NestJS module through a compiler that cannot parse it.
 *
 * tsx CAN parse it, which is why `fake-supabase-auth.ts` imports the same
 * module without trouble: it is run with tsx. So the values are read the same
 * way — one tsx process at module load, its output parsed here. The IDs still
 * come from the seed and from nowhere else, which is the rule's actual point.
 *
 * THE REAL FIX IS UPSTREAM AND OUTSIDE THIS HARNESS: `PG_CLIENT_OPTIONS` is a
 * plain object and does not belong in a file that also defines a NestJS module.
 * Filed as a finding — this workaround is a cost every later slice inherits.
 * ─────────────────────────────────────────────────────────────────────────────
 */
interface SeedExport {
  ids: {
    firm: string;
    users: Record<'owner' | 'attorney' | 'paralegal' | 'inactive', string>;
    authIds: Record<'owner' | 'attorney' | 'paralegal' | 'inactive', string>;
    transactions: Record<'manorRd' | 'clawsonRd' | 'sCongress' | 'annieSt', string>;
    deadlines: Record<'financingContingency' | 'titleCommitment' | 'closingDate', string>;
    lead: string;
  };
  names: Record<'owner' | 'attorney' | 'paralegal' | 'inactive', string>;
  anchor: string;
}

function readSeedExports(): SeedExport {
  const output = execFileSync(
    'npx',
    ['tsx', path.join(__dirname, 'print-seed-ids.ts')],
    // From apps/api: `tsx` is that package's devDependency, so npx resolves it
    // out of `apps/api/node_modules/.bin`. Run from apps/web it is not on the
    // path and npx fails with a bare "tsx: not found". `global-setup.ts` sets
    // cwd the same way and for the same reason.
    { cwd: path.resolve(__dirname, '../../../api'), encoding: 'utf8' },
  );

  // Tagged rather than "the last line": tsx and pnpm both write to stdout on
  // occasion, and a silent mis-parse here would surface as an undefined UUID in
  // a URL — a 404 that reads like a missing fixture.
  const line = output.split('\n').find((row) => row.startsWith('__SEED__'));
  if (line === undefined) {
    throw new Error(`could not read the seed constants. tsx printed:\n${output}`);
  }
  return JSON.parse(line.slice('__SEED__'.length)) as SeedExport;
}

const exported = readSeedExports();

/** Fixed UUIDs, straight out of `apps/api/src/database/seed.ts`. */
export const SEED_IDS = exported.ids;

/**
 * Fixture display names, from the same module that inserts them.
 *
 * A surface that names a person is asserted against this rather than an inline
 * string — the seed builds its user rows from this map, so a rename moves both
 * at once instead of turning a real regression into a passing test.
 */
export const SEED_NAMES = exported.names;

/**
 * The instant every seeded relative date is measured from.
 *
 * Any test asserting deadline urgency pins its clock to this with
 * `page.clock.setFixedTime()`. Slice 1 has no urgency surface, so nothing here
 * uses it yet; it is exported so the next slice does not re-derive it.
 */
export const SEED_ANCHOR = new Date(exported.anchor);

/**
 * The fixture accounts, keyed the way a test thinks about them: by role.
 *
 * These are `fake-supabase-auth.ts`'s ACCOUNTS map and FIXTURE_PASSWORD.
 * Duplicated rather than imported because that module opens a listening socket
 * at import time — importing it would start a second auth server inside the
 * test process, on the port the real one already holds.
 */
export const FIXTURE_PASSWORD = 'test-password-not-a-secret';

export const ACCOUNTS = {
  OWNER: 'elena@rodriguezlaw.test',
  ATTORNEY: 'james@rodriguezlaw.test',
  PARALEGAL: 'sarah@rodriguezlaw.test',
  INACTIVE: 'former@rodriguezlaw.test',
} as const;

export type FixtureRole = keyof typeof ACCOUNTS;
