import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { AxeBuilder } from '@axe-core/playwright';
import { test as anonymous, expect, type Page } from '@playwright/test';

import { test } from './fixtures/auth';
import { SEED_IDS } from './fixtures/seed';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * AXE-CORE — THE GENERIC WCAG RULE SWEEP.
 *
 * This is the COMPLEMENT to `slice-1-a11y.spec.ts`, not a replacement, and the
 * split is deliberate. That file is hand-written and aimed at this slice's
 * KNOWN risks: the status ladder losing its meaning in grayscale, the outcome
 * dialog refusing Escape on purpose, a refusal banner that must survive
 * forced-colors. No rule engine would think to check any of those, because they
 * are facts about real-estate law rather than facts about HTML.
 *
 * Axe is the other half: ~100 rules nobody on this project thought to check.
 * Landmark structure, heading order, duplicate ids, ARIA attribute validity,
 * list semantics, page language, orphaned form controls. The two catch
 * genuinely disjoint sets, and the reason to have both is that a hand-written
 * suite only ever tests what its author already suspected.
 *
 * Nemi's header says it plainly: "No axe-core here: it is not a dependency of
 * `@counselos/web` and adding one is outside this harness's boundary. Adding
 * axe is filed as a recommendation." This is that recommendation, taken.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS ASSERTS ON WCAG TAGS ONLY, AND REPORTS best-practice SEPARATELY.
 *
 * Axe ships two kinds of rule. The `wcag*` tags map to numbered success
 * criteria and are the thing an accessibility claim is actually made against.
 * The `best-practice` tags are axe's own house style — real advice, but not a
 * standard, and several of them (`region`, `landmark-one-main`) fire on
 * perfectly conformant pages.
 *
 * Gating on both would make the browser gate fail for reasons that are not
 * conformance failures, and the predictable response to that is someone
 * disabling the whole spec. So: WCAG A/AA is the GATE, best-practice is
 * COLLECTED and written to the report for a human to triage. One analyze() call
 * per surface produces both — the partition happens here, not in axe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * WCAG 2.1 Level A and AA — the conformance target in `ui-ux-design-checklist.md`
 * ("AA is a floor, not a preference"). 2.2 tags are deliberately absent: the
 * design system was authored against 2.1 and adding 2.2 here would report drift
 * against a target nobody has agreed to yet.
 */
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Everything axe knows, so best-practice lands in the report rather than nowhere. */
const ALL_TAGS = [...WCAG_AA, 'best-practice'];

/**
 * Axe's own result types, derived from the builder rather than imported from
 * `axe-core`. The types live in axe-core, but it is a transitive dependency —
 * pnpm's strict layout means it is NOT resolvable from `@counselos/web`, so a
 * direct `import type { Result } from 'axe-core'` fails to compile here while
 * looking entirely reasonable. Deriving reaches the same types through the
 * package that does declare the dependency.
 */
type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
type Result = AxeResults['violations'][number];

interface CompactNode {
  target: string;
  html: string;
  failureSummary: string;
}

interface CompactViolation {
  id: string;
  impact: string;
  help: string;
  helpUrl: string;
  standard: 'wcag' | 'best-practice';
  nodeCount: number;
  nodes: CompactNode[];
}

interface SurfaceReport {
  surface: string;
  scheme: 'light' | 'dark';
  url: string;
  wcagViolations: CompactViolation[];
  bestPracticeViolations: CompactViolation[];
  incomplete: CompactViolation[];
  passedRules: number;
}

/**
 * Holds only the sweep currently being written. NOT an accumulator — see
 * `writeSurface` for why accumulating across tests loses data here.
 */
const report: SurfaceReport[] = [];

const isWcag = (result: Result): boolean => result.tags.some((tag) => WCAG_AA.includes(tag));

function compact(result: Result): CompactViolation {
  return {
    id: result.id,
    impact: result.impact ?? 'unknown',
    help: result.help,
    helpUrl: result.helpUrl,
    standard: isWcag(result) ? 'wcag' : 'best-practice',
    nodeCount: result.nodes.length,
    // EVERY node, not a slice. An earlier version of this kept `.slice(0, 5)`
    // to hold the report down, and it cost a real finding: the dark detail
    // shell had six failing nodes, five of them one root cause, and the sixth —
    // a danger button at 3.03:1 — fell off the end. The assertion still failed,
    // so nothing looked wrong; the REPORT under-counted, and a report is what
    // the findings file is written from. Truncation belongs in the display
    // helper, where it cannot silently drop evidence.
    nodes: result.nodes.map((node) => ({
      target: node.target.join(' '),
      html: node.html.length > 200 ? `${node.html.slice(0, 200)}…` : node.html,
      failureSummary: node.failureSummary ?? '',
    })),
  };
}

