import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { ApiSuccess, PaginationMeta } from '@counselos/shared';

/**
 * Opts a route out of the success envelope.
 *
 * Almost nothing should use this. It exists because two consumers parse a raw
 * body and are not ours to change: Railway's healthcheck, and any SSE stream
 * (an `event:`/`data:` frame is not JSON and must not be wrapped).
 */
export const NO_ENVELOPE = 'noEnvelope';
export const NoEnvelope = (): MethodDecorator & ClassDecorator => SetMetadata(NO_ENVELOPE, true);

/** A handler may return this to attach pagination without building the envelope itself. */
export interface Paginated<T> {
  data: T;
  meta: PaginationMeta;
}

function isPaginated<T>(value: unknown): value is Paginated<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value &&
    typeof (value as Paginated<T>).meta?.total === 'number'
  );
}

/**
 * Wraps every successful response in `{ success: true, data }` (04-data-contracts).
 *
 * One file produces every success shape and GlobalExceptionFilter produces
 * every error shape, so envelope consistency comes from two places rather than
 * from discipline in several hundred controllers. A controller returns its
 * resource; it never builds an envelope by hand.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const exempt = this.reflector.getAllAndOverride<boolean>(NO_ENVELOPE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (exempt || context.getType() !== 'http') return next.handle();

    return next.handle().pipe(
      map((payload: unknown): ApiSuccess<unknown> => {
        if (isPaginated(payload)) {
          return { success: true, data: payload.data, meta: payload.meta };
        }
        return { success: true, data: payload ?? null };
      }),
    );
  }
}
