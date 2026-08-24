import type { Page, Route } from '@playwright/test';

import { expect, test } from './fixtures/auth';
import { SEED_IDS } from './fixtures/seed';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * FOUR STATES ON EVERY SURFACE SLICE 1 ADDED.
 *
 *   pipeline board · detail shell · status control · activity feed ·
 *   parties list · create dialog
 *
 * Loading, empty, error, success — each proven, or the surface fails the gate.
 * A surface that only works with populated happy-path data is unfinished
 * (06 Part 10), and the happy path is the one state that gets exercised by
 * accident. The other three are the ones an attorney meets on a bad morning.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE INTERCEPTS OUR OWN API, WHEN THE GATE DOES NOT.
 *
 * CLAUDE.md: mock only the true externals. `slice-1.spec.ts` obeys that with no
 * exceptions — it is the gate, and a gate over a mocked backend proves nothing.
 *
 * But "the list request fails with a 500" and "the response has not arrived
 * yet" are not states the backend can be asked to produce, and they are the two
 * states this product is most likely to get wrong: an error swallowed into an
 * empty board reads as "you have no matters", which is a false statement about
 * a law firm's caseload. The interception here replaces the NETWORK, not a
 * module — the same seam MSW occupies (06 Part 14) — and every assertion is
 * about what the component renders, never about what the server computed.
 *
 * Kept in its own file so the gate stays honest and this stays legible.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const REQUEST_ID = 'req_nemi_slice1';

/** A `{ success: false }` envelope, exactly as the API's filter emits one. */
const errorBody = (code: string, message: string): string =>
  JSON.stringify({
    success: false,
    error: { code, message, details: null, requestId: REQUEST_ID },
  });

/** Fails one endpoint. `times: 1` so a retry or revalidation sees the real API. */
async function failOnce(page: Page, url: string, code = 'INTERNAL_ERROR'): Promise<void> {
  await page.route(
    url,
    async (route: Route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: errorBody(code, 'Something went wrong.'),
      });
    },
    { times: 1 },
  );
}

/**
 * Holds one endpoint open so the loading state can be observed, and hands back
 * the release. A fixed `waitForTimeout` would be a race dressed as a delay.
 */
async function hold(page: Page, url: string): Promise<() => void> {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(url, async (route: Route) => {
    await gate;
    await route.continue();
  });
  return release;
}

/**
 * Opens a matter through the real create dialog and returns its id.
 *
 * Used where a surface needs data the seed does not provide. THE SEED WRITES NO
 * `activity` ROWS — every seeded matter's feed is empty — so the feed's success
 * state is unreachable from the fixtures alone and has to be produced. Filed as
 * a finding against `11-test-data.md`; this is the workaround, not the fix.
 */
async function createMatter(page: Page, address: string): Promise<string> {
  await page.goto('/transactions');
  await page.getByTestId('transaction-create-btn').click();
  await page.getByTestId('transaction-address-input').fill(address);
  await page.getByTestId('transaction-create-submit').click();
  await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}$/);
  return page.url().split('/').pop() ?? '';
}

// ═══ PIPELINE BOARD ══════════════════════════════════════════════════════════

test.describe('Pipeline board', () => {
  test('LOADING — a content-shaped skeleton, never a bare spinner', async ({ page }) => {
    const release = await hold(page, '**/v1/transactions');
    await page.goto('/transactions');

    const loading = page.getByTestId('transaction-pipeline-loading');
    await expect(loading).toBeVisible();
    // Content-shaped is the requirement: columns in ladder order, each with
    // rows where cards will land, so nothing jumps when the data arrives.
    await expect(loading.getByTestId('ui-skeleton')).toHaveCount(5);
    await expect(loading).toContainText('Intake');
    await expect(loading).toContainText('Closing Prep');
    // The board is genuinely not there yet — a skeleton over a rendered board
    // would be decoration.
    await expect(page.getByTestId('transaction-pipeline')).toHaveCount(0);

    release();
    await expect(page.getByTestId('transaction-pipeline')).toBeVisible();
  });

  test('EMPTY — designed, in brand voice, with the way out on it', async ({ page }) => {
    await page.route('**/v1/transactions', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
          meta: { total: 0, limit: 20, offset: 0, hasMore: false },
        }),
      });
    });
    await page.goto('/transactions');

    const empty = page.getByTestId('ui-empty-state');
    await expect(empty).toBeVisible();
    // An empty state with no action is a dead end.
    await expect(empty.getByTestId('transaction-create-btn')).toBeVisible();
    await expect(page.getByTestId('transaction-pipeline')).toHaveCount(0);
  });

  test('ERROR — mapped by code, and never mistaken for empty', async ({ page }) => {
    await failOnce(page, '**/v1/transactions');
    await page.goto('/transactions');

    const error = page.getByTestId('ui-error-state');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('data-error-code', 'INTERNAL_ERROR');
    await expect(error).toHaveAttribute('role', 'alert');
    // The correlation ID is on screen so a support request can quote it.
    await expect(error).toContainText(REQUEST_ID);

    // THE DISTINCTION THAT MATTERS. A failed fetch rendered as "No active
    // transactions" tells a law firm its caseload is empty. These two states
    // must never be confusable.
    await expect(page.getByTestId('ui-empty-state')).toHaveCount(0);
    await expect(page.getByTestId('transaction-pipeline')).toHaveCount(0);
  });

  test('SUCCESS — the seeded matters, each under its own status column', async ({ page }) => {
    await page.goto('/transactions');

    const board = page.getByTestId('transaction-pipeline');
    await expect(board).toBeVisible();
    // Seven columns: the full ladder, including the two terminal ones, so a
    // closed matter has somewhere to be.
    await expect(page.getByTestId('pipeline-column')).toHaveCount(7);

    await expect(
      page.locator(
        `[data-testid="pipeline-column"][data-status="DUE_DILIGENCE"] [data-transaction-id="${SEED_IDS.transactions.manorRd}"]`,
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        `[data-testid="pipeline-column"][data-status="CLOSING_PREP"] [data-transaction-id="${SEED_IDS.transactions.clawsonRd}"]`,
      ),
    ).toBeVisible();

    // An empty column says so rather than collapsing — the ladder stays legible.
    await expect(
      page.locator('[data-testid="pipeline-column"][data-status="CLOSED"]'),
    ).toContainText('Nothing here');
  });
});

