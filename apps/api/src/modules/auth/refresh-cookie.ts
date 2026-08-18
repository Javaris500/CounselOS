import type { CookieOptions } from 'express';

/**
 * The refresh token lives here and nowhere else.
 *
 * Not in localStorage, not in a response body, not in the Zustand store — any
 * of which a script on the page could read. `httpOnly` is what makes it
 * unreachable from JavaScript, which is the entire reason login proxies through
 * this API instead of the browser talking to Supabase directly.
 */
export const REFRESH_COOKIE = 'counselos_rt';

export function refreshCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    // TLS-only outside development. In development the API is plain http on
    // localhost, where a secure cookie would simply never be sent.
    secure: isProduction,
    /**
     * 'lax' is correct while the app and API share a registrable domain
     * (localhost:3000 → localhost:3001 today; app./api. subdomains later —
     * port and subdomain do not make a request cross-SITE). If they are ever
     * split across genuinely different domains this must become
     * 'none' + secure, and CORS credentials must follow.
     */
    sameSite: 'lax',
    // Scoped to the only routes that read it, so it is not attached to every
    // API request and cannot leak through an unrelated endpoint.
    path: '/v1/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}
