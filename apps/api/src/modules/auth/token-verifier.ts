import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { errors, jwtVerify } from 'jose';
import { z } from 'zod';
import { ERROR_CODES } from '@counselos/shared';

import { Clock } from '../../common/clock';
import { UnauthorizedException } from '../../common/errors/app.exception';
import { JWKS, issuerFor, type Jwks } from './jwks.provider';

/**
 * The claims we rely on. Parsed rather than cast: a token that verifies
 * cryptographically can still be missing `email`, and finding that out here
 * beats finding it out as `undefined` inside the linking query.
 */
const supabaseClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
});

export type SupabaseClaims = z.infer<typeof supabaseClaimsSchema>;

@Injectable()
export class TokenVerifier {
  private readonly issuer: string;

  constructor(
    @Inject(JWKS) private readonly jwks: Jwks,
    private readonly clock: Clock,
    config: ConfigService,
  ) {
    this.issuer = issuerFor(config.getOrThrow<string>('SUPABASE_URL'));
  }

  async verify(token: string): Promise<SupabaseClaims> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        /**
         * Closes algorithm confusion. Without this allowlist an attacker can
         * forge an HS256 token using the PUBLIC key as the shared secret — the
         * public key being, by definition, public.
         */
        algorithms: ['ES256'],
        issuer: this.issuer,
        audience: 'authenticated',
        /**
         * Deliberately zero. Raising this to quiet a flaky test would silently
         * extend the life of every revoked session by that amount.
         * token-verifier.spec.ts pins the boundary so the change cannot pass
         * unnoticed.
         */
        clockTolerance: 0,
        currentDate: this.clock.now(),
      });

      return supabaseClaimsSchema.parse(payload);
    } catch (error) {
      /**
       * A JWKS outage is NOT an authentication failure, and the distinction is
       * load-bearing. Mapping it to 401 would make apiFetch attempt a silent
       * refresh, fail that too, and log the entire firm out during a Supabase
       * blip. 503 says "we cannot check right now" — which is the truth.
       */
      if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid) {
        throw new ServiceUnavailableException('Authentication service unreachable.');
      }
      if (error instanceof errors.JWTExpired) {
        throw new UnauthorizedException('Access token expired.', ERROR_CODES.TOKEN_EXPIRED);
      }
      // Bad signature, wrong issuer or audience, unknown kid, malformed, or
      // missing claims. The client learns nothing beyond "invalid".
      throw new UnauthorizedException('Invalid access token.', ERROR_CODES.TOKEN_INVALID);
    }
  }
}
