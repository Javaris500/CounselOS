import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';

import { REDIS, REDIS_SUBSCRIBER, RedisModule, type RedisClient } from './redis.module';

/**
 * 1C asks for a *proven* Redis connection, not a configured one. This runs
 * against the real container (integration tier) and asserts the two properties
 * the rest of the system depends on:
 *
 *   1. commands actually round-trip
 *   2. the subscriber is a genuinely separate connection
 *
 * (2) is the one that bites. A connection in subscriber mode cannot issue any
 * other command, so if SseService ever subscribed on the cache client, every
 * GET and SET in the process would start failing the moment the first SSE
 * listener attached — at runtime, in production, under load.
 */
describe('RedisModule', () => {
  let redis: RedisClient;
  let subscriber: RedisClient;
  let close: () => Promise<void>;

  beforeAll(async () => {
    // ConfigModule, not a stubbed ConfigService: RedisModule resolves
    // ConfigService from the global config module, so overriding a provider the
    // test graph never had cannot work. Reading process.env is also the real
    // path — globalSetup put REDIS_URL there from the container.
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), RedisModule],
    }).compile();

    redis = moduleRef.get<Redis>(REDIS);
    subscriber = moduleRef.get<Redis>(REDIS_SUBSCRIBER);
    close = async () => {
      await Promise.allSettled([redis.quit(), subscriber.quit()]);
    };
  });

  afterAll(async () => {
    await close?.();
  });

  it('round-trips a value', async () => {
    await redis.set('test:roundtrip', 'ok', 'EX', 10);
    expect(await redis.get('test:roundtrip')).toBe('ok');
    await redis.del('test:roundtrip');
    expect(await redis.get('test:roundtrip')).toBeNull();
  });

  it('honours TTLs — the mechanism every cache in the system relies on', async () => {
    // Auth hydration caches the user for 5 minutes; a TTL that silently did
    // nothing would mean a deactivated attorney keeps access indefinitely.
    await redis.set('test:ttl', 'value', 'EX', 300);
    const ttl = await redis.ttl('test:ttl');
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);
    await redis.del('test:ttl');
  });

  it('gives the subscriber its own connection', async () => {
    expect(subscriber).not.toBe(redis);
    // Distinct client ids prove two sockets, not one object reused.
    const [cacheId, subId] = await Promise.all([redis.client('ID'), subscriber.client('ID')]);
    expect(cacheId).not.toBe(subId);
  });

  it('keeps the cache usable while the subscriber is subscribed', async () => {
    // The actual failure mode, reproduced: subscribe on one connection, then
    // confirm the other still answers. If these ever share a client, this test
    // fails with "only (P|S)SUBSCRIBE ... allowed in this context".
    await subscriber.subscribe('test:channel');
    try {
      await redis.set('test:during-sub', 'still-works', 'EX', 10);
      expect(await redis.get('test:during-sub')).toBe('still-works');
    } finally {
      await subscriber.unsubscribe('test:channel');
      await redis.del('test:during-sub');
    }
  });

  it('delivers a published message to the subscriber', async () => {
    // The Phase 1 SSE fan-out crosses the process boundary this way: the worker
    // publishes, the HTTP process holds the EventSource connections.
    const received = new Promise<string>((resolve) => {
      subscriber.once('message', (_channel: string, message: string) => resolve(message));
    });
    await subscriber.subscribe('test:fanout');
    await redis.publish('test:fanout', 'document.ready');

    expect(await received).toBe('document.ready');
    await subscriber.unsubscribe('test:fanout');
  });
});
