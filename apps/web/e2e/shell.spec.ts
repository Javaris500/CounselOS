import { test, expect } from './fixtures/auth';

/**
 * THE SHELL, NOT A SLICE.
 *
 * `(attorney)/layout.tsx` and its rail are chrome every slice mounts into, so
 * they belong in their own file rather than inside slice 1's — the next agent
 * should not have to read a transactions spec to find out how the nav behaves.
 *
 * What is asserted here is the pair that used to be able to drift: collapse is
 * ONE piece of state, and the clipped labels, the tooltips and the toggle all
 * read it. It was two `@media` blocks in two stylesheets agreeing on 1000px by
 * coincidence, which a user-driven collapse broke on contact.
 */
test.describe('Rail collapse', () => {
  test('toggles, persists, and keeps every row named', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/transactions');
    const rail = page.getByTestId('app-rail');
    await expect(rail).toHaveAttribute('data-collapsed', 'false');

    await page.getByTestId('rail-toggle').click();
    await expect(rail).toHaveAttribute('data-collapsed', 'true');

    /*
      The label is CLIPPED, not `display: none`, so it survives in the
      accessibility tree while leaving the screen.

      `not.toBeVisible()` is the wrong probe for that and fails here: a clipped
      node still has a 1x1 box, which Playwright counts as visible. Measure the
      box instead — that is the actual claim.
    */
    await expect(page.getByTestId('rail-matters')).toHaveAccessibleName(/Matters/);
    const box = await page.getByTestId('rail-matters').getByText('Matters').boundingBox();
    expect(box?.width ?? 99).toBeLessThanOrEqual(2);
    expect(await page.getByTestId('app-rail').evaluate((n) => n.clientWidth)).toBeLessThan(100);

    // Preference survives a reload.
    await page.reload();
    await expect(page.getByTestId('app-rail')).toHaveAttribute('data-collapsed', 'true');

    await page.getByTestId('rail-toggle').click();
    await expect(page.getByTestId('app-rail')).toHaveAttribute('data-collapsed', 'false');
  });

  test('below the breakpoint collapse is forced and the toggle is withdrawn', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/transactions');
    await expect(page.getByTestId('app-rail')).toHaveAttribute('data-collapsed', 'true');
    // Offering a control that cannot expand would be a control that does nothing.
    await expect(page.getByTestId('rail-toggle')).toHaveCount(0);
  });

  test('the tooltip is armed by collapse, at any width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/transactions');

    const bubble = page.getByTestId('rail-deadlines').locator('..').getByTestId('ui-tooltip');
    await expect(bubble).toBeHidden();

    await page.getByTestId('rail-toggle').click();
    await page.getByTestId('rail-deadlines').hover();
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText('Lands with slice 3');
  });
});
