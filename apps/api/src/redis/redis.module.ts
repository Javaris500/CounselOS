import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { type RedisOptions } from 'ioredis';

/**
 * Redis, provided as injection tokens — the same pattern as DRIZZLE (18 §5).
 *
 * One of only three modules allowed to be @Global() (18 §1): cache, rate
 * limits, SSE pub/sub, and the BullMQ connection are needed everywhere and
 * carry no domain.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THREE CONNECTIONS AND NOT ONE (05 §1C)
 *
 * REDIS            general commands — cache, rate limits, idempotency keys.
 *
 * REDIS_SUBSCRIBER pub/sub only. **A connection in subscriber mode cannot issue
 *                  any other command.** Reusing the cache connection to
 *                  subscribe would break every GET/SET in the process the
 *                  moment SseService starts listening. Separate by necessity,
 *                  not by preference.
 *
 * BullMQ           brings its own with `maxRetriesPerRequest: null`. ioredis
 *                  defaults to 20, and BullMQ's blocking commands exceed it,
 *                  producing intermittent job failures that read as network
 *                  flakiness. That connection arrives with Module 4; the
 *                  factory below is exported so it is created the same way.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Anything stateful in this system is Redis-backed, never in-memory: two
 * processes run from one codebase, so an in-memory rate limit counts half the
 * requests and an in-memory SSE fan-out delivers nothing (CLAUDE.md §4).
 */
export const REDIS = Symbol('REDIS');
export const REDIS_SUBSCRIBER = Symbol('REDIS_SUBSCRIBER');

/** The typed client. Import this; never re-derive it. */
export type RedisClient = Redis;

/**
 * Shared connection options. Exported so the BullMQ connection is built from
 * the same base rather than a hand-rolled second opinion.
 */
export const REDIS_BASE_OPTIONS: RedisOptions = {
  // Fail loudly on a bad URL at boot instead of retrying forever in the dark.
  connectTimeout: 10_000,

  /**
   * enableOfflineQueue stays at its default (true), deliberately.
   *
   * ioredis connects asynchronously, so with the offline queue disabled every
   * command issued during the connect window — including the first request
   * after boot, and anything during a reconnect — throws "Stream isn't
   * writeable" rather than waiting the few milliseconds for the socket. That
   * turns a normal startup into intermittent 500s.
   *
   * The failure it would have guarded against, commands queueing forever
   * against a dead server, is already bounded by maxRetriesPerRequest
   * (ioredis default 20). BullMQ is the one connection that must set that to
   * null, and it gets its own client for exactly that reason.
   */
};

function createClient(url: string, overrides: RedisOptions = {}): Redis {
  return new Redis(url, { ...REDIS_BASE_OPTIONS, ...overrides });
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis =>
        createClient(config.getOrThrow<string>('REDIS_URL')),
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis =>
        createClient(config.getOrThrow<string>('REDIS_URL')),
    },
  ],
  exports: [REDIS, REDIS_SUBSCRIBER],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  constructor(
    @Inject(REDIS) private readonly client: Redis,
    @Inject(REDIS_SUBSCRIBER) private readonly subscriber: Redis,
  ) {}

  /**
   * Close both on SIGTERM. Only fires because both entrypoints call
   * enableShutdownHooks() — without it this method never runs (18 §6).
   */
  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Closing Redis connections');
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }
}
