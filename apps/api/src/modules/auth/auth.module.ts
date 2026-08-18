import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Clock } from '../../common/clock';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { jwksProvider } from './jwks.provider';
import { supabaseAdminProvider, supabasePublicProvider } from './supabase.provider';
import { TokenVerifier } from './token-verifier';

/**
 * Owns authentication, and the only two Supabase clients in the codebase
 * (CLAUDE.md:101 — the service key is scoped to Auth and Storage).
 *
 * The global guards are registered HERE rather than in AppModule so their
 * dependencies — TokenVerifier, AuthService — resolve from the module that
 * declares them. Order is execution order (18 §3): authenticate, then role.
 * MatterAccessGuard slots in after both when 8G lands with Module 3.
 *
 * AuthService is exported because other modules will need to invalidate a
 * cached user on deactivation. AuthRepository is NOT exported — a repository in
 * an exports array is the one thing that crashes the bootstrap by design
 * (Architecture Rule 2).
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    TokenVerifier,
    Clock,
    jwksProvider,
    supabasePublicProvider,
    supabaseAdminProvider,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule implements NestModule {
  /**
   * cookie-parser is applied HERE rather than in main.ts, and that is not a
   * style preference.
   *
   * main.ts does not run in a test — an E2E builds the app from the module
   * graph, so anything configured at bootstrap is simply absent. Registering it
   * on the module means the app is correctly assembled however it is created,
   * and the refresh flow is testable at all. This is the same reasoning that
   * puts globals in APP_* providers instead of app.useGlobal*() (18 §3).
   *
   * Scoped to auth routes because they are the only ones that read a cookie.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(AuthController);
  }
}
