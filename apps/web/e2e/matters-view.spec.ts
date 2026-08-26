import { test, expect } from './fixtures/auth';

/**
 * TWO VIEWS OF ONE SET OF MATTERS.
 *
 * The board answers "where is everything in the pipeline"; the list answers
 * "what closes next". Seven columns do not fit a laptop, so the board scrolls
 * sideways and comparing two matters means scrolling between them — which is
 * the whole reason the list exists. Neither replaces the other.
 */
test.describe('Matters views', () => {
  test('switches, persists, and renders exactly one view at a time', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/transactions');

    await expect(page.getByTestId('transaction-pipeline')).toBeVisible();
    await expect(page.getByTestId('transaction-list')).toHaveCount(0);
    await expect(page.getByTestId('matters-view-board')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('matters-view-list').click();

    /*
      The board must be GONE, not merely hidden. `hidden` sets `display: none`
      in the UA stylesheet and `.board` sets `display: grid` — the author rule
      wins, so a `hidden` board renders underneath the list. Asserting on count
      rather than visibility is what catches that.
    */
    await expect(page.getByTestId('transaction-list')).toBeVisible();
    await expect(page.getByTestId('transaction-pipeline')).toHaveCount(0);
    await expect(page.getByTestId('matters-view-list')).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(page.getByTestId('transaction-list')).toBeVisible();

    await page.getByTestId('matters-view-board').click();
    await expect(page.getByTestId('transaction-list')).toHaveCount(0);
  });

  test('the page body never scrolls in either view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/transactions');

    // The shell is exactly viewport height; only .content scrolls. A page-level
    // scrollbar here also shows beside an open modal, which reads as the modal
    // having one of its own.
    const overflow = async (): Promise<number> =>
      page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByTestId('matters-view-list').click();
    await expect(page.getByTestId('transaction-list')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });

  test('every icon-only control carries a real name', async ({ page }) => {
    await page.goto('/transactions');
    // `title` is unstyleable, delayed, and absent on keyboard focus — so the
    // name is an aria-label and the tooltip only repeats it visually.
    await expect(page.getByTestId('matters-view-board')).toHaveAccessibleName('Board view');
    await expect(page.getByTestId('matters-view-list')).toHaveAccessibleName('List view');
    await expect(page.getByTestId('rail-toggle')).toHaveAccessibleName(/sidebar/i);
  });
});
