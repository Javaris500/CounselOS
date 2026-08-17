// Sentry first, same as main.ts. A worker that fails during bootstrap is
// exactly the failure you most need reported.
import './instrument';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  /**
   * createApplicationContext, NOT create.
   *
   * This gives the full DI container with no HTTP server: no port binding, no
   * controllers instantiated, no routes mapped. `NestFactory.create()` here
   * would start a second web server in a process that should never answer a
   * request (18 §6).
   */
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });

  /**
   * bufferLogs holds every log until something flushes them. In main.ts
   * app.listen() does that implicitly; here nothing does, so without this call
   * the worker starts, logs, and prints absolutely nothing — including
   * anything Nest logged while bootstrapping.
   *
   * A silent worker is the exact failure this file's Sentry comment is about.
   */
  app.flushLogs();

  const logger = new Logger('Worker');

  /**
   * THE MOST CONSEQUENTIAL LINE IN THIS FILE.
   *
   * OnApplicationShutdown never fires without it. Railway sends SIGTERM and
   * kills the process ~10s later; without this hook the worker dies mid-job and
   * strands the document it was processing in PROCESSING forever, leaving the
   * attorney watching a spinner that never resolves (00 §10).
   *
   * It only reproduces under a real SIGTERM — never in local development.
   */
  app.enableShutdownHooks();

  logger.log('Worker started — no HTTP server, queue processors only');
}

void bootstrap();
