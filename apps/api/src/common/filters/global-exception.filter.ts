import { type ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { ClsService } from 'nestjs-cls';
import { ZodError } from 'zod';
import { ERROR_CODES, type ApiError, type ErrorCode } from '@counselos/shared';
import type { Response } from 'express';

import { AppException } from '../errors/app.exception';

/**
 * The one place an error becomes a response body (04-data-contracts).
 *
 * WHY IT EXTENDS SentryGlobalFilter RATHER THAN REPLACING IT
 *   AppModule registers SentryGlobalFilter so unhandled exceptions reach
 *   Sentry. A second, independent APP_FILTER registered after it would win and
 *   silently stop reporting — errors would vanish, which is the exact state
 *   instrument.ts refuses to boot into. Extending it and delegating for the
 *   unknown case keeps reporting intact while we own the response shape.
 *
 * WHAT A CLIENT NEVER SEES
 *   Stack traces, SQL, internal field names, or the message of an unknown
 *   error. Unknown failures return a fixed string and INTERNAL_ERROR; the real
 *   detail goes to Sentry with the correlation ID, which is how you find it.
 */
@Catch()
export class GlobalExceptionFilter extends SentryGlobalFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly cls: ClsService) {
    super();
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    // Non-HTTP contexts (BullMQ jobs) have no response to write. Hand straight
    // back to Sentry's filter rather than reaching for a res that isn't there.
    if (host.getType() !== 'http') {
      super.catch(exception, host);
      return;
    }

    const response = host.switchToHttp().getResponse<Response>();
    const requestId = this.cls.getId() ?? 'unknown';

    /**
     * The header is set here as well as in CorrelationIdInterceptor, and that
     * is not redundant.
     *
     * Global interceptors only run when a route matched — they wrap a handler,
     * and an unknown path has none. So a 404 (and anything else thrown before
     * routing resolves) would carry the ID in the body but not the header,
     * which is precisely the response a user is most likely to report. The
     * filter is the one place every error passes through.
     */
    if (!response.headersSent) response.setHeader('x-request-id', requestId);

    const { status, body } = this.toEnvelope(exception, requestId);

    // Unknown failures still go to Sentry — with the correlation ID already on
    // the scope, so the report and the log lines join up.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Unhandled exception [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      super.catch(exception, host);
      if (response.headersSent) return;
    }

    response.status(status).json(body);
  }

  private toEnvelope(exception: unknown, requestId: string): { status: number; body: ApiError } {
    // 1. Our own exceptions — already carry a typed code and a safe message.
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: this.envelope(
          exception.code,
          exception.message,
          requestId,
          exception.details ?? null,
        ),
      };
    }

    // 2. A ZodError that escaped the pipe (a service parsing untrusted input).
    //    Field-level details, 422 — the same shape the pipe produces, so the
    //    frontend renders it identically wherever it originated.
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: this.envelope(
          ERROR_CODES.VALIDATION_ERROR,
          'Validation failed',
          requestId,
          exception.flatten().fieldErrors as Record<string, string[]>,
        ),
      };
    }

    // 3. Framework HttpExceptions — 404 on an unknown route, 405, payload too
    //    large. Real outcomes with no typed code of their own, so map status to
    //    the nearest structural code rather than inventing one per case.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: this.envelope(this.codeForStatus(status), exception.message, requestId, null),
      };
    }

    // 4. Anything else. Zero detail out.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: this.envelope(
        ERROR_CODES.INTERNAL_ERROR,
        'An unexpected error occurred.',
        requestId,
        null,
      ),
    };
  }

  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ERROR_CODES.VALIDATION_ERROR;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMIT_EXCEEDED;
      default:
        return ERROR_CODES.INTERNAL_ERROR;
    }
  }

  private envelope(
    code: ErrorCode,
    message: string,
    requestId: string,
    details: Record<string, string[]> | null,
  ): ApiError {
    return { success: false, error: { code, message, details, requestId } };
  }
}
