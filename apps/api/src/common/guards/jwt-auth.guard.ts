import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { ERROR_CODES, type AuthUser } from '@counselos/shared';
import type { Request } from 'express';

import { UnauthorizedException } from '../errors/app.exception';
import { IS_PUBLIC } from '../decorators/public.decorator';
import { AuthService } from '../../modules/auth/auth.service';
import { TokenVerifier } from '../../modules/auth/token-verifier';

/**
 * Authenticates every request. Registered as APP_GUARD, so protection is the
 * default and @Public() is the exception.
 *
 * Thin by design: it does no cryptography (TokenVerifier) and no database work
 * (AuthService). It decides only whether this request has an identity.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly authService: AuthService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.bearer(request);
    if (token === undefined) {
      throw new UnauthorizedException('Authentication required.', ERROR_CODES.UNAUTHORIZED);
    }

    const claims = await this.verifier.verify(token);
    const user = await this.authService.hydrate(claims);

    request.user = user;
    /**
     * Also into CLS, which is what lets the logger, Sentry, and any queue job
     * spawned from this request carry the user without it being threaded
     * through every signature. RequestLoggingInterceptor already reads this and
     * has been logging `anon` for every request until now.
     */
    this.cls.set('userId', user.id);
    this.cls.set('firmId', user.firmId);

    return true;
  }

  private bearer(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (header === undefined) return undefined;
    const [scheme, value] = header.split(' ');
    // Case-insensitive: RFC 7235 says the scheme is case-insensitive, and a
    // client sending "bearer" is not an attacker.
    return scheme?.toLowerCase() === 'bearer' && value !== undefined ? value : undefined;
  }
}
