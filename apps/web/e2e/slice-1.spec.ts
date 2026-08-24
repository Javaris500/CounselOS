import { openSecondSession, expect, test } from './fixtures/auth';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SLICE 1 — THE BROWSER GATE (00-developer-guide.md §7), verbatim:
 *
 *   create → appears in the right pipeline column → open detail → change status
 *   → invalid transition blocked with a VISIBLE REASON
 *
 * The last clause is the load-bearing one. `INVALID_STATUS_TRANSITION` carries
 * `details.allowedTransitions`, and the point of the clause is that the refusal
 * TELLS THE ATTORNEY WHERE THEY MAY GO INSTEAD. A test that only asserts the
 * transition failed proves the server said no; it does not prove the product
 * said why, and "Could not update" is the outcome this gate exists to forbid.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Real browser, real Next, real NestJS, real Postgres, real guards. Only
 * Supabase Auth is faked, and it mints genuine ES256 tokens. No route is
 * intercepted in this file — the four-states proofs, which need a failure the
 * backend will not produce on demand, live in `slice-1-states.spec.ts` and are
 * kept out of the gate deliberately.
 *
 * Auth comes from the storageState harness (`fixtures/auth.ts`). Nothing here
 * touches the login form; slice 0 owns that.
 */

/** Unique per run, so a re-run without a reseed cannot match a previous card. */
const ADDRESS = `1904 Cherrywood Rd #${String(Date.now() % 100000)}`;

