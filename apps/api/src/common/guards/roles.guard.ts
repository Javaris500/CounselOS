import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, type AuthUser, type UserRole } from '@counselos/shared';
import type { Request } from 'express';

import { ForbiddenException } from '../errors/app.exception';
import { ROLES } from '../decorators/roles.decorator';

/**
 * Enforces @Roles(). Runs AFTER JwtAuthGuard — registration order is execution
 * order (18 §3), and a role check with no authenticated user has nothing to
 * check.
 *
 * The message names the required role rather than saying "forbidden". A bare
 * 403 generates a support ticket every time; this is the same reasoning 8G
 * applies to matter access, applied to roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No @Roles() means any authenticated user. JwtAuthGuard already ran.
    if (required === undefined || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (user === undefined) {
      throw new ForbiddenException('Authentication required.', ERROR_CODES.FORBIDDEN);
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `This action requires the ${required.join(' or ')} role.`,
        ERROR_CODES.FORBIDDEN,
      );
    }
    return true;
  }
}
