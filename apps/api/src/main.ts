// Sentry first. Before @nestjs/core, before anything — it patches modules as
// they load, so anything imported above it is invisible and bootstrap errors
// are lost (02-repo-structure.md).
import './instrument';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Drains in-flight requests on SIGTERM instead of dropping them mid-response.
  // Also what lets DatabaseModule close its pool cleanly (18 §6).
  app.enableShutdownHooks();

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
