import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb } from '../../database/database.module';
import { transactionActivities } from '../../database/schema';

export type ActivityRow = typeof transactionActivities.$inferSelect;
export type NewActivityRow = typeof transactionActivities.$inferInsert;

/**
 * The append-only log (05 §3D).
 *
 * No update method and no delete method, and that is the design: facts about a
 * matter are not editable. `transaction_activities` has no `updated_at` and no
 * `deleted_at` for the same reason, so there is no soft-delete filter to apply
 * here — the table has nothing to hide.
 */
@Injectable()
export class ActivityRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async insert(row: NewActivityRow): Promise<void> {
    await this.db.insert(transactionActivities).values(row);
  }

  /** Newest first — the feed is read from the top (05 §3E). */
  async list(
    transactionId: string,
    page: number,
    limit: number,
  ): Promise<{ rows: ActivityRow[]; total: number }> {
    const where = eq(transactionActivities.transactionId, transactionId);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(transactionActivities)
        .where(where)
        .orderBy(desc(transactionActivities.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(transactionActivities).where(where),
    ]);

    return { rows, total: totals?.value ?? 0 };
  }
}