test.describe('Slice 1 gate', () => {
  test('create → right column → detail → status change → invalid transition explains itself', async ({
    page,
    playwright,
    browser,
  }) => {
    // ── 1. CREATE ────────────────────────────────────────────────────────────
    await page.goto('/transactions');
    await expect(page.getByTestId('transaction-pipeline')).toBeVisible();

    await page.getByTestId('transaction-create-btn').click();
    await expect(page.getByTestId('transaction-create-dialog')).toBeVisible();

    await page.getByTestId('transaction-address-input').fill(ADDRESS);
    await page.getByTestId('transaction-buyer-input').fill('Priya Raghavan');
    await page.getByTestId('transaction-seller-input').fill('Marcus and Dee Webb');
    await page.getByTestId('transaction-price-input').fill('548000.00');
    await page.getByTestId('transaction-create-submit').click();

    // The attorney lands ON the new matter — they opened it to work on it.
    await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}$/);
    const detailUrl = page.url();
    const transactionId = detailUrl.split('/').pop() ?? '';
    expect(transactionId).toHaveLength(36);

    // ── 2. APPEARS IN THE RIGHT PIPELINE COLUMN ──────────────────────────────
    //
    // "The right column" is the whole assertion. A card that renders anywhere on
    // the board would satisfy a naive check; a new matter is INTAKE and must be
    // under INTAKE, because the board's columns ARE the status ladder.
    await page.goto('/transactions');
    const newCard = page.locator(`[data-testid="transaction-card"][data-transaction-id="${transactionId}"]`);
    await expect(newCard).toBeVisible();
    await expect(newCard).toHaveAttribute('data-status', 'INTAKE');

    // …and it is inside the INTAKE column, not merely somewhere with an INTAKE
    // badge. The column is the parent, so this is the containment claim.
    const cardInIntake = page.locator(
      `[data-testid="pipeline-column"][data-status="INTAKE"] [data-transaction-id="${transactionId}"]`,
    );
    await expect(cardInIntake).toBeVisible();

    // Not in any other column.
    const cardsElsewhere = page.locator(
      `[data-testid="pipeline-column"]:not([data-status="INTAKE"]) [data-transaction-id="${transactionId}"]`,
    );
    await expect(cardsElsewhere).toHaveCount(0);

    // ── 3. OPEN DETAIL ───────────────────────────────────────────────────────
    await cardInIntake.click();
    await expect(page).toHaveURL(new RegExp(`/transactions/${transactionId}$`));
    await expect(page.getByTestId('transaction-shell')).toBeVisible();
    await expect(page.getByTestId('transaction-title')).toContainText(ADDRESS);
    await expect(page.getByTestId('transaction-status-control')).toBeVisible();

    // ── 4. CHANGE STATUS ─────────────────────────────────────────────────────
    //
    // Twice, so the matter reaches DUE_DILIGENCE — a status with three legal
    // exits, which is what makes step 5's staleness a genuine conflict rather
    // than a same-state no-op.
    const statusControl = page.getByTestId('transaction-status-control');

    await expect(statusControl.getByTestId('status-move-under-contract-btn')).toBeVisible();
    await statusControl.getByTestId('status-move-under-contract-btn').click();
    await expect(statusControl.locator('[data-tone]')).toHaveText('Under Contract');

    await statusControl.getByTestId('status-move-due-diligence-btn').click();
    await expect(statusControl.locator('[data-tone]')).toHaveText('Due Diligence');

    // The activity feed refreshed without a reload, because invalidation is
    // declared on the mutation and not at this call site (mutations.ts).
    await expect(page.getByTestId('transaction-activity-feed')).toBeVisible();
    await expect(page.getByTestId('transaction-activity-feed').locator('li')).toHaveCount(3);

    // ── 5. THE VIEW GOES STALE ───────────────────────────────────────────────
    //
    // The status control only ever offers `transaction.allowedTransitions`,
    // which the SERVER computed — so a browser cannot ask for an illegal
    // transition unless what it is looking at is out of date. A colleague moving
    // the matter in another window is exactly that, and it is the real shape of
    // this failure rather than a contrived one.
    //
    // `revalidateOnFocus: false` (queryKeys.ts) is what keeps this tab stale
    // when focus returns to it — which is a deliberate product decision, so the
    // staleness under test is the one attorneys will actually hit.
    const second = await openSecondSession(playwright, browser, 'ATTORNEY');
    try {
      await second.page.goto(`/transactions/${transactionId}`);
      const otherControl = second.page.getByTestId('transaction-status-control');
      await expect(otherControl.locator('[data-tone]')).toHaveText('Due Diligence');

      await otherControl.getByTestId('status-move-title-review-btn').click();
      await expect(otherControl.locator('[data-tone]')).toHaveText('Title Review');

      await otherControl.getByTestId('status-move-closing-prep-btn').click();
      await expect(otherControl.locator('[data-tone]')).toHaveText('Closing Prep');
    } finally {
      await second.close();
    }

    // ── 6. INVALID TRANSITION, BLOCKED WITH A VISIBLE REASON ─────────────────
    await page.bringToFront();
    // Still showing the stale ladder — this is the precondition, asserted rather
    // than assumed, so a future revalidation change fails HERE and not with a
    // confusing "the rejection never appeared".
    await expect(statusControl.locator('[data-tone]')).toHaveText('Due Diligence');

    await statusControl.getByTestId('status-move-under-contract-btn').click();

    const rejection = page.getByTestId('transaction-status-rejected');
    await expect(rejection).toBeVisible();

    // (a) The move did NOT happen. A refusal that quietly succeeded would be the
    //     worst possible outcome of this clause.
    await expect(statusControl.locator('[data-tone]')).not.toHaveText('Under Contract');

    // (b) It is announced, not merely painted. role="alert" is what makes the
    //     refusal reach an attorney who is not looking at that corner.
    await expect(rejection).toHaveAttribute('role', 'alert');

    // (c) THE REASON IS VISIBLE, and it is the SERVER's reason — the message
    //     names both the state it refused to leave and the one it refused to
    //     enter. Asserting on rendered text here is deliberate and is not the
    //     forbidden "select on text content": the visible text IS the thing
    //     under test, and a testid cannot prove that a human can read why.
    const reasonText = (await rejection.innerText()).toUpperCase();
    expect(reasonText).toContain('CLOSING PREP');
    expect(reasonText).toContain('UNDER CONTRACT');

    // (d) AND WHERE THEY MAY GO INSTEAD. `details.allowedTransitions` from
    //     CLOSING_PREP is exactly [CLOSED, FALLEN_THROUGH], rendered with the
    //     labels the attorney sees everywhere else in the product.
    await expect(rejection).toContainText('Closed');
    await expect(rejection).toContainText('Fell Through');

    // …and it does not offer anything that is NOT legal from CLOSING_PREP. An
    // "explaining" error that explains something untrue is worse than a bare
    // 403 — it sends the attorney to do a thing that will also fail.
    await expect(rejection).not.toContainText('Title Review');
    await expect(rejection).not.toContainText('Intake');
  });
});
