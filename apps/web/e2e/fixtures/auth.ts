import { test as base, type Page, type PlaywrightWorkerArgs } from '@playwright/test';

import { ACCOUNTS, FIXTURE_PASSWORD, type FixtureRole } from './seed';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * THE storageState HARNESS. Every slice from 1 onward takes its auth from here.
 *
 * CLAUDE.md's Playwright rules: "Don't log in inside a test — auth comes from
 * `storageState` per role; the login flow itself is tested once, in slice 0."
 * `slice-0.spec.ts` is that one exception and stays as it is.
 *
 * WHAT A STORED CONTEXT ACTUALLY CARRIES HERE. The access token lives in memory
 * in the Zustand store and is deliberately not in localStorage, so there is
 * nothing durable to store on the origin side. The durable half is the httpOnly
 * `counselos_rt` cookie: a context that carries it loads a protected route,
 * `useRequireAuth` calls `restoreSession()`, and `apiFetch` mints a fresh access
 * token from the cookie. Slice 0's "the session survives a reload" test is the
 * same mechanism, proven.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS MINTED PER TEST AND NOT READ FROM A FILE ON DISK.
 *
 * The obvious shape — log in once per role in a setup project, write
 * `.auth/attorney.json`, point every later test at it — CANNOT WORK against
 * this API, and it fails in the worst possible way: test one passes, test two
 * lands on the login page, and it reads as a flake.
 *
 * The refresh token ROTATES ON USE. `AuthService.refresh()` hands the presented
 * token to Supabase, the fake Supabase at :54321 mirrors real Supabase by
 * DELETING it and issuing a new one, and the API sets the new one as the
 * cookie. So the cookie captured in a file is a SINGLE-USE credential: the
 * first test to load a protected page consumes it, the API writes the successor
 * into that test's own context, the context is discarded at test end, and the
 * file still holds the dead token.
 *
 * Rotation is correct and is not the thing to change — a refresh token that
 * survives its own use is a replayable credential. So the harness adapts: one
 * login per test, through the API rather than the form, producing a real
 * `storageState` object that Playwright hands to the context exactly as it
 * would hand it a file. The rule that matters — no test drives the login UI —
 * holds. The file was never the point.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Filed as a finding, because the same trap is waiting for every later slice.
 */

const API_BASE = 'http://127.0.0.1:3101';
const FAKE_AUTH = 'http://127.0.0.1:54321';

/**
 * The suite shares one fake auth server, and slice 0's silent-refresh test
 * drops the access-token lifetime to two seconds. A test that ran after it with
 * the TTL still short would refresh mid-assertion for no reason connected to
 * what it is testing, so every minted session restores the default first.
 */
export async function setAccessTokenTtl(seconds: number): Promise<void> {
  const response = await fetch(`${FAKE_AUTH}/__control/access-token-ttl`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seconds }),
  });
  if (!response.ok) {
    throw new Error(`fake supabase auth did not accept the TTL change: ${String(response.status)}`);
  }
}

export interface StoredState {
  cookies: unknown[];
  origins: unknown[];
}

/**
 * A real session for a fixture account, as a Playwright storage state.
 *
 * Through `/v1/auth/login` rather than the sign-in form: the form is slice 0's
 * subject, and driving it here would make every later slice's gate depend on
 * the login UI staying identical. This calls the same endpoint the form calls.
 */
export async function mintStorageState(
  playwright: PlaywrightWorkerArgs['playwright'],
  role: FixtureRole,
): Promise<StoredState> {
  await setAccessTokenTtl(3600);

  const context = await playwright.request.newContext({ baseURL: API_BASE });
  try {
    const response = await context.post('/v1/auth/login', {
      data: { email: ACCOUNTS[role], password: FIXTURE_PASSWORD },
    });

    if (!response.ok()) {
      throw new Error(
        `could not mint a ${role} session: ${String(response.status())} ${await response.text()}`,
      );
    }

    // Captures the httpOnly Set-Cookie the response carried. The cookie is
    // host-only on 127.0.0.1 and cookies ignore ports, so the browser context
    // on :3100 sends it to the API on :3101 — same site, so SameSite=lax
    // allows it.
    const state = (await context.storageState()) as StoredState;

    const hasRefreshCookie = state.cookies.some(
      (cookie) => (cookie as { name?: string }).name === 'counselos_rt',
    );
    if (!hasRefreshCookie) {
      // Loud here rather than as "redirected to /auth/login" thirty lines into
      // an unrelated assertion.
      throw new Error(
        `a ${role} login returned no counselos_rt cookie — the harness would silently produce an anonymous context`,
      );
    }

    return state;
  } finally {
    await context.dispose();
  }
}

/**
 * The test object every slice-1-and-later spec imports.
 *
 * `role` is a normal Playwright option, so a describe block selects its actor
 * with `test.use({ role: 'PARALEGAL' })` and the default stays ATTORNEY — the
 * actor for nearly every surface in the product.
 */
export const test = base.extend<{ role: FixtureRole; signedInAs: FixtureRole }>({
  role: ['ATTORNEY', { option: true }],

  storageState: async ({ playwright, role }, use) => {
    await use((await mintStorageState(playwright, role)) as never);
  },

  /** Readable in a failure message: which account this context is actually on. */
  signedInAs: async ({ role }, use) => {
    await use(role);
  },
});

export { expect } from '@playwright/test';

/**
 * A second signed-in browser tab, in its own context.
 *
 * Needed by the invalid-transition clause: the only way a browser can attempt
 * an illegal transition is to hold a STALE view of the matter, because the
 * status control only ever offers what the server's last response said was
 * legal. A colleague moving the matter in another window is exactly that, and
 * it is the real-world shape of the bug rather than a contrived one.
 */
export async function openSecondSession(
  playwright: PlaywrightWorkerArgs['playwright'],
  browser: PlaywrightWorkerArgs['browser'],
  role: FixtureRole,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    storageState: (await mintStorageState(playwright, role)) as never,
    baseURL: 'http://127.0.0.1:3100',
  });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}
