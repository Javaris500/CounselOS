import { Controller, Get } from '@nestjs/common';

/**
 * Liveness probe. Deliberately trivial: it answers "is this process up and
 * serving?" and nothing else.
 *
 * It must not touch the database, Redis, or any external service — a probe that
 * depends on Postgres will report the API as down during a brief database blip
 * and trigger a restart that fixes nothing. Dependency state is a separate
 * question, answered by /v1/health/services (05 §8L), which reports each
 * external's real status including `not_configured`.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
