import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, type AuthUser } from '@counselos/shared';

import { NotFoundException } from '../errors/app.exception';
import {
  MATTER_ACCESS,
  MATTER_CONTEXT,
  type MatterAccessLevel,
  type RequestWithMatter,
} from '../decorators/matter-access.decorator';
import { MatterAccessService } from '../../modules/transactions/matter-access.service';

/** A path segment that is not a UUID cannot name a matter. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * LAYER 8G — one guard, not scattered checks (05 §8G).
 *
 * Runs AFTER JwtAuthGuard and RolesGuard: registration order is execution order
 * (18 §3), and a matter-access check with no authenticated user has nothing to
 * check. Registered in TransactionsModule, which is imported after AuthModule.
 *
 * Thin by design. It reads the declaration, finds the matter id, and delegates
 * the decision to MatterAccessService — the ladder lives in one testable place
 * rather than inside a framework hook.
 */
@Injectable()
export class MatterAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: MatterAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const required = this.reflector.getAllAndOverride<MatterAccessLevel>(MATTER_ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No declaration means the route is not matter-scoped. That is a real
    // answer, not a gap — POST /v1/transactions has no matter yet, and
    // GET /v1/auth/me never will.
    if (required === undefined) return true;

    const request = context.switchToHttp().getRequest<RequestWithMatter & { user?: AuthUser }>();
    const { user } = request;
    if (user === undefined) {
      // Unreachable through AppModule — JwtAuthGuard runs first and throws.
      // Kept because "unreachable" is a property of today's registration order,
      // and failing closed costs nothing.
      throw new NotFoundException('Transaction not found.', ERROR_CODES.TRANSACTION_NOT_FOUND);
    }

    // Express types a param as `string | string[]`: a repeated `?id=` yields an
    // array. An array is not an id, and must not be coerced into one.
    const raw: unknown = request.params.id;
    const transactionId = typeof raw === 'string' ? raw : undefined;

    /**
     * A malformed id is a 404, not a 500.
     *
     * Guards run BEFORE pipes, so the Zod param DTO has not validated anything
     * yet. Passing `not-a-uuid` to Postgres raises an invalid-input-syntax
     * error that surfaces as INTERNAL_ERROR — telling the client the server
     * broke when the client sent a bad path. It also cannot name a matter, so
     * the honest answer is the same one a real-but-invisible matter gets.
     */
    if (transactionId === undefined || !UUID.test(transactionId)) {
      throw new NotFoundException('Transaction not found.', ERROR_CODES.TRANSACTION_NOT_FOUND);
    }

    // Throws TRANSACTION_NOT_FOUND or MATTER_ACCESS_DENIED. The denial carries
    // the details that let the UI say who to ask (13 §1).
    request[MATTER_CONTEXT] = await this.access.authorize(user, transactionId, required);

    return true;
  }
}
