import { TERMINAL_TRANSACTION_STATUSES, TRANSACTION_STATUSES } from '@counselos/shared';

import {
  PIPELINE_ORDER,
  VALID_TRANSITIONS,
  allowedTransitionsFrom,
  isTerminal,
  isValidTransition,
} from '../constants/status-transitions';

/**
 * The transition map, tested as the state machine it is.
 *
 * Unit tier: no I/O, nothing mocked, because there is nothing to mock. The map
 * is the rule the whole status surface renders, so it is worth asserting
 * directly rather than only through the four or five paths an E2E happens to
 * walk.
 */
describe('status transitions', () => {
  it('covers every status — a missing key would be an undefined lookup at runtime', () => {
    for (const status of TRANSACTION_STATUSES) {
      expect(VALID_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true);
    }
    expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual([...TRANSACTION_STATUSES].sort());
  });

  it('never names a target that is not a real status', () => {
    for (const targets of Object.values(VALID_TRANSITIONS)) {
      for (const target of targets) {
        expect(TRANSACTION_STATUSES).toContain(target);
      }
    }
  });

  it('walks the documented happy path INTAKE → CLOSED one rung at a time', () => {
    const ladder = [
      'INTAKE',
      'UNDER_CONTRACT',
      'DUE_DILIGENCE',
      'TITLE_REVIEW',
      'CLOSING_PREP',
      'CLOSED',
    ] as const;

    ladder.slice(0, -1).forEach((from, i) => {
      const to = ladder[i + 1] as (typeof ladder)[number];
      expect(isValidTransition(from, to)).toBe(true);
    });
  });

  it('refuses to skip a rung — the whole reason the map exists', () => {
    expect(isValidTransition('INTAKE', 'CLOSED')).toBe(false);
    expect(isValidTransition('INTAKE', 'DUE_DILIGENCE')).toBe(false);
    expect(isValidTransition('UNDER_CONTRACT', 'CLOSING_PREP')).toBe(false);
    expect(isValidTransition('DUE_DILIGENCE', 'CLOSED')).toBe(false);
  });

  it('allows the two backward edges a real deal actually takes, and no others', () => {
    // An amendment reopens due diligence; a title defect sends closing prep back.
    expect(isValidTransition('TITLE_REVIEW', 'DUE_DILIGENCE')).toBe(true);
    expect(isValidTransition('DUE_DILIGENCE', 'UNDER_CONTRACT')).toBe(true);

    expect(isValidTransition('CLOSING_PREP', 'TITLE_REVIEW')).toBe(false);
    expect(isValidTransition('UNDER_CONTRACT', 'INTAKE')).toBe(false);
  });

  it('lets any live status fall through, from anywhere', () => {
    for (const status of TRANSACTION_STATUSES) {
      if (isTerminal(status)) continue;
      expect(isValidTransition(status, 'FALLEN_THROUGH')).toBe(true);
    }
  });

  it('gives terminal states NO exits — a reopened deal is a new matter', () => {
    for (const terminal of TERMINAL_TRANSACTION_STATUSES) {
      expect(allowedTransitionsFrom(terminal)).toEqual([]);
      for (const target of TRANSACTION_STATUSES) {
        expect(isValidTransition(terminal, target)).toBe(false);
      }
    }
  });

  it('agrees with the shared TERMINAL_TRANSACTION_STATUSES list, in both directions', () => {
    for (const status of TRANSACTION_STATUSES) {
      const noExits = VALID_TRANSITIONS[status].length === 0;
      // If these ever disagree, one of them is a lie and the five-column write
      // fires on the wrong transition.
      expect(isTerminal(status)).toBe(noExits);
    }
  });

  it('CLOSED is reachable only from CLOSING_PREP', () => {
    const sources = TRANSACTION_STATUSES.filter((from) => isValidTransition(from, 'CLOSED'));
    expect(sources).toEqual(['CLOSING_PREP']);
  });

  it('the pipeline board renders every status, exactly once', () => {
    expect([...PIPELINE_ORDER].sort()).toEqual([...TRANSACTION_STATUSES].sort());
    expect(new Set(PIPELINE_ORDER).size).toBe(PIPELINE_ORDER.length);
  });
});
