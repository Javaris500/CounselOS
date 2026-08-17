import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';

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
  providers: [
    {
      /**
       * Reports unhandled exceptions, then delegates to Nest's default
       * BaseExceptionFilter for the response.
       *
       * Module 1 brings the project's own global filter for the error envelope
       * ({ success: false, error: { code, message, details, requestId } }).
       * When it lands it must be registered AFTER this one — registration order
       * is execution order (18 §3) — and it must not swallow the exception
       * before Sentry sees it. Extend SentryGlobalFilter or capture explicitly;
       * do not simply replace it.
       */
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
  ],
})
export class AppModule {}
