import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type JWTVerifyGetKey,
} from 'jose';

/**
 * A test-only ES256 keyring.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS REPLACES `issueTestJwt` IN 10-tdd-guide.md §"Auth Helper", WHICH CANNOT WORK.
 *
 * That helper signs HS256 with a shared `JWT_SECRET`. Supabase signs access
 * tokens with **ES256**, verified against a public key from its JWKS endpoint —
 * there is no shared secret to sign with, and `JWT_SECRET` has been deleted.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The keypair is generated IN THE TEST PROCESS, per suite. No globalSetup change,
 * no env channel, no committed key material: the code that signs and the app that
 * verifies live in one process, so nothing crosses a boundary.
 *
 * WHAT THIS STILL PROVES. The only thing a suite overrides is the key SOURCE,
 * and `createLocalJWKSet` returns the same `JWTVerifyGetKey` type as the
 * production `createRemoteJWKSet`. So `jwtVerify` runs identically in both:
 * signature, algorithm allowlist, issuer, audience, and expiry are all really
 * checked. A token signed by a second keyring still fails.
 */
const DEFAULT_KID = 'e2e-signing-key';

export interface SignOptions {
  /** Seconds from now. **Negative issues an already-expired token** — which is
   *  how the TOKEN_EXPIRED case stays deterministic without pinning the app
   *  clock (Postgres `now()` and Redis TTLs run on real time regardless). */
  expiresIn?: number;
  kid?: string;
  issuer?: string;
  audience?: string;
  /** Forge with HS256 to prove the ES256 allowlist holds. */
  forgeHs256?: boolean;
}

export interface TestKeyring {
  /** Drop-in for the JWKS provider. Real ES256 verification, zero network. */
  jwks: JWTVerifyGetKey;
  publicJwk: JWK;
  sign(sub: string, claims?: Record<string, unknown>, opts?: SignOptions): Promise<string>;
}

export async function createTestKeyring(
  supabaseUrl: string = process.env.SUPABASE_URL ?? 'http://localhost:54321',
): Promise<TestKeyring> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk: JWK = {
    ...(await exportJWK(publicKey)),
    kid: DEFAULT_KID,
    alg: 'ES256',
    use: 'sig',
  };
  const issuer = new URL('/auth/v1', supabaseUrl).href;

  return {
    jwks: createLocalJWKSet({ keys: [publicJwk] }),
    publicJwk,
    async sign(sub, claims = {}, opts = {}) {
      const now = Math.floor(Date.now() / 1000);
      const builder = new SignJWT({
        // Supabase's `role` is the POSTGRES role and is always 'authenticated'.
        // It is NOT the application role — OWNER/ATTORNEY/PARALEGAL comes from
        // the users table on every request, so a forged claim cannot escalate.
        role: 'authenticated',
        ...claims,
      })
        .setProtectedHeader({
          alg: opts.forgeHs256 === true ? 'HS256' : 'ES256',
          kid: opts.kid ?? DEFAULT_KID,
        })
        .setIssuer(opts.issuer ?? issuer)
        .setAudience(opts.audience ?? 'authenticated')
        .setSubject(sub)
        .setIssuedAt(now)
        .setExpirationTime(now + (opts.expiresIn ?? 3600));

      if (opts.forgeHs256 === true) {
        // Algorithm confusion: sign symmetrically with the public key's own
        // bytes, which is the classic attack the allowlist exists to stop.
        return builder.sign(new TextEncoder().encode(JSON.stringify(publicJwk)));
      }
      return builder.sign(privateKey);
    },
  };
}

export const authHeader = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});
