import { Injectable } from '@nestjs/common';

/**
 * The time seam.
 *
 * `new Date()` with no argument is banned in `apps/api/src` by ESLint, and the
 * rule is not stylistic. Deadline urgency tiers and the TREC business-day
 * engine are pure functions of "now" — a test that cannot pin the clock has to
 * either assert loosely (and stop catching the boundary bugs that matter) or
 * drift into failing on a Sunday. The earnest-money vs option-fee weekend
 * divergence is exactly a boundary bug.
 *
 * Inject `Clock` and call `.now()`. In a test, provide a fixed one:
 *
 *     { provide: Clock, useValue: new FixedClock(SEED_ANCHOR) }
 *
 * PROVIDE IT IN THE MODULE THAT NEEDS IT — `providers: [Clock]` — not in
 * CoreModule. The global allowlist is exactly three (18 §1) and a clock is not
 * one of them, so exporting it from CoreModule would only be visible to modules
 * that imported CoreModule, which no feature module should have to. It holds no
 * state, so separate instances are indistinguishable, and a test overrides it
 * per module where it matters.
 *
 * `Date.now()` is passed explicitly so this file itself satisfies the rule
 * rather than being an exception to it.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date(Date.now());
  }

  /** Epoch milliseconds. Cheaper than allocating a Date to compare instants. */
  timestamp(): number {
    return Date.now();
  }
}

/** A clock stopped at a chosen instant. Test use only. */
export class FixedClock extends Clock {
  constructor(private readonly fixed: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.fixed.getTime());
  }

  override timestamp(): number {
    return this.fixed.getTime();
  }
}
