import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';

import { CoreModule } from './core.module';

/**
 * The worker process root (worker.ts).
 *
 * Imports CoreModule plus only the feature modules its processors need. It
 * shares no root module with AppModule, and instantiates no controllers — the
 * worker must never handle HTTP (05, Architecture Decision).
 *
 * @Processor() classes are provided HERE and only here. Feature modules call
 * BullModule.registerQueue() so they can *enqueue*; producer and consumer
 * registration are separate, and the two processes must never run the same
 * processor (18 §6).
 *
 * Processors arrive with Module 4 (Documents), which is the first feature that
 * needs async work.
 */
@Module({
  imports: [
    /**
     * Sentry, first, same as AppModule.
     *
     * NOTE the asymmetry: no SentryGlobalFilter here. That is an HTTP exception
     * filter (it extends BaseExceptionFilter), and this process serves no
     * requests — Nest would never invoke it.
     *
     * So a thrown job does NOT report itself the way a thrown request does.
     * Processors must capture explicitly (Sentry.captureException, or the
     * @SentryExceptionCaptured decorator on the handler). This is the process
     * where that matters most: a failed job has no user waiting on a response
     * to notice it, and a document that fails to embed simply sits in
     * PROCESSING while an attorney watches a spinner (00 §10).
     */
    SentryModule.forRoot(),
    CoreModule,
  ],
})
export class WorkerModule {}
