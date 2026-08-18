import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The two Supabase clients, as injection tokens — the same seam pattern as
 * JWKS and DRIZZLE.
 *
 * They are tokens rather than fields on AuthService for one reason: Supabase
 * Auth is a true external, and 18 §285 says an E2E overrides exactly those.
 * Built inside the constructor they would be unreachable, which would leave the
 * login and refresh paths permanently untestable — the endpoints most worth
 * testing, since they are the ones that take a password.
 */
export const SUPABASE_PUBLIC = Symbol('SUPABASE_PUBLIC');
export const SUPABASE_ADMIN = Symbol('SUPABASE_ADMIN');

/**
 * persistSession/autoRefreshToken off: this is a stateless server. A client
 * that quietly retained a session would leak one user's tokens into another
 * user's request — the single worst bug this file could have.
 */
const SERVER_SIDE = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** Publishable key. User-context operations: sign in, refresh, sign out. */
export const supabasePublicProvider: Provider = {
  provide: SUPABASE_PUBLIC,
  inject: [ConfigService],
  useFactory: (config: ConfigService): SupabaseClient =>
    createClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_ANON_KEY'),
      SERVER_SIDE,
    ),
};

/**
 * Service key. Admin operations only, never used to serve a user request.
 * Scoped to Auth and Storage and imported nowhere else (CLAUDE.md:101).
 */
export const supabaseAdminProvider: Provider = {
  provide: SUPABASE_ADMIN,
  inject: [ConfigService],
  useFactory: (config: ConfigService): SupabaseClient =>
    createClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_SERVICE_KEY'),
      SERVER_SIDE,
    ),
};
