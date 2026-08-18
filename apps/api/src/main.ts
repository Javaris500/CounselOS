// Sentry first. Before @nestjs/core, before anything — it patches modules as
// they load, so anything imported above it is invisible and bootstrap errors
// are lost (02-repo-structure.md).
import './instrument';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Typed as the Express app so `trust proxy` is reachable — see below.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Drains in-flight requests on SIGTERM instead of dropping them mid-response.
  // Also what lets DatabaseModule close its pool cleanly (18 §6).
  app.enableShutdownHooks();

  /**
   * Behind a load balancer, req.ip is the PROXY's address unless Express is
   * told to read X-Forwarded-For. Two things break without this, both quietly:
   *
   *   - Per-IP login throttling collapses into one shared bucket, so ten failed
   *     attempts by anyone lock out the entire firm. A self-inflicted DoS.
   *   - access_log.ip_address (8M-1) records the proxy for every row, which
   *     makes the read-access audit trail worthless in the one situation it
   *     exists for.
   *
   * `1`, not `true`: trust exactly one hop, the platform's own proxy. Trusting
   * the whole chain would let a client spoof its own address by setting the
   * header — turning the fix into the vulnerability. Development runs with no
   * proxy at all, where reading the header would be exactly that mistake.
   */
  if (config.getOrThrow<string>('NODE_ENV') === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(helmet());

  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  });

  /**
   * The /v1 prefix comes from setGlobalPrefix alone — NOT from
   * enableVersioning(). URI versioning adds its own `v1` segment, so using both
   * silently produces /v1/v1/health: Nest logs the route as "/v1/health
   * (version: 1)", which looks correct, while every request 404s.
   *
   * Phase 1 has one API version. If a second is ever needed, switch to
   * enableVersioning and drop the prefix — never run both.
   *
   * One health path, /v1/health, matching Module 1's E2E gate (01 Part 3) and
   * the smoke test in 00 §3. Railway's healthcheck path is configurable and
   * points here rather than at a separate unversioned route.
   */
  app.setGlobalPrefix('v1');

  // NOTE: no app.useGlobalPipes/Filters/Guards here, deliberately. Globals
  // register as APP_* providers in AppModule so they can inject (18 §3).

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  logger.log(`HTTP server listening on ${port}`);
}

void bootstrap();
