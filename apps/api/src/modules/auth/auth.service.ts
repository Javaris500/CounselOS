import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Redis from 'ioredis';
import { ERROR_CODES, type AuthUser, type LoginResponse } from '@counselos/shared';

import { TooManyRequestsException, UnauthorizedException } from '../../common/errors/app.exception';
import { REDIS } from '../../redis/redis.module';
import { SUPABASE_ADMIN, SUPABASE_PUBLIC } from './supabase.provider';
import { AuthRepository, type UserRow } from './auth.repository';
import type { SupabaseClaims } from './token-verifier';

/** 05 §L2: access is revoked within one cache TTL at worst. */
const USER_CACHE_TTL_SECONDS = 5 * 60;

/** Login throttle — an unthrottled login is the obvious brute-force target. */
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_ATTEMPTS = 10;

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * Business rules for authentication. No Drizzle here — queries live in
 * AuthRepository (Architecture Rule 1).
 *
 * Holds the only two Supabase clients in the codebase, per CLAUDE.md:101 — the
 * service key is scoped to Auth and Storage and imported nowhere else.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(SUPABASE_PUBLIC) private readonly publicClient: SupabaseClient,
    @Inject(SUPABASE_ADMIN) private readonly adminClient: SupabaseClient,
  ) {}

  /**
   * Verified claims → the firm's user record.
   *
   * A verified token proves who the person is to Supabase. The `users` row is
   * what grants them access to THIS firm — so a valid Supabase account with no
   * row is a 401, never an implicit account.
   */
  async hydrate(claims: SupabaseClaims): Promise<AuthUser> {
    const cached = await this.redis.get(this.cacheKey(claims.sub));
    if (cached !== null) return JSON.parse(cached) as AuthUser;

    const row = (await this.repository.findByAuthId(claims.sub)) ?? (await this.link(claims));

    if (!row.isActive) {
      /**
       * Never cached. Caching the inactive state would be harmless, but caching
       * anything for this sub risks a later hit serving a stale ACTIVE record —
       * and 05 §L2 requires revocation to bite immediately, not after a TTL.
       */
      throw new UnauthorizedException(
        'This account has been deactivated.',
        ERROR_CODES.USER_INACTIVE,
      );
    }

    const user = this.toAuthUser(row);
    await this.redis.set(
      this.cacheKey(claims.sub),
      JSON.stringify(user),
      'EX',
      USER_CACHE_TTL_SECONDS,
    );
    await this.repository.touchLastSeen(row.id);
    return user;
  }

  /**
   * First-login linking. `users.auth_id` starts null — a user is invited into
   * the firm before they ever authenticate — so exactly once, the verified
   * token's `sub` gets written onto the row that matches its verified email.
   */
  private async link(claims: SupabaseClaims): Promise<UserRow> {
    const byEmail = await this.repository.findByEmail(claims.email);

    if (byEmail === undefined) {
      // Authenticated by Supabase, but not a member of this firm.
      throw new UnauthorizedException('No account for this user.', ERROR_CODES.TOKEN_INVALID);
    }

    if (byEmail.authId !== null) {
      /**
       * The email is already bound to a DIFFERENT Supabase identity. Relinking
       * here would mean anyone who can create a Supabase account with a firm
       * member's address inherits that member's access. Refuse, always.
       */
      this.logger.warn(`Rejected relink attempt for user ${byEmail.id}`);
      throw new UnauthorizedException('No account for this user.', ERROR_CODES.TOKEN_INVALID);
    }

    const linked = await this.repository.linkAuthId(byEmail.id, claims.sub);
    if (linked === undefined) {
      // Another concurrent first login won the race. Re-read rather than guess.
      const row = await this.repository.findByAuthId(claims.sub);
      if (row === undefined) {
        throw new UnauthorizedException('No account for this user.', ERROR_CODES.TOKEN_INVALID);
      }
      return row;
    }
    return linked;
  }

  /** Called on deactivation so access dies now rather than in five minutes. */
  async invalidateUser(authId: string): Promise<void> {
    await this.redis.del(this.cacheKey(authId));
  }

  async login(email: string, password: string, ip: string): Promise<AuthSession> {
    await this.assertNotThrottled(email, ip);

    const { data, error } = await this.publicClient.auth.signInWithPassword({ email, password });

    if (error !== null || data.session === null) {
      await this.recordFailure(email, ip);
      // Guards throw before interceptors run, so a failed sign-in produces no
      // HTTP log line. Without this, a brute-force attempt is invisible.
      this.logger.warn(`Failed sign-in for ${email} from ${ip}`);
      // Deliberately identical for a wrong password and an unknown address —
      // distinguishing them turns the login form into an account enumerator.
      throw new UnauthorizedException('Invalid email or password.', ERROR_CODES.UNAUTHORIZED);
    }

    const user = await this.hydrate({ sub: data.session.user.id, email });
    await this.clearFailures(email, ip);

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user,
    };
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const { data, error } = await this.publicClient.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error !== null || data.session === null) {
      throw new UnauthorizedException('Session expired.', ERROR_CODES.UNAUTHORIZED);
    }

    const email = data.session.user.email;
    if (email === undefined) {
      throw new UnauthorizedException('Session expired.', ERROR_CODES.UNAUTHORIZED);
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: await this.hydrate({ sub: data.session.user.id, email }),
    };
  }

  /**
   * Best-effort revocation. A failure here must not block clearing the cookie —
   * a user who cannot sign out is worse than a stale session on our side.
   *
   * The cached user record is deliberately NOT busted. An access token is a
   * stateless JWT: it stays valid until it expires no matter what we delete, so
   * dropping the cache would buy nothing and cost a round trip. Deactivation is
   * the case that must take effect immediately, and it calls invalidateUser().
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken === undefined || refreshToken === '') return;
    try {
      await this.adminClient.auth.admin.signOut(refreshToken);
    } catch {
      this.logger.warn('Supabase sign-out failed; cookie cleared regardless.');
    }
  }

  toLoginResponse(session: AuthSession): LoginResponse {
    return { accessToken: session.accessToken, user: session.user };
  }

  private toAuthUser(row: UserRow): AuthUser {
    // Session identity only. The application role comes from HERE, never from
    // the token — Supabase's `role` claim is the Postgres role and is always
    // 'authenticated', so a forged claim cannot escalate anyone.
    return {
      id: row.id,
      role: row.role,
      firmId: row.firmId,
      fullName: row.fullName,
      email: row.email,
    };
  }

  private cacheKey(authId: string): string {
    return `user:${authId}`;
  }

  private async assertNotThrottled(email: string, ip: string): Promise<void> {
    const counts = await Promise.all(
      this.throttleKeys(email, ip).map(async (key) => Number((await this.redis.get(key)) ?? 0)),
    );
    if (counts.some((count) => count >= LOGIN_MAX_ATTEMPTS)) {
      throw new TooManyRequestsException('Too many sign-in attempts. Try again in a few minutes.');
    }
  }

  private async recordFailure(email: string, ip: string): Promise<void> {
    // Per-email AND per-IP: email alone lets one host spray many addresses, IP
    // alone lets a botnet grind one address.
    await Promise.all(
      this.throttleKeys(email, ip).map(async (key) => {
        const count = await this.redis.incr(key);
        if (count === 1) await this.redis.expire(key, LOGIN_WINDOW_SECONDS);
      }),
    );
  }

  private async clearFailures(email: string, ip: string): Promise<void> {
    await this.redis.del(...this.throttleKeys(email, ip));
  }

  private throttleKeys(email: string, ip: string): string[] {
    return [`login:email:${email.toLowerCase()}`, `login:ip:${ip}`];
  }
}
