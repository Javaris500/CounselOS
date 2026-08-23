import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The Supabase Auth (GoTrue) HTTP surface, called directly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT supabase-js
 *
 * It used to be. Two `createClient()` singletons, built with
 * `{ auth: { persistSession: false, autoRefreshToken: false } }`, under a
 * comment asserting that made them stateless. It did not, and the bug that
 * followed is SURPRISES.md entry 001.
 *
 * `persistSession: false` selects an in-memory storage adapter — it does not
 * stop supabase-js writing the most recent session into it. A singleton client
 * therefore has a notion of "the current session", shared by every caller, and
 * it is whoever logged in last. `refreshSession({ refresh_token })` does not
 * operate on the token you hand it: it first loads that stored session and, if
 * the stored session is inside EXPIRY_MARGIN_MS (90s), silently refreshes it in
 * the background — rotating away a refresh token belonging to a different user,
 * who is then logged out on their next reload having made no request at all.
 *
 * A server that proxies auth for many users cannot hold one current session.
 * There is no configuration of supabase-js that makes a shared client stateless,
 * so the client is gone. This talks to the three GoTrue endpoints the proxy
 * actually needs, over `fetch`, holding nothing between calls.
 *
 * Provided as an injection token rather than built inside AuthService for the
 * reason 18 §10 gives: Supabase Auth is a true external, and an E2E overrides
 * exactly those. Built in the constructor it would be unreachable, leaving the
 * login and refresh paths permanently untestable — the two endpoints most worth
 * testing, since they are the ones that take a password.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const SUPABASE_AUTH = Symbol('SUPABASE_AUTH');

/** What GoTrue returns on a successful grant, narrowed to what we use. */
export interface GoTrueSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string | undefined;
}

/**
 * `null` means GoTrue REJECTED the credential — a wrong password, a consumed
 * refresh token. It never means Supabase was unreachable: that throws, so an
 * outage surfaces as a 500 rather than being reported to the user as a wrong
 * password. Never disguise a down dependency as a working one (CLAUDE.md).
 */
export type GrantResult = GoTrueSession | null;

interface GoTrueTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  user?: { id?: unknown; email?: unknown };
}

export class SupabaseAuthApi {
  constructor(
    private readonly url: string,
    private readonly anonKey: string,
    private readonly serviceKey: string,
  ) {}

  /** Password grant. `null` on bad credentials — never on an outage. */
  async signInWithPassword(email: string, password: string): Promise<GrantResult> {
    return this.grant('password', { email, password }, this.anonKey);
  }

  /**
   * Refresh grant, on the token the CALLER passed and nothing else.
   *
   * That sentence is the whole point of this file. See SURPRISES.md 001.
   */
  async refresh(refreshToken: string): Promise<GrantResult> {
    if (refreshToken === '') return null;
    return this.grant('refresh_token', { refresh_token: refreshToken }, this.anonKey);
  }

  /**
   * Best-effort server-side revocation. Deliberately swallows everything: a
   * user who cannot sign out is worse than a stale session on our side, and the
   * cookie is cleared by the controller regardless.
   */
  async signOut(token: string): Promise<void> {
    try {
      await fetch(`${this.url}/auth/v1/logout?scope=global`, {
        method: 'POST',
        headers: {
          apikey: this.serviceKey,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
      });
    } catch {
      // Intentionally ignored — see the doc comment. AuthService logs it.
    }
  }

  private async grant(
    grantType: 'password' | 'refresh_token',
    body: Record<string, string>,
    apiKey: string,
  ): Promise<GrantResult> {
    const res = await fetch(`${this.url}/auth/v1/token?grant_type=${grantType}`, {
      method: 'POST',
      headers: { apikey: apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    /**
     * 400/401 is GoTrue saying no — bad password, consumed refresh token.
     * Anything else (5xx, a gateway error, an unparseable body) is Supabase
     * failing, and must NOT be reported to the caller as a rejected credential.
     */
    if (res.status === 400 || res.status === 401) return null;
    if (!res.ok) {
      throw new Error(`Supabase Auth returned ${String(res.status)} for a ${grantType} grant`);
    }

    const parsed = (await res.json()) as GoTrueTokenResponse;
    const accessToken = parsed.access_token;
    const refreshToken = parsed.refresh_token;
    const userId = parsed.user?.id;

    if (
      typeof accessToken !== 'string' ||
      typeof refreshToken !== 'string' ||
      typeof userId !== 'string'
    ) {
      throw new Error(`Supabase Auth returned an unusable ${grantType} grant`);
    }

    return {
      accessToken,
      refreshToken,
      userId,
      email: typeof parsed.user?.email === 'string' ? parsed.user.email : undefined,
    };
  }
}

export const supabaseAuthProvider: Provider = {
  provide: SUPABASE_AUTH,
  inject: [ConfigService],
  useFactory: (config: ConfigService): SupabaseAuthApi =>
    new SupabaseAuthApi(
      config.getOrThrow<string>('SUPABASE_URL'),
      // Publishable key: user-context grants.
      config.getOrThrow<string>('SUPABASE_ANON_KEY'),
      // Service key: admin revocation only. Scoped to Auth and Storage and
      // imported nowhere else (CLAUDE.md:101).
      config.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
    ),
};
