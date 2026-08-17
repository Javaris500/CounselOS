import { Module } from '@nestjs/common';

import { Clock } from '../../common/clock';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * Owns no table and has no service — the liveness probe has no business rules
 * to hold. `dashboard/` is the other module shaped like this, for a different
 * reason (it aggregates other modules' services).
 *
 * The service-honesty endpoint (/v1/health/services, 05 §8L) lands here in
 * slice 0 and will need a service, since reporting real dependency state is
 * business logic.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService, Clock],
})
export class HealthModule {}