/** Human-readable enough to diagnose from the failure message alone. */
function describe(violations: CompactViolation[]): string {
  return violations
    .map(
      (violation) =>
        `\n  [${violation.impact}] ${violation.id} — ${violation.help} (${String(violation.nodeCount)} node(s))\n` +
        `    ${violation.helpUrl}\n` +
        violation.nodes
          .slice(0, 8)
          .map((node) => `    at ${node.target}\n      ${node.failureSummary.replace(/\n/g, '\n      ')}`)
          .join('\n'),
    )
    .join('\n');
}

/**
 * Sweep one surface and record it. Returns only the WCAG subset, because that
 * is the only subset the caller is allowed to gate on.
 */
async function sweep(
  page: Page,
  surface: string,
  scheme: 'light' | 'dark',
): Promise<CompactViolation[]> {
  const results = await new AxeBuilder({ page }).withTags(ALL_TAGS).analyze();

  const all = results.violations.map(compact);
  const wcagViolations = all.filter((violation) => violation.standard === 'wcag');
  const bestPracticeViolations = all.filter((violation) => violation.standard === 'best-practice');

  report.push({
    surface,
    scheme,
    url: page.url(),
    wcagViolations,
    bestPracticeViolations,
    // "incomplete" is axe declining to decide — usually contrast behind a
    // gradient, a translucent layer, or an image. Not a failure, but it IS the
    // list a human still has to look at, so it is recorded IN FULL rather than
    // as bare rule ids: "the outcome dialog has an undecidable contrast check"
    // is not something anyone can act on without knowing which element.
    incomplete: results.incomplete.map(compact),
    passedRules: results.passes.length,
  });

  writeSurface(report[report.length - 1]);

  return wcagViolations;
}

/**
 * The machine-readable artifact the findings file is built from: ONE FILE PER
 * SURFACE, under `test-results/axe/`, which Playwright clears at the start of
 * every run and `.gitignore` already excludes — a report is a build output.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY PER-SURFACE, AND NOT ONE ACCUMULATED FILE WRITTEN AT THE END.
 *
 * Both obvious shapes lose data here, and both lose it silently.
 *
 * An `afterAll` hook scopes to the suite of the TEST TYPE it was declared on.
 * This file deliberately uses two — `anonymous` for the signed-out surfaces,
 * the auth fixture for the rest — so a hook declared on either fires for only
 * its own half.
 *
 * Accumulating in a module-level array and rewriting the whole file each time
 * fails differently and worse: PLAYWRIGHT RESTARTS THE WORKER PROCESS AFTER A
 * FAILED TEST. The module is re-imported, the array is empty again, and the
 * next write TRUNCATES the file to just the surfaces swept since the restart.
 * The report that results looks complete and is missing precisely the failing
 * surface — the one the audit exists to find.
 *
 * A file per surface has no shared state to lose, so neither failure applies.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function writeSurface(surface: SurfaceReport): void {
  const directory = path.resolve(__dirname, '../test-results/axe');
  mkdirSync(directory, { recursive: true });
  const slug = `${surface.scheme}--${surface.surface}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  writeFileSync(
    path.join(directory, `${slug}.json`),
    `${JSON.stringify({ gate: WCAG_AA, tags: ALL_TAGS, ...surface }, null, 2)}\n`,
  );
}

// ═══ THE SURFACE LIST ════════════════════════════════════════════════════════
//
// Surfaces are data, not nine hand-written tests, because every one of them has
// to be swept twice — see the colour-scheme note below. Each entry carries the
// navigation that PUTS the page in the state worth auditing; a dialog and its
// error state are separate surfaces because they are separate accessibility
// trees, not variations on the page behind them.

interface Surface {
  name: string;
  /** Signed-out surfaces must be swept WITHOUT a session — that is the state a real visitor is in. */
  anonymous?: true;
  visit: (page: Page) => Promise<void>;
}

