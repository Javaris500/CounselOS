import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@counselos/shared';
import type { Request } from 'express';

/**
 * Reads the user JwtAuthGuard attached. **Never undefined on a protected
 * route** — the guard runs first and throws rather than passing through, so a
 * handler that receives this can trust it.
 *
 * On a @Public() route it IS undefined, which is why the type says so.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser | undefined =>
    context.switchToHttp().getRequest<Request & { user?: AuthUser }>().user,
);
