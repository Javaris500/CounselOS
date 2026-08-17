import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { catchError, tap, throwError, type Observable } from 'rxjs';
import type { Request, Response } from 'express';

/**
 * One line per request: method, path, status, duration, correlation ID.
 *
 * WHAT IS DELIBERATELY ABSENT
 *   Request bodies, response bodies, query strings, and headers. This system
 *   holds privileged client material — a logged body is a chat message, a
 *   matter note, or a party's name sitting in a log aggregator forever. The
 *   correlation ID is what makes a request findable; the payload is not needed
 *   to find it, and CLAUDE.md's rule is absolute: never log PII or response
 *   bodies.
 *
 * The user ID is safe and useful (it is a UUID, not a name) and is read from
 * CLS once Module 2 puts it there.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const started = Date.now();

    // The route pattern, not the concrete URL: /v1/transactions/:id rather than
    // a path with a real transaction UUID in it.
    const route = (req.route as { path?: string } | undefined)?.path ?? req.path;

    const log = (status: number): void => {
      const line = `${req.method} ${route} ${status} ${Date.now() - started}ms user=${
        this.cls.get<string>('userId') ?? 'anon'
      } req=${this.cls.getId() ?? '-'}`;

      if (status >= 500) this.logger.error(line);
      else if (status >= 400) this.logger.warn(line);
      else this.logger.log(line);
    };

    return next.handle().pipe(
      tap(() => log(http.getResponse<Response>().statusCode)),
      catchError((error: unknown) => {
        const status =
          typeof (error as { getStatus?: () => number })?.getStatus === 'function'
            ? (error as { getStatus: () => number }).getStatus()
            : 500;
        log(status);
        return throwError(() => error);
      }),
    );
  }
}
