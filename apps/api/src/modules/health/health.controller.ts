import { Controller, Get } from '@nestjs/common';

import type { ServiceHealth } from '@counselos/shared';

import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { NoEnvelope } from '../../common/interceptors/response.interceptor';
import { HealthService } from './health.service';

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
  constructor(private readonly health: HealthService) {}

  /**
   * @NoEnvelope() is deliberate and one of very few uses.
   *
   * Railway's healthcheck parses this body, and 00 §3 documents the literal
   * `curl http://localhost:3001/v1/health` → `{"status":"ok"}`. Wrapping it as
   * `{ success: true, data: { status: 'ok' } }` would break the probe and the
   * documented smoke test at the same time.
   */
  @Public()
  @Get()
  @NoEnvelope()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Per-dependency status (05 §8L). Unlike the liveness probe above, this DOES
   * touch dependencies — that is its entire job — and it returns the standard
   * success envelope because the frontend consumes it like any other resource.
   *
   * OWNER and ATTORNEY only, per 05 §8L — dependency state is operational
   * detail, not something a paralegal needs. It exposes only service names and
   * states regardless: no keys, no URLs, no error detail.
   */
  @Roles('OWNER', 'ATTORNEY')
  @Get('services')
  async services(): Promise<Record<string, ServiceHealth>> {
    return this.health.checkAll();
  }
}
