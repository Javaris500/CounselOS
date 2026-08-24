/**
 * Prints the seeded fixture constants as JSON. Run by `seed.ts` under tsx.
 *
 * Not a test and not imported by one — Playwright's `testMatch` only collects
 * `*.spec.ts` / `*.test.ts`, so this file is inert to the runner.
 *
 * See the header of `seed.ts` for why the specs cannot simply import the seed
 * module in-process.
 */
import { SEED_ANCHOR, SEED_IDS } from '../../../api/src/database/seed';

// eslint-disable-next-line no-console
console.log(`__SEED__${JSON.stringify({ ids: SEED_IDS, anchor: SEED_ANCHOR.toISOString() })}`);