// ═══ DETAIL SHELL ════════════════════════════════════════════════════════════

test.describe('Detail shell', () => {
  const url = `/transactions/${SEED_IDS.transactions.manorRd}`;
  const detailApi = `**/v1/transactions/${SEED_IDS.transactions.manorRd}`;

  test('LOADING — the shell has its own skeleton, not the layout guard’s', async ({ page }) => {
    const release = await hold(page, detailApi);
    await page.goto(url);

    await expect(page.getByTestId('transaction-shell-loading')).toBeVisible();
    await expect(page.getByTestId('transaction-shell')).toHaveCount(0);

    release();
    await expect(page.getByTestId('transaction-shell')).toBeVisible();
  });

  test('EMPTY — a matter that is not there reads as not-found, not as broken', async ({ page }) => {
    // The shell's "empty": a 200 with no matter. It must land on
    // TRANSACTION_NOT_FOUND rather than rendering a headerless husk.
    await page.route(
      detailApi,
      async (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: null }),
        }),
      { times: 1 },
    );
    await page.goto(url);

    const error = page.getByTestId('ui-error-state');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('data-error-code', 'TRANSACTION_NOT_FOUND');
    await expect(page.getByTestId('transaction-shell')).toHaveCount(0);
  });

  test('ERROR — mapped by code, with the matter never partially rendered', async ({ page }) => {
    await failOnce(page, detailApi);
    await page.goto(url);

    const error = page.getByTestId('ui-error-state');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('data-error-code', 'INTERNAL_ERROR');
    await expect(page.getByTestId('transaction-shell')).toHaveCount(0);
    await expect(page.getByTestId('transaction-tabs')).toHaveCount(0);
  });

  test('SUCCESS — identity, facts, and the full tab strip with unlanded tabs disabled', async ({
    page,
  }) => {
    await page.goto(url);

    await expect(page.getByTestId('transaction-shell')).toBeVisible();
    await expect(page.getByTestId('transaction-title')).toContainText('2847 Manor Rd');

    // The frame five other slices mount into. A tab whose slice has not landed
    // renders DISABLED, never hidden — the same honesty rule `not_configured`
    // applies to a dependency.
    const tabs = page.getByTestId('transaction-tabs');
    await expect(tabs).toBeVisible();
    await expect(tabs.locator('[data-testid^="tab-"]')).toHaveCount(10);
    await expect(page.getByTestId('tab-overview')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('tab-documents')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('tab-drafts')).toHaveAttribute('aria-disabled', 'true');
  });
});

// ═══ ACTIVITY FEED ═══════════════════════════════════════════════════════════

