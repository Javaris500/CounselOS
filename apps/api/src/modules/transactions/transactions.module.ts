import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { Clock } from '../../common/clock';
import { MatterAccessGuard } from '../../common/guards/matter-access.guard';
import { ActivityLogService } from './activity-log.service';
import { ActivityRepository } from './activity.repository';
import { MatterAccessRepository } from './matter-access.repository';
import { MatterAccessService } from './matter-access.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';

/**
 * Module 3 — the spine — and Layer 8G, which cannot exist without it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO REPOSITORY IN `exports`. Ever.
 *
 * A repository in an exports array crashes the bootstrap by design
 * (Architecture Rule 2), and ESLint fails the build on a cross-module
 * repository import. Five slices mount into this module; they reach its data
 * through `TransactionsService`, `ActivityLogService`, and
 * `MatterAccessService`, which is what makes those five extractable in Phase 2.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY `MatterAccessGuard` REGISTERS HERE.
 *
 * It is an APP_GUARD, so it must be a provider rather than an
 * `app.useGlobalGuards()` call, or it cannot inject MatterAccessService
 * (18 §3). Registration order is execution order, and AppModule imports
 * AuthModule — which registers JwtAuthGuard then RolesGuard — before this one.
 * So the sequence is authenticate → role → matter, which is the only order that
 * works: a matter check with no authenticated user has nothing to check.
 *
 * WHAT OTHER MODULES GET.
 *
 *   TransactionsService  — matters, parties, status
 *   ActivityLogService   — every module writes its own activity rows through
 *                          this, never to the table directly (05 §3D)
 *   MatterAccessService  — so a module with its own transaction-scoped routes
 *                          can carry @MatterAccess without re-deriving 8G
 */
@Module({
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionsRepository,
    ActivityLogService,
    ActivityRepository,
    MatterAccessService,
    MatterAccessRepository,
    Clock,
    { provide: APP_GUARD, useClass: MatterAccessGuard },
  ],
  exports: [TransactionsService, ActivityLogService, MatterAccessService],
})
export class TransactionsModule {}
