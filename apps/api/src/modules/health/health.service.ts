import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import type Redis from 'ioredis';
import type { ServiceHealth, ServiceState } from '@counselos/shared';

import { Clock } from '../../common/clock';
import { DRIZZLE, type DrizzleDb } from '../../database/database.module';
import { REDIS } from '../../redis/redis.module';

/**
 * Service honesty (05 §8L).
 *
 * **Never fake a working integration.** An attorney who cannot tell whether the
 * AI is broken or merely slow stops trusting the whole system — so a dependency
 * that is down says so, and one that was never configured says *that*, which is
 * a different thing.
 *
 * `not_configured` is first-class and is the state this codebase gets wrong
 * most easily: a missing API key is not an error and it is not "working". The
 * UI renders a disabled control with a plain explanation, never a spinner that
 * cannot resolve. `blankAsUnset()` in env.validation.ts is what makes a blank
 * line in .env mean *off* rather than *broken*.
 *
 * Probes are cached for 30s. Checking a paid external API on every poll would
 * cost money to answer a question whose answer barely changes.
 */
const PROBE_TTL_MS = 30_000;

/** Slower than this and we call it degraded rather than ok. */
const DEGRADED_ABOVE_MS = 1_000;

interface CachedProbe {
  result: ServiceHealth;
  expiresAt: number;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly cache = new Map<string, CachedProbe>();

  constructor(
    private readonly config: ConfigService,
    private readonly clock: Clock,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async checkAll(now: number = this.clock.timestamp()): Promise<Record<string, ServiceHealth>> {
    const entries = await Promise.all([
      this.probe('database', now, () => this.checkDatabase()),
      this.probe('redis', now, () => this.checkRedis()),
      // Not yet reachable from here — the modules that own these clients arrive
      // later. Reporting the key's presence is honest and already useful: it is
      // the difference between "off" and "broken", which is the whole point.
      this.probe('anthropic', now, () => this.checkConfigured('anthropic', 'ANTHROPIC_API_KEY')),
      this.probe('voyage', now, () => this.checkConfigured('voyage', 'VOYAGE_API_KEY')),
      this.probe('resend', now, () => this.checkConfigured('resend', 'RESEND_API_KEY')),
      this.probe('storage', now, () => this.checkConfigured('storage', 'SUPABASE_SERVICE_KEY')),
    ]);

    return Object.fromEntries(entries.map((entry) => [entry.name, entry]));
  }

  /** Cached probe. A slow or failing dependency is checked at most every 30s. */
  private async probe(
    name: string,
    now: number,
    check: () => Promise<ServiceHealth>,
  ): Promise<ServiceHealth> {
    const cached = this.cache.get(name);
    if (cached && cached.expiresAt > now) return cached.result;

    const result = await check();
    this.cache.set(name, { result, expiresAt: now + PROBE_TTL_MS });
    return result;
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    return this.timed('database', async () => {
      await this.db.execute(sql`SELECT 1`);
    });
  }

  private async checkRedis(): Promise<ServiceHealth> {
    return this.timed('redis', async () => {
      await this.redis.ping();
    });
  }

  /**
   * A dependency we cannot reach yet. Absent key → not_configured; present key
   * → ok. It never reports `down` on a guess: claiming a service is broken
   * when we have not actually asked it would be its own kind of dishonesty.
   */
  private checkConfigured(name: string, key: string): Promise<ServiceHealth> {
    const configured = Boolean(this.config.get<string>(key));
    return Promise.resolve({
      name,
      status: configured ? 'ok' : 'not_configured',
      message: configured ? undefined : `${key} is not set — the feature is turned off.`,
      checkedAt: this.clock.now().toISOString(),
    });
  }

  private async timed(name: string, run: () => Promise<unknown>): Promise<ServiceHealth> {
    const started = Date.now();
    try {
      await run();
      const latencyMs = Date.now() - started;
      const status: ServiceState = latencyMs > DEGRADED_ABOVE_MS ? 'degraded' : 'ok';
      return {
        name,
        status,
        message: status === 'degraded' ? `Responding slowly (${latencyMs}ms).` : undefined,
        checkedAt: this.clock.now().toISOString(),
      };
    } catch (error) {
      // The reason goes to our logs, never to the client — a connection string
      // or a driver error is exactly the internal detail the envelope refuses
      // to leak.
      this.logger.error(`Health probe failed: ${name}`, error instanceof Error ? error.stack : '');
      return {
        name,
        status: 'down',
        message: 'Not responding.',
        checkedAt: this.clock.now().toISOString(),
      };
    }
  }
}