test.describe('Activity feed', () => {
  const url = `/transactions/${SEED_IDS.transactions.manorRd}`;
  const activityApi = `**/v1/transactions/${SEED_IDS.transactions.manorRd}/activity`;

  test('LOADING — a skeleton in the panel, while the rest of the matter renders', async ({
    page,
  }) => {
    const id = await createMatter(page, '2200 Guadalupe St');

    const release = await hold(page, `**/v1/transactions/${id}/activity`);
    await page.goto(`/transactions/${id}`);

    // The point of fetching the feed separately: the matter is readable while
    // its history is still arriving.
    await expect(page.getByTestId('transaction-shell')).toBeVisible();
    await expect(page.getByTestId('transaction-activity-feed')).toHaveCount(0);

    release();
    await expect(page.getByTestId('transaction-activity-feed')).toBeVisible();
  });

  test('EMPTY — says what will land here, rather than showing an empty rule', async ({ page }) => {
    await page.route(
      activityApi,
      async (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [],
            meta: { total: 0, limit: 20, offset: 0, hasMore: false },
          }),
        }),
      { times: 1 },
    );
    await page.goto(url);

    await expect(page.getByTestId('ui-empty-state')).toBeVisible();
    await expect(page.getByTestId('transaction-activity-feed')).toHaveCount(0);
  });

  test('ERROR — the panel fails alone; the matter around it still reads', async ({ page }) => {
    await failOnce(page, activityApi);
    await page.goto(url);

    const error = page.getByTestId('ui-error-state');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('data-error-code', 'INTERNAL_ERROR');

    // A partial outage never blocks the whole app (CLAUDE.md, AI rules — the
    // same principle applies to any dependency).
    await expect(page.getByTestId('transaction-shell')).toBeVisible();
    await expect(page.getByTestId('transaction-status-control')).toBeVisible();
    await expect(page.getByTestId('transaction-parties')).toBeVisible();
  });

  test('SUCCESS — entries carry an absolute, machine-readable timestamp', async ({ page }) => {
    await createMatter(page, '3811 Red River St');

    const feed = page.getByTestId('transaction-activity-feed');
    await expect(feed).toBeVisible();
    const first = feed.locator('li').first();
    await expect(first).toHaveAttribute('data-event-type', /.+/);
    // "3 days ago" is useless in a legal record; <time datetime> is what makes
    // the rendered stamp verifiable.
    await expect(first.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);
  });
});

// ═══ PARTIES LIST ════════════════════════════════════════════════════════════

test.describe('Parties list', () => {
  test('SUCCESS — every party, grouped by role, with the field people reach for', async ({
    page,
  }) => {
    await page.goto(`/transactions/${SEED_IDS.transactions.manorRd}`);

    const parties = page.getByTestId('transaction-parties');
    await expect(parties).toBeVisible();
    await expect(parties.locator('li')).toHaveCount(6);
    await expect(parties.locator('[data-party-role="TITLE_COMPANY"]')).toContainText(
      'Independence Title',
    );
    // `notes` inline is the whole argument for this surface: the file number is
    // what someone opening it is actually looking for.
    await expect(parties.locator('[data-party-role="TITLE_COMPANY"]')).toContainText('File #');
  });

  test('EMPTY — a matter with no parties yet explains why that matters', async ({ page }) => {
    // sCongress is seeded with no parties. A real fixture, not a mocked one.
    await page.goto(`/transactions/${SEED_IDS.transactions.sCongress}`);

    await expect(page.getByTestId('transaction-shell')).toBeVisible();
    await expect(page.getByTestId('transaction-parties')).toHaveCount(0);
    await expect(page.getByTestId('ui-empty-state').first()).toBeVisible();
  });

  test('LOADING and ERROR belong to the shell, and are proven there', async ({ page }) => {
    // Parties arrive ON the detail payload — there is no separate request to
    // delay or fail. Asserting that here rather than leaving it unstated: a
    // reader looking for the missing two states should find this, not a gap.
    let partiesRequests = 0;
    page.on('request', (request) => {
      if (/\/v1\/transactions\/[0-9a-f-]+\/parties/.test(request.url())) partiesRequests += 1;
    });

    await page.goto(`/transactions/${SEED_IDS.transactions.manorRd}`);
    await expect(page.getByTestId('transaction-parties')).toBeVisible();
    expect(partiesRequests).toBe(0);
  });
});

// ═══ CREATE DIALOG ═══════════════════════════════════════════════════════════

