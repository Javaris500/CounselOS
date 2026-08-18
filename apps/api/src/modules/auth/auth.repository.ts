import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, or } from 'drizzle-orm';

import { Clock } from '../../common/clock';
import { DRIZZLE, type DrizzleDb } from '../../database/database.module';
import { users } from '../../database/schema';

/** Inferred from the schema — never hand-written (CLAUDE.md, Data & Types). */
export type UserRow = typeof users.$inferSelect;

/** Only rewrite last_seen_at when it is this stale. See touchLastSeen. */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Drizzle only. No business rules — the decision about whether a miss becomes a
 * link or a 401 belongs to AuthService (CLAUDE.md, Architecture Rule 1).
 */
@Injectable()
export class AuthRepository {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly clock: Clock,
  ) {}

  async findByAuthId(authId: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.authId, authId)).limit(1);
    return row;
  }

  /** Email match, for the first-login link. The caller decides what to do with it. */
  async findByEmail(email: string): Promise<UserRow | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row;
  }

  /**
   * Links only where auth_id IS STILL NULL. The predicate is the guard, not the
   * caller's check: two concurrent first logins would otherwise both read null
   * and the second would overwrite the first. Returns the row it linked, or
   * undefined if another request won.
   */
  async linkAuthId(userId: string, authId: string): Promise<UserRow | undefined> {
    const [row] = await this.db
      .update(users)
      .set({ authId })
      .where(and(eq(users.id, userId), isNull(users.authId)))
      .returning();
    return row;
  }

  /**
   * 05 §L2 says update last_seen_at on every authenticated request. That is a
   * database write per request for a field read once a night by the time-capture
   * job. Writing only when the stored value is already stale keeps the same
   * signal for roughly 1% of the writes.
   */
  async touchLastSeen(userId: string): Promise<void> {
    const cutoff = new Date(this.clock.timestamp() - LAST_SEEN_THROTTLE_MS);
    await this.db
      .update(users)
      .set({ lastSeenAt: this.clock.now() })
      .where(and(eq(users.id, userId), or(isNull(users.lastSeenAt), lt(users.lastSeenAt, cutoff))));
  }
}
