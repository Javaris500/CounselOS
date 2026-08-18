import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@counselos/shared';

/**
 * Role gate, enforced by RolesGuard. The role comes from the `users` table on
 * every request — never from a token claim, which a forged token could set.
 *
 * A route with no @Roles() is open to any authenticated user. Coarser access
 * than that (who may see WHICH matter) is 8G's MatterAccessGuard, not this.
 */
export const ROLES = 'roles';
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES, roles);