test.describe('Create dialog', () => {
  test('EMPTY — opens pristine, with the type pre-chosen and nothing else assumed', async ({
    page,
  }) => {
    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();

    const dialog = page.getByTestId('transaction-create-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('transaction-address-input')).toHaveValue('');
    await expect(page.getByTestId('transaction-type-select')).toHaveValue('PURCHASE');
    // No transaction-number and no status field: the server owns the number,
    // and status always starts at INTAKE. Offering either here would be a way
    // around the transition map.
    await expect(dialog.locator('[name="status"]')).toHaveCount(0);
    await expect(dialog.locator('[name="transactionNumber"]')).toHaveCount(0);
  });

  test('ERROR — a validation failure lands on the offending field, not in a toast', async ({
    page,
  }) => {
    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();
    // Address is required. Submitting empty must fail at the field.
    await page.getByTestId('transaction-create-submit').click();

    const dialog = page.getByTestId('transaction-create-dialog');
    await expect(dialog.locator('[role="alert"]').first()).toBeVisible();
    await expect(dialog).toContainText('property address is required');
    // Still open — a form that closes on failure loses everything typed.
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('ui-toast')).toHaveCount(0);
  });

  test('ERROR — a non-422 failure surfaces as a toast, and saves nothing', async ({ page }) => {
    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();
    await page.getByTestId('transaction-address-input').fill('99 Nonexistent Ln');

    await page.route(
      '**/v1/transactions',
      async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: errorBody('INTERNAL_ERROR', 'Something went wrong.'),
        });
      },
      { times: 1 },
    );

    await page.getByTestId('transaction-create-submit').click();

    const toast = page.getByTestId('ui-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Nothing was saved.');
    await expect(page.getByTestId('transaction-create-dialog')).toBeVisible();
    await expect(page).toHaveURL(/\/transactions$/);
  });

  test('LOADING — the submit disables in flight, so nothing double-opens', async ({ page }) => {
    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();
    await page.getByTestId('transaction-address-input').fill('4405 Duval St');

    const release = await hold(page, '**/v1/transactions');
    await page.getByTestId('transaction-create-submit').click();

    const submit = page.getByTestId('transaction-create-submit');
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute('aria-busy', 'true');
    // Genuinely disabled, not styled to look it: a second click while a create
    // is in flight opens a second matter.
    await submit.click({ force: true, timeout: 2000 }).catch(() => undefined);

    release();

    // SUCCESS — one matter, and the attorney lands on it.
    await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('transaction-title')).toContainText('4405 Duval St');

    await page.goto('/transactions');
    await expect(page.locator('[data-testid="transaction-card"]', { hasText: '4405 Duval St' })).toHaveCount(1);
  });
});

// ═══ STATUS CONTROL ══════════════════════════════════════════════════════════

test.describe('Status control', () => {
  test('LOADING — the pressed move shows busy and every move disables', async ({ page }) => {
    await page.goto(`/transactions/${SEED_IDS.transactions.annieSt}`);
    const control = page.getByTestId('transaction-status-control');
    await expect(control).toBeVisible();

    const release = await hold(page, `**/v1/transactions/*/status`);
    await control.getByTestId('status-move-closing-prep-btn').click();

    await expect(control.getByTestId('status-move-closing-prep-btn')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    // NEVER OPTIMISTIC. The badge must still show the old status while the
    // server decides — a status is a legal state, and rendering a move the
    // server may refuse is how an attorney walks away believing a matter closed.
    await expect(control.locator('[data-tone]')).toHaveText('Title Review');
    // The sibling moves disable too, so a second transition cannot race the first.
    await expect(control.getByTestId('status-move-due-diligence-btn')).toBeDisabled();

    release();

    // SUCCESS — the badge moves only once the server has said so.
    await expect(control.locator('[data-tone]')).toHaveText('Closing Prep');
    await expect(page.getByTestId('ui-toast')).toContainText('Closing Prep');
  });

  test('EMPTY — a terminal matter offers no moves, and says why', async ({ page }) => {
    // Driven through the real UI: INTAKE → FALLEN_THROUGH is a legal move, and
    // it is the one that demands an outcome. Both halves are the surface.
    await page.goto('/transactions');
    await page.getByTestId('transaction-create-btn').click();
    await page.getByTestId('transaction-address-input').fill('1300 E 6th St');
    await page.getByTestId('transaction-create-submit').click();
    await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}$/);

    const control = page.getByTestId('transaction-status-control');
    await control.getByTestId('status-move-fallen-through-btn').click();

    // A terminal move prompts for the outcome and will not proceed without it —
    // `outcome_reason` is unrecoverable (16 §2.3).
    const outcome = page.getByTestId('transaction-outcome-dialog');
    await expect(outcome).toBeVisible();
    await page.getByTestId('transaction-outcome-submit').click();
    await expect(outcome).toContainText('Choose an outcome');
    await expect(outcome).toBeVisible();

    await page.getByTestId('transaction-outcome-select').selectOption('FINANCING_DENIED');
    await page.getByTestId('transaction-outcome-notes').fill('Underwriting withdrew the approval.');
    await page.getByTestId('transaction-outcome-submit').click();

    await expect(outcome).toBeHidden();
    await expect(control.locator('[data-tone]')).toHaveText('Fell Through');

    // The empty state of this surface: no moves, and a sentence explaining that
    // this is by design rather than a permission problem.
    await expect(page.getByTestId('transaction-status-terminal')).toBeVisible();
    await expect(page.locator('[data-testid^="status-move-"]')).toHaveCount(0);

    // And the outcome is surfaced, because capturing it at the one knowable
    // moment was the entire argument for demanding it.
    await expect(page.getByTestId('transaction-outcome')).toContainText('Financing denied');
    await expect(page.getByTestId('transaction-outcome')).toContainText('Underwriting withdrew');
  });
});
