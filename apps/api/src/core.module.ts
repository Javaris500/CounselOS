import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';
import { randomUUID } from 'node:crypto';

import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { IS_PRODUCTION, validateEnvVars } from './config/env.validation';

/**
 * Infrastructure shared by both processes (18 §6).
 *
 * AppModule (main.ts) and WorkerModule (worker.ts) each import this and nothing
 * else in common. They do NOT share a root module — the worker must not
 * instantiate controllers or bind a port.
 *
 * Everything here is domain-free. A feature module never belongs in CoreModule,
 * and never gets marked @Global().
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvVars,
      // .env is for local development. Deployed environments inject real
      // variables, and a stray .env file must never shadow them.
      envFilePath: ['.env'],
      ignoreEnvFile: IS_PRODUCTION,
      cache: true,
    }),

    /**
     * AsyncLocalStorage for per-request context — the correlation ID, the
     * current user (18 §4).
     *
     * This replaces request-scoped providers, which are banned: Scope.REQUEST
     * rebuilds the entire injection chain per request and does not exist in the
     * worker, where there is no request at all.
     *
     * CAVEAT — the worker gets the CLS *service*, not a CLS *context*.
     * `mount: true` installs CLS as Nest middleware, and middleware only runs
     * in an HTTP pipeline. worker.ts bootstraps with
     * createApplicationContext(), which has none, so nothing here opens a
     * context for a BullMQ job: the first processor to read the correlation ID
     * gets undefined, or throws for being outside a CLS context.
     *
     * Processors must therefore wrap their handler in ClsService.run() (or use
     * the nestjs-cls BullMQ plugin) and seed it from the correlation ID carried
     * on the job payload. That lands with Module 4, the first feature with
     * async work — see worker.module.ts.
     */
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        // Honour an upstream ID when there is one, so a correlation ID survives
        // across service boundaries instead of restarting at our edge.
        idGenerator: (req: { headers: Record<string, string | string[] | undefined> }) => {
          const header = req.headers['x-request-id'];
          return (Array.isArray(header) ? header[0] : header) ?? randomUUID();
        },
      },
    }),

    DatabaseModule,
    RedisModule,
  ],
  exports: [ConfigModule, ClsModule, DatabaseModule, RedisModule],
})
export class CoreModule {}