const SURFACES: Surface[] = [
  {
    name: 'auth/login',
    anonymous: true,
    visit: async (page) => {
      await page.goto('/auth/login');
      await expect(page.getByTestId('auth-login-form')).toBeVisible();
    },
  },
  {
    name: 'auth/deactivated',
    anonymous: true,
    // Where a USER_INACTIVE response routes. Low traffic, and exactly the kind
    // of surface nobody looks at again after writing it.
    visit: async (page) => {
      await page.goto('/auth/deactivated');
    },
  },
  {
    name: 'client/status',
    anonymous: true,
    // Slice 1 ships this as a deliberate stub; the real page lands with the
    // client portal. Swept anyway — it is a route a client can reach today, and
    // the not-found copy is what they would actually see.
    visit: async (page) => {
      await page.goto(`/status/${SEED_IDS.transactions.manorRd}`);
    },
  },
  {
    name: 'attorney/home',
    visit: async (page) => {
      await page.goto('/home');
      await expect(page.getByTestId('home-placeholder-matters-link')).toBeVisible();
    },
  },
  {
    name: 'attorney/transactions',
    visit: async (page) => {
      await page.goto('/transactions');
      await expect(page.getByTestId('transaction-pipeline')).toBeVisible();
    },
  },
  {
    name: 'attorney/transaction-detail',
    visit: async (page) => {
      await page.goto(`/transactions/${SEED_IDS.transactions.manorRd}`);
      await expect(page.getByTestId('transaction-shell')).toBeVisible();
    },
  },
  {
    name: 'dialog/transaction-create',
    visit: async (page) => {
      await page.goto('/transactions');
      await page.getByTestId('transaction-create-btn').click();
      await expect(page.getByTestId('transaction-create-dialog')).toBeVisible();
    },
  },
  {
    name: 'dialog/transaction-create-errors',
    // Submitted empty. `role="alert"`, `aria-invalid` and `aria-describedby`
    // wiring does not exist until a field fails, so a sweep of the happy path
    // never reaches this tree.
    visit: async (page) => {
      await page.goto('/transactions');
      await page.getByTestId('transaction-create-btn').click();
      await page.getByTestId('transaction-create-submit').click();
      await expect(
        page.getByTestId('transaction-create-dialog').locator('[role="alert"]').first(),
      ).toBeVisible();
    },
  },
  {
    name: 'dialog/transaction-outcome',
    // The non-dismissible one. Its deviation from the usual modal contract is
    // asserted in slice-1-a11y.spec.ts; what is checked here is that the
    // deviation did not also cost it its labelling or focus semantics.
    visit: async (page) => {
      await page.goto('/transactions');
      await page.getByTestId('transaction-create-btn').click();
      await page.getByTestId('transaction-address-input').fill('4200 Red River St');
      await page.getByTestId('transaction-create-submit').click();
      await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}$/);
      await page.getByTestId('status-move-fallen-through-btn').click();
      await expect(page.getByTestId('transaction-outcome-dialog')).toBeVisible();
    },
  },
];

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EVERY SURFACE IS SWEPT IN BOTH COLOUR SCHEMES.
 *
 * `globals.css` defines the dark palette under `@media (prefers-color-scheme:
 * dark)`, which means it is not an opt-in feature — every attorney whose OS is
 * set to dark is already looking at it, today, with no toggle involved.
 *
 * The two palettes are INDEPENDENTLY authored, so their contrast ratios are
 * independent facts: `--text-disabled` is 2.7:1 in light and 2.2:1 in dark, and
 * a token that clears AA on paper can fail on ink. Playwright's default context
 * is `colorScheme: 'light'`, so a sweep that says nothing about the scheme has
 * quietly audited half the product and reported on all of it.
 *
 * A single-theme pass would not be a smaller audit. It would be an audit whose
 * headline number is wrong.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SCHEMES = ['light', 'dark'] as const;

for (const scheme of SCHEMES) {
  test.describe(`${scheme} · authenticated`, () => {
    test.use({ colorScheme: scheme });

    for (const surface of SURFACES.filter((candidate) => candidate.anonymous === undefined)) {
      test(`${surface.name} has no WCAG A/AA violations`, async ({ page }) => {
        await surface.visit(page);
        const violations = await sweep(page, surface.name, scheme);
        expect(violations, describe(violations)).toEqual([]);
      });
    }
  });

  anonymous.describe(`${scheme} · signed out`, () => {
    anonymous.use({ colorScheme: scheme });

    for (const surface of SURFACES.filter((candidate) => candidate.anonymous === true)) {
      anonymous(`${surface.name} has no WCAG A/AA violations`, async ({ page }) => {
        await surface.visit(page);
        const violations = await sweep(page, surface.name, scheme);
        expect(violations, describe(violations)).toEqual([]);
      });
    }
  });
}
