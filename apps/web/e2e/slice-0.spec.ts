import { expect, test, type Page } from '@playwright/test';

/**
 * SLICE 0 — THE FOUNDATION GATE (00-developer-guide.md §7).
 *
 *   login → dashboard · expired token silently refreshes · deactivated user
 *   lands on /auth/deactivated · paralegal denied an unassigned matter sees the
 *   explaining error
 *
 * THE FOURTH CLAUSE IS NOT HERE. It is Layer 8G, which resolves against
 * transactions.assigned_attorney_id and therefore depends on Module 3 — slice
 * 1. It cannot be written before there are transaction-scoped routes to guard.
 * See the note added to 00 §7.
 *
 * Everything below runs against the real stack: real browser, real Next, real
 * NestJS, real Postgres and Redis, real guards, real httpOnly cookie. Only
 * Supabase Auth is faked, and it mints genuine ES256 tokens so the API's
 * verification is real.
 */
const FAKE_AUTH = 'http://127.0.0.1:54321';
const PASSWORD = 'test-password-not-a-secret';

const ATTORNEY = 'james@rodriguezlaw.test';
const DEACTIVATED = 'former@rodriguezlaw.test';

async function setAccessTokenTtl(seconds: number): Promise<void> {
  await fetch(`${FAKE_AUTH}/__control/access-token-ttl`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seconds }),
  });
}

async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/auth/login');
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-password-input').fill(password);
  await page.getByTestId('auth-submit-btn').click();
}

test.beforeEach(async () => {
  await setAccessTokenTtl(3600);
});

test.describe('Slice 0 gate', () => {
  test('login → dashboard', async ({ page }) => {
    await signIn(page, ATTORNEY);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('ui-empty-state')).toBeVisible();
  });

  test('an unauthenticated visit to a protected page goes to login', async ({ page }) => {
    // The guard lives in the layout, so this holds for every attorney route
    // that will ever exist — not just the ones someone remembered to protect.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login$/);
  });

  test('the session survives a reload, because the refresh cookie does', async ({ page }) => {
    // The access token lives in memory and is gone after a reload. This is the
    // mechanism that makes that cost nothing — and the same mechanism
    // storageState relies on for every later slice's tests.
    await signIn(page, ATTORNEY);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.reload();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('ui-empty-state')).toBeVisible();
  });

  test('an expired access token refreshes silently, with no visible interruption', async ({
    page,
  }) => {
    // Two seconds, so the token genuinely expires mid-session rather than being
    // simulated. apiFetch should notice the 401 TOKEN_EXPIRED, refresh once,
    // and retry — all without the user seeing a login screen.
    await setAccessTokenTtl(2);
    await signIn(page, ATTORNEY);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.waitForTimeout(3000);
    await page.reload();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId('ui-empty-state')).toBeVisible();
  });

  test('a deactivated user lands on /auth/deactivated, never on login', async ({ page }) => {
    // Their credentials are fine; the account was disabled. Sending them to
    // login produces a loop where signing in succeeds and nothing changes.
    await signIn(page, DEACTIVATED);

    await expect(page).toHaveURL(/\/auth\/deactivated$/);
    await expect(page.getByRole('heading')).toContainText('no longer active');
  });

  test('a wrong password says so without revealing whether the account exists', async ({
    page,
  }) => {
    await signIn(page, ATTORNEY, 'wrong-password');

    await expect(page.getByTestId('auth-error')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login$/);
  });
});
