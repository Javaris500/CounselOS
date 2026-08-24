import type { AuthUser, UserRole } from '@counselos/shared';

import { FixedClock } from '../../../common/clock';
import { MatterAccessService } from '../matter-access.service';
import type { MatterAccessContext, MatterAccessRepository } from '../matter-access.repository';
import type { ActivityLogService } from '../activity-log.service';

/**
 * LAYER 8G, RUNG BY RUNG.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS WHEN THE E2E ALREADY COVERS 8G.
 *
 * The E2E walks the paths a request happens to take. This walks the LADDER —
 * every role against every assignment shape, including the combinations no
 * endpoint currently produces. The dangerous version of this bug is not a
 * broken path; it is a rung that quietly grants more than it should for a
 * combination nobody wrote a request for yet.
 *
 * `resolve()` is pure, which is the entire reason it lives on the service
 * rather than inside the guard: no HTTP, no database, no container.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('MatterAccessService.resolve — 8G', () => {
  const NOW = new Date('2026-06-15T09:00:00.000-05:00');

  const ATTORNEY_ID = 'a0000000-0000-4000-8000-000000000001';
  const PARALEGAL_ID = 'a0000000-0000-4000-8000-000000000002';
  const OTHER_ID = 'a0000000-0000-4000-8000-000000000003';

  // Nothing is called on these: resolve() touches neither.
  const service = new MatterAccessService(
    {} as unknown as MatterAccessRepository,
    {} as unknown as ActivityLogService,
    new FixedClock(NOW),
  );

  const user = (role: UserRole, id = OTHER_ID): AuthUser => ({
    id,
    role,
    firmId: 'f0000000-0000-4000-8000-000000000001',
    fullName: 'Test User',
    email: 'test@rodriguezlaw.test',
  });

  const matter = (overrides: Partial<MatterAccessContext> = {}): MatterAccessContext => ({
    transactionId: 't0000000-0000-4000-8000-000000000001',
    firmId: 'f0000000-0000-4000-8000-000000000001',
    assignedAttorneyId: ATTORNEY_ID,
    assignedParalegalId: PARALEGAL_ID,
    assignedAttorneyName: 'James Okafor',
    grant: null,
    ...overrides,
  });

  describe('rung 1 — OWNER', () => {
    it('gets FULL on a matter they are not assigned to', () => {
      expect(service.resolve(user('OWNER'), matter())).toEqual({ granted: true, level: 'FULL' });
    });

    it('gets FULL even when their own grant has expired', () => {
      const expired = matter({ grant: { expiresAt: new Date('2026-06-01T00:00:00Z') } });
      // Rung 1 is checked FIRST, deliberately — an owner is never denied their
      // own firm's matter by a stale coverage grant.
      expect(service.resolve(user('OWNER'), expired)).toEqual({ granted: true, level: 'FULL' });
    });
  });

  describe('rungs 2 and 3 — the assignment columns', () => {
    it('the assigned attorney gets FULL', () => {
      expect(service.resolve(user('ATTORNEY', ATTORNEY_ID), matter())).toEqual({
        granted: true,
        level: 'FULL',
      });
    });

    it('the assigned paralegal gets FULL', () => {
      expect(service.resolve(user('PARALEGAL', PARALEGAL_ID), matter())).toEqual({
        granted: true,
        level: 'FULL',
      });
    });

    it('assignment wins over role — a PARALEGAL assigned as attorney still gets FULL', () => {
      // Contrived, and that is the point: the rule is the column, not the title.
      const odd = matter({ assignedAttorneyId: PARALEGAL_ID, assignedParalegalId: null });
      expect(service.resolve(user('PARALEGAL', PARALEGAL_ID), odd)).toEqual({
        granted: true,
        level: 'FULL',
      });
    });
  });

  describe('rung 4 — an explicit grant', () => {
    it('an open-ended grant is FULL', () => {
      const granted = matter({ assignedParalegalId: null, grant: { expiresAt: null } });
      expect(service.resolve(user('PARALEGAL'), granted)).toEqual({
        granted: true,
        level: 'FULL',
      });
    });

    it('a grant expiring in the future is FULL', () => {
      const granted = matter({
        assignedParalegalId: null,
        grant: { expiresAt: new Date(NOW.getTime() + 86_400_000) },
      });
      expect(service.resolve(user('PARALEGAL'), granted)).toEqual({
        granted: true,
        level: 'FULL',
      });
    });

    it('an EXPIRED grant denies with ACCESS_EXPIRED, not NOT_ASSIGNED', () => {
      const lapsed = matter({
        assignedParalegalId: null,
        grant: { expiresAt: new Date(NOW.getTime() - 1) },
      });
      // A different answer from never having had access: the UI can offer
      // "ask for it again" rather than "you were never on this matter".
      expect(service.resolve(user('PARALEGAL'), lapsed)).toEqual({
        granted: false,
        reason: 'ACCESS_EXPIRED',
      });
    });

    it('a grant expiring exactly now is expired — the boundary closes access', () => {
      const boundary = matter({ assignedParalegalId: null, grant: { expiresAt: NOW } });
      expect(service.resolve(user('PARALEGAL'), boundary)).toEqual({
        granted: false,
        reason: 'ACCESS_EXPIRED',
      });
    });

    it('an expired grant does NOT strand an attorney below their read-only cover', () => {
      const lapsed = matter({ grant: { expiresAt: new Date(NOW.getTime() - 1) } });
      // Rung 4 is "a row exists AND IS NOT EXPIRED", so a lapsed row does not
      // match it and evaluation continues. The attorney keeps the baseline
      // cover every attorney at the firm has; losing an EXTRA permission must
      // never cost a baseline one. Caught by the exhaustive grid below, which
      // is why it is written out rather than assumed.
      expect(service.resolve(user('ATTORNEY'), lapsed)).toEqual({
        granted: true,
        level: 'READ_ONLY',
      });
    });
  });

  describe('rung 5 — attorney read-only cover', () => {
    it('an UNASSIGNED attorney gets READ_ONLY, never FULL', () => {
      const decision = service.resolve(user('ATTORNEY'), matter());
      expect(decision).toEqual({ granted: true, level: 'READ_ONLY' });
    });
  });

  describe('rung 6 — denial', () => {
    it('an UNASSIGNED paralegal gets NOTHING — there is no read-only fallback', () => {
      // THE rule this whole layer exists for. If this ever returns a level, an
      // unassigned paralegal can browse the other forty matters in the firm.
      const decision = service.resolve(user('PARALEGAL'), matter({ assignedParalegalId: null }));
      expect(decision).toEqual({ granted: false, reason: 'NOT_ASSIGNED' });
      expect(decision).not.toHaveProperty('level');
    });

    it('a CLIENT gets ROLE_INSUFFICIENT — a different failure from being unassigned', () => {
      expect(service.resolve(user('CLIENT'), matter({ assignedParalegalId: null }))).toEqual({
        granted: false,
        reason: 'ROLE_INSUFFICIENT',
      });
    });
  });

  describe('the exhaustive grid — no combination grants more than its rung', () => {
    const roles: UserRole[] = ['OWNER', 'ATTORNEY', 'PARALEGAL', 'CLIENT'];

    it.each(roles)('%s on a matter with no assignment to them and no grant', (role) => {
      const stranger = matter({ assignedAttorneyId: ATTORNEY_ID, assignedParalegalId: null });
      const decision = service.resolve(user(role), stranger);

      if (role === 'OWNER') expect(decision).toEqual({ granted: true, level: 'FULL' });
      else if (role === 'ATTORNEY') expect(decision).toEqual({ granted: true, level: 'READ_ONLY' });
      else expect(decision.granted).toBe(false);
    });

    it('only OWNER and the two assignment columns ever yield FULL without a grant', () => {
      const stranger = matter({ assignedAttorneyId: ATTORNEY_ID, assignedParalegalId: null });
      const fullRoles = roles.filter((role) => {
        const decision = service.resolve(user(role), stranger);
        return decision.granted && decision.level === 'FULL';
      });
      expect(fullRoles).toEqual(['OWNER']);
    });
  });

  describe('listScope — the same rule applied to a collection', () => {
    it('OWNER and ATTORNEY see the whole firm', () => {
      expect(service.listScope(user('OWNER'))).toEqual({ kind: 'ALL' });
      expect(service.listScope(user('ATTORNEY'))).toEqual({ kind: 'ALL' });
    });

    it('a PARALEGAL is narrowed to assigned-or-granted', () => {
      // Without this the guard protects the detail route while the list hands
      // out every client name and address anyway.
      expect(service.listScope(user('PARALEGAL', PARALEGAL_ID))).toEqual({
        kind: 'ASSIGNED_OR_GRANTED',
        userId: PARALEGAL_ID,
      });
    });

    it('a CLIENT is narrowed too, never widened', () => {
      expect(service.listScope(user('CLIENT'))).toEqual({
        kind: 'ASSIGNED_OR_GRANTED',
        userId: OTHER_ID,
      });
    });
  });
});
