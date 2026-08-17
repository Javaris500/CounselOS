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

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL');
        return postgres(url, {
          // Supabase pools through pgbouncer in transaction mode, which does
          // not support prepared statements. Leaving this on produces
          // intermittent "prepared statement already exists" errors under
          // concurrency — the kind that pass locally and fail in production.
          prepare: false,
          max: 10,
          idle_timeout: 20,
          connect_timeout: 10,
        });
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
