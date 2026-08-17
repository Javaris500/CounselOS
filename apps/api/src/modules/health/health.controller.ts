import { Controller, Get } from '@nestjs/common';

import type { ServiceHealth } from '@counselos/shared';

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
   * ROLE GATING IS NOT YET APPLIED. 8L restricts this to OWNER and ATTORNEY;
   * that guard arrives with Module 2, which needs the Supabase project. Until
   * then the route is open, and it deliberately exposes only service names and
   * states — no keys, no URLs, no error detail.
   */
  @Get('services')
  async services(): Promise<Record<string, ServiceHealth>> {
    return this.health.checkAll();
  }
}
