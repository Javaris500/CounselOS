import { ConfigService } from '@nestjs/config';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import { ERROR_CODES } from '@counselos/shared';

import { FixedClock } from '../../common/clock';
import { AppException } from '../../common/errors/app.exception';
import { TokenVerifier } from './token-verifier';

/**
 * The expiry boundary, pinned.
 *
 * `clockTolerance: 0` is the reason a deactivated attorney's token dies exactly
 * when it says it will. The realistic way it gets broken is someone raising the
 * tolerance to quiet a flaky test — which would silently extend the life of
 * every revoked session by that amount. This spec makes that change fail.
 */
describe('TokenVerifier', () => {
  const PROJECT = 'https://project.supabase.co';
  const ISSUER = `${PROJECT}/auth/v1`;
  const SUB = '00000000-0000-4000-8000-0000000000a1';
  const NOW = new Date('2026-06-15T12:00:00.000Z');
  const EXP = Math.floor(NOW.getTime() / 1000);

  // Inferred rather than named: jose v5 does not export the key type, and the
  // DOM CryptoKey lib is not enabled in this tsconfig.
  type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let privateKey: PrivateKey;
  let jwks: ReturnType<typeof createLocalJWKSet>;

  const config = { getOrThrow: () => PROJECT } as unknown as ConfigService;

  const verifierAt = (now: Date): TokenVerifier =>
    new TokenVerifier(jwks, new FixedClock(now), config);

  const tokenExpiringAt = (exp: number): Promise<string> =>
    new SignJWT({ email: 'james@rodriguezlaw.test' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setSubject(SUB)
      .setIssuedAt(exp - 3600)
      .setExpirationTime(exp)
      .sign(privateKey);

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    privateKey = pair.privateKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256', use: 'sig' };
    jwks = createLocalJWKSet({ keys: [jwk] });
  });

  it('accepts a token one second before it expires', async () => {
    const claims = await verifierAt(new Date((EXP - 1) * 1000)).verify(await tokenExpiringAt(EXP));
    expect(claims.sub).toBe(SUB);
  });

  it('rejects a token at the exact instant it expires — no grace', async () => {
    // If someone adds clockTolerance, this is the assertion that fails.
    await expect(
      verifierAt(new Date(EXP * 1000)).verify(await tokenExpiringAt(EXP)),
    ).rejects.toThrow(AppException);
  });

  it('reports expiry as TOKEN_EXPIRED, not a generic 401', async () => {
    // The frontend branches on this: TOKEN_EXPIRED triggers a silent refresh,
    // anything else logs the user out.
    expect.assertions(1);
    try {
      await verifierAt(new Date((EXP + 60) * 1000)).verify(await tokenExpiringAt(EXP));
    } catch (error) {
      expect((error as AppException).code).toBe(ERROR_CODES.TOKEN_EXPIRED);
    }
  });

  it('reports every other failure as TOKEN_INVALID, leaking no reason', async () => {
    // A client should not learn whether it got the issuer, the audience, or the
    // signature wrong.
    expect.assertions(1);
    try {
      await verifierAt(NOW).verify('not-a-jwt');
    } catch (error) {
      expect((error as AppException).code).toBe(ERROR_CODES.TOKEN_INVALID);
    }
  });

  it('rejects a token that verifies but carries no email', async () => {
    // Cryptographically fine, useless to us: the linking step matches on email,
    // and finding it undefined inside a query would be a 500.
    const noEmail = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setSubject(SUB)
      .setExpirationTime(EXP + 3600)
      .sign(privateKey);

    await expect(verifierAt(NOW).verify(noEmail)).rejects.toThrow(AppException);
  });
});
