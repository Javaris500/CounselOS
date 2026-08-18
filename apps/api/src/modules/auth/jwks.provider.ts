import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

/**
 * The key source — the ONLY externality in the auth path, and therefore the
 * only thing an E2E overrides (18 §285: override true externals, never our own
 * code).
 *
 * Typed as jose's own resolver signature, which is what makes the seam work:
 * `createRemoteJWKSet` (production) and `createLocalJWKSet` (tests) return the
 * SAME type. Everything downstream — jwtVerify, the ES256 allowlist, the
 * signature check, iss/aud/exp — is identical in both, so a test that overrides
 * this still fails on a forged token.
 */
export const JWKS = Symbol('JWKS');
export type Jwks = JWTVerifyGetKey;

/**
 * The one place this path is spelled. Pure, so it is unit-testable against the
 * literal — the production factory is otherwise never exercised locally.
 */
export function jwksUrl(supabaseUrl: string): URL {
  return new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
}

/** Supabase's `iss` claim: https://<ref>.supabase.co/auth/v1 — no trailing slash. */
export function issuerFor(supabaseUrl: string): string {
  return new URL('/auth/v1', supabaseUrl).href;
}

export const jwksProvider: Provider = {
  provide: JWKS,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Jwks =>
    createRemoteJWKSet(jwksUrl(config.getOrThrow<string>('SUPABASE_URL')), {
      // Supabase rotates signing keys. Remote fetch means a rotation is
      // self-healing; a key pinned in config would mean a deploy per rotation
      // and a locked-out firm in between.
      cacheMaxAge: 600_000,
      // Rate-limits the refetch triggered by an unknown `kid`. The tradeoff is
      // deliberate: a rotation can produce up to 30s of 401s, and lowering it
      // trades that for a thundering herd against Supabase. 30s is right for
      // one firm.
      cooldownDuration: 30_000,
      // Never hang a request on Supabase being slow.
      timeoutDuration: 5_000,
    }),
};
