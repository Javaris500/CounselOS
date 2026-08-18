import { SetMetadata } from '@nestjs/common';

/**
 * The ONLY auth escape hatch (18 §128). Everything is protected by default —
 * a route is reachable unauthenticated because someone said so here, never
 * because they forgot to add a guard.
 *
 * Legitimate uses are few: the platform healthcheck, the public lead intake
 * form, and the auth routes themselves (you cannot present a token to obtain
 * one). Client-portal routes are NOT public — they use ClientTokenGuard.
 */
export const IS_PUBLIC = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
