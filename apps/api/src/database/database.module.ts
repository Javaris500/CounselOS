import { Global, Module, type OnApplicationShutdown, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * The Drizzle client, provided as an injection token (18 §5).
 *
 * Repositories inject DRIZZLE. Services never see it — a service that imports
 * anything from database/ other than an inferred type is a layering violation,
 * and eslint enforces that (packages/config/eslint/nest.js).
 *
 * Global because every repository needs it and re-importing DatabaseModule
 * twenty times adds nothing. This is one of only three modules allowed to be
 * global (18 §1).
 */
export const DRIZZLE = Symbol('DRIZZLE');
const PG_CLIENT = Symbol('PG_CLIENT');

/** The typed client. Import this type; never re-derive it. */
export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Connection options shared by every postgres.js client in the codebase — the
 * app, the seed script, the reset script, tests. Use this; do not hand-roll a
 * client, because the `types` override below is not optional.
 *
 * WHY THE DATE OVERRIDE EXISTS
 *
 * postgres.js parses a Postgres `date` (OID 1082) into a JS Date at UTC
 * midnight. Verified empirically: '2026-11-26' comes back as
 * `Wed Nov 25 2026 18:00:00 GMT-0600`. Calling .getDate() on that from a
 * Central-time process returns 25, not 26.
 *
 * holidays.date is a `date` precisely to avoid that class of off-by-one in the
 * TREC business-day engine, and the driver was quietly reintroducing it on
 * every read. Drizzle's mode: 'string' already shields queries that go through
 * Drizzle; this shields the ones that do not — db.execute(sql`...`), the seed
 * script, anything hand-written.
 *
 * A date is a date. It reads and writes as 'YYYY-MM-DD' and never becomes an
 * instant. Timestamps are unaffected (OID 1184).
 */
export const PG_CLIENT_OPTIONS = {
  // Supabase pools through pgbouncer in transaction mode, which does not
  // support prepared statements. Leaving this on produces intermittent
  // "prepared statement already exists" errors under concurrency — the kind
  // that pass locally and fail in production.
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  types: {
    date: {
      to: 1082,
      from: [1082],
      serialize: (value: string): string => value,
      parse: (value: string): string => value,
    },
  },
};

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL');
        return postgres(url, PG_CLIENT_OPTIONS);
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_CLIENT],
      useFactory: (client: ReturnType<typeof postgres>) => drizzle(client, { schema }),
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(PG_CLIENT) private readonly client: ReturnType<typeof postgres>) {}

  /**
   * Close the pool on SIGTERM so in-flight queries finish before the process
   * dies. Only fires because both entrypoints call enableShutdownHooks() —
   * without that call this method is never invoked (18 §6).
   */
  async onApplicationShutdown(): Promise<void> {
    this.logger.log('Closing database connections');
    await this.client.end({ timeout: 5 });
  }
}
