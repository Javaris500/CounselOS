import { expect, test } from './fixtures/auth';
import { SEED_IDS, SEED_NAMES } from './fixtures/seed';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * THE CLAUSE SLICE 0 DEFERRED (00-developer-guide.md §7):
 *
 *   "paralegal denied an unassigned matter sees the EXPLAINING error, not a
 *   bare 403"
 *
 * It is the fourth clause of the slice 0 gate and it could not be written then:
 * Layer 8G resolves against `transactions.assigned_attorney_id`, so it needs
 * Module 3 — slice 1 — to have transaction-scoped routes to guard.
 * `slice-0.spec.ts:10` says exactly this. This file closes it.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * FIXTURES, FROM THE SEED MODULE, NEVER FOUND BY CLICKING.
 *   manorRd    — assignedParalegalId = Sarah Kim  → she has FULL
 *   clawsonRd  — assignedAttorneyId only          → she has NOTHING
 *
 * The pair matters. Asserting only the denial would pass equally well against a
 * build where the paralegal can open nothing at all, which is a different and
 * much larger bug.
 */
test.describe('Layer 8G in the browser — the paralegal', () => {
  test.use({ role: 'PARALEGAL' });

  test('opens the matter she is assigned to', async ({ page }) => {
    await page.goto(`/transactions/${SEED_IDS.transactions.manorRd}`);

    await expect(page.getByTestId('transaction-shell')).toBeVisible();
    await expect(page.getByTestId('transaction-title')).toContainText('2847 Manor Rd');
    // FULL, not read-only cover: the control offers real moves.
    await expect(page.getByTestId('transaction-status-control')).toBeVisible();
    await expect(page.getByTestId('status-move-title-review-btn')).toBeVisible();
  });

  test('is denied an unassigned matter, and the refusal explains itself', async ({ page }) => {
    await page.goto(`/transactions/${SEED_IDS.transactions.clawsonRd}`);

    const error = page.getByTestId('ui-error-state');
    await expect(error).toBeVisible();

    // (a) NOT A BARE 403. The typed code reached the component, which is what
    //     lets the UI say something specific — the frontend switches on
    //     `error.code`, never on `message` (06 Part 5).
    await expect(error).toHaveAttribute('data-error-code', 'MATTER_ACCESS_DENIED');

    // (b) It is announced, not merely rendered.
    await expect(error).toHaveAttribute('role', 'alert');

    // (c) The matter itself never renders. A denial that still leaks the
    //     property address and the client names has denied nothing.
    await expect(page.getByTestId('transaction-shell')).toHaveCount(0);
    await expect(page.getByTestId('transaction-title')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('4102 Clawson Rd');

    // (d) EXPLAINING, in the sense the gate means: it tells her what to do next
    //     rather than that she may not. Asserting the rendered sentence is
    //     deliberate — "explaining" is a claim about what a human reads, and no
    //     testid can stand in for it.
    //
    //     This asserted the bare word "attorney" until 2026-08-24, and passed
    //     against the GENERIC copy ErrorState mapped from the code — "ask the
    //     assigned attorney to add you". That is precisely the defect finding 1
    //     describes: the server named James Okafor and the component said "the
    //     assigned attorney". So the assertion is now the NAME, which can only
    //     have come from `error.message`, and the generic phrase is asserted
    //     ABSENT so a regression to it fails here instead of passing quietly.
    await expect(error).toContainText('access');
    await expect(error).toContainText(SEED_NAMES.attorney);
    await expect(error).not.toContainText('the assigned attorney');
  });

  test('an unassigned matter is not in her pipeline either', async ({ page }) => {
    // The guard on the detail route is worth nothing if the list hands out every
    // client name and address anyway (MatterAccessService.listScope).
    await page.goto('/transactions');
    await expect(page.getByTestId('transaction-pipeline')).toBeVisible();

    await expect(
      page.locator(`[data-transaction-id="${SEED_IDS.transactions.manorRd}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-transaction-id="${SEED_IDS.transactions.clawsonRd}"]`),
    ).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('4102 Clawson Rd');
  });
});

/**
 * The other half of the 8G ladder, and the one a role check gets wrong.
 *
 * An attorney NOT on the matter gets READ_ONLY cover, not FULL — they can read
 * a colleague's matter but must not change a legal state on it. `sCongress` is
 * assigned to the OWNER, so James is unassigned on it.
 */
test.describe('Layer 8G in the browser — read-only cover', () => {
  test.use({ role: 'ATTORNEY' });

  test('an unassigned attorney can read the matter but not move its status', async ({ page }) => {
    await page.goto(`/transactions/${SEED_IDS.transactions.sCongress}`);

    await expect(page.getByTestId('transaction-shell')).toBeVisible();
    await expect(page.getByTestId('transaction-title')).toContainText('Bright Owl Coffee');

    // The write is refused by the server (`@MatterAccess('FULL')`), and the
    // refusal has to be visible rather than a silent no-op.
    await page.getByTestId('status-move-closing-prep-btn').click();

    const toast = page.getByTestId('ui-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('read-only');

    // And the status did not move.
    await expect(
      page.getByTestId('transaction-status-control').locator('[data-tone]'),
    ).toHaveText('Title Review');
  });
});
