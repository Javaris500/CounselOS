import { http, HttpResponse } from 'msw';
import { ERROR_CODES, type ApiError, type ApiSuccess } from '@counselos/shared';

/**
 * ONE handler set for the whole app. Never per-slice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY SHARED
 *
 * Five agents writing their own mock of GET /v1/transactions/:id produces five
 * subtly different shapes, and each slice then passes against its own private
 * idea of the contract. One handler set means one contract, and a disagreement
 * surfaces as a merge conflict rather than as a production bug.
 *
 * Handlers are written against 04-data-contracts.md. Where a response shape and
 * the database disagree, 03-schema.md wins — a contract can only return what
 * the schema stores. Every mismatch the Playwright gate exposes is a
 * documentation defect: log it in .team-5/shared/contract-drift.md and fix the
 * doc. Never patch the component locally.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Both helpers exist so no handler hand-builds an envelope and gets it subtly wrong. */
const ok = <T>(data: T, meta?: ApiSuccess<T>['meta']): Response =>
  HttpResponse.json<ApiSuccess<T>>({ success: true, data, ...(meta ? { meta } : {}) });

const fail = (
  code: ApiError['error']['code'],
  message: string,
  status: number,
  details: Record<string, string[]> | null = null,
): Response =>
  HttpResponse.json<ApiError>(
    { success: false, error: { code, message, details, requestId: 'msw-request-id' } },
    { status },
  );

/**
 * Fixture IDs mirror apps/api/src/database/seed.ts so a component behaves the
 * same against mocks and against the seeded database. If these drift, a slice
 * passes in dev and fails its Playwright gate for no visible reason.
 */
export const MOCK_IDS = {
  firm: '00000000-0000-4000-8000-000000000001',
  attorney: '00000000-0000-4000-8000-000000000011',
  transaction: '00000000-0000-4000-8000-000000000020',
} as const;

export const handlers = [
  // ── Health / service honesty ───────────────────────────────────────────────
  http.get(`${API}/v1/health/services`, () =>
    ok({
      database: { name: 'database', status: 'ok', checkedAt: '2026-06-15T14:00:00.000Z' },
      redis: { name: 'redis', status: 'ok', checkedAt: '2026-06-15T14:00:00.000Z' },
      // Deliberately not_configured in the default fixtures: the disabled-state
      // UI is a required surface, and a mock where everything is `ok` means
      // nobody ever renders it.
      anthropic: {
        name: 'anthropic',
        status: 'not_configured',
        message: 'ANTHROPIC_API_KEY is not set — the feature is turned off.',
        checkedAt: '2026-06-15T14:00:00.000Z',
      },
      voyage: {
        name: 'voyage',
        status: 'not_configured',
        message: 'VOYAGE_API_KEY is not set — the feature is turned off.',
        checkedAt: '2026-06-15T14:00:00.000Z',
      },
      resend: {
        name: 'resend',
        status: 'degraded',
        message: 'Elevated failure rate.',
        checkedAt: '2026-06-15T14:00:00.000Z',
      },
      storage: { name: 'storage', status: 'ok', checkedAt: '2026-06-15T14:00:00.000Z' },
    }),
  ),

  // ── Auth ──────────────────────────────────────────────────────────────────
  http.post(`${API}/v1/auth/refresh`, () => ok({ accessToken: 'msw-refreshed-token' })),

  // ── Transactions ──────────────────────────────────────────────────────────
  http.get(`${API}/v1/transactions`, () =>
    ok(
      [
        {
          id: MOCK_IDS.transaction,
          transactionNumber: 'RE-2026-0001',
          title: 'Martinez / Chen — 2847 Manor Rd',
          status: 'DUE_DILIGENCE',
          propertyAddress: '2847 Manor Rd',
          closingDate: '2026-07-02T05:00:00.000Z',
        },
      ],
      { page: 1, limit: 25, total: 1, hasMore: false },
    ),
  ),

  http.get(`${API}/v1/transactions/:id`, ({ params }) => {
    if (params.id !== MOCK_IDS.transaction) {
      return fail(ERROR_CODES.TRANSACTION_NOT_FOUND, 'Transaction not found.', 404);
    }
    return ok({
      id: MOCK_IDS.transaction,
      transactionNumber: 'RE-2026-0001',
      title: 'Martinez / Chen — 2847 Manor Rd',
      status: 'DUE_DILIGENCE',
      propertyAddress: '2847 Manor Rd',
      purchasePrice: '615000.00',
      earnestMoneyAmount: '6150.00',
    });
  }),

  // ── Deadlines ─────────────────────────────────────────────────────────────
  http.get(`${API}/v1/transactions/:id/deadlines`, () =>
    ok([
      {
        id: '00000000-0000-4000-8000-000000000030',
        type: 'FINANCING_CONTINGENCY',
        status: 'ACTIVE',
        urgency: 'WARNING',
        title: 'Financing Contingency Deadline',
        dueAt: '2026-06-23T05:00:00.000Z',
        // Never absent from a fixture: a deadline without its calculation is a
        // bare date, which the Deadlines slice may not ship.
        calculationNote:
          '21 calendar days from the effective date. Rolls to the next business day.',
        isAutoExtracted: true,
        sourcePage: 3,
        sourceText:
          'Buyer shall have twenty-one (21) days from the Effective Date to obtain financing approval.',
      },
    ]),
  ),

  // ── Dashboard ─────────────────────────────────────────────────────────────
  http.get(`${API}/v1/dashboard`, () =>
    ok({ deadlines: [], tasks: [], overdue: [], staleTransactions: [] }),
  ),
];

/**
 * Opt-in error handlers. A surface is not done until its error state renders,
 * and the only honest way to prove that is to make the request actually fail.
 *
 *     server.use(...errorHandlers.transactionForbidden)
 */
export const errorHandlers = {
  transactionForbidden: [
    http.get(`${API}/v1/transactions/:id`, () =>
      fail(ERROR_CODES.MATTER_ACCESS_DENIED, 'You do not have access to this matter.', 403),
    ),
  ],
  validationFailure: [
    http.post(`${API}/v1/transactions/:id/communications`, () =>
      fail(ERROR_CODES.VALIDATION_ERROR, 'Validation failed', 422, {
        summary: ['Summary must be 500 characters or fewer.'],
      }),
    ),
  ],
  tokenExpired: [
    http.get(`${API}/v1/transactions`, () =>
      fail(ERROR_CODES.TOKEN_EXPIRED, 'Token expired.', 401),
    ),
  ],
  userInactive: [
    http.get(`${API}/v1/transactions`, () =>
      fail(ERROR_CODES.USER_INACTIVE, 'Account deactivated.', 401),
    ),
  ],
};
