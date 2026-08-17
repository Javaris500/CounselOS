import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';

import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { CorrelationIdInterceptor } from './common/interceptors/correlation-id.interceptor';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { CoreModule } from './core.module';
import { HealthModule } from './modules/health/health.module';

/**
 * The HTTP process root (main.ts).
 *
 * Feature modules are added here as they are built, in the order given by
 * 01-codebase.md Part 3 — each one only after the modules it depends on are
 * E2E-green.
 *
 * Globals (APP_GUARD / APP_PIPE / APP_FILTER / APP_INTERCEPTOR) register here
 * as providers, never via app.useGlobalX() in main.ts, or they cannot inject
 * dependencies (18 §3). The rest arrive with Module 1 alongside the error
 * envelope.
 */
@Module({
  imports: [
    /**
     * FIRST, and paired with instrument.ts — neither works without the other.
     * Sentry.init() starts the SDK; this is what hands Nest's request
     * lifecycle to it. With init alone, a controller exception is logged by
     * Nest and never reported, which is the "errors vanish" state instrument.ts
     * refuses to boot into — except that check only tests the DSN, not whether
     * anything is listening.
     */
    SentryModule.forRoot(),
    CoreModule,
    HealthModule,
  ],
  /**
   * ORDER IS EXECUTION ORDER (18 §3). Interceptors run top-down on the way in.
   *
   *   1. CorrelationId  — must be first; everything below reads the ID from CLS
   *   2. RequestLogging — needs the ID, wraps the handler to time it
   *   3. Response       — outermost on the way out, so it wraps the final value
   *
   * Guards (JwtAuthGuard → RolesGuard → MatterAccessGuard) slot in between
   * interceptors and the pipe when Module 2 and 8G land. That order is
   * load-bearing: a matter-access guard that runs before authentication has no
   * user to check.
   */
  providers: [
    { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    {
      /**
       * Owns every error response body. It EXTENDS SentryGlobalFilter rather
       * than sitting alongside it: two independent APP_FILTERs would mean the
       * last one wins and unhandled exceptions silently stop reaching Sentry —
       * the "errors vanish" state instrument.ts exists to prevent.
       */
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
