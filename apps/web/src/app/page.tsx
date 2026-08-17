import { ERROR_CODES, TRANSACTION_STATUSES } from '@counselos/shared';

/**
 * Scaffold placeholder. Replaced in slice 0 by a redirect to /dashboard.
 *
 * It imports from @counselos/shared on purpose: if the workspace wiring is
 * wrong, this page fails to typecheck, which is a far better signal than
 * discovering it three modules later.
 */
export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'ui-monospace, monospace' }}>
      <h1>CounselOS</h1>
      <p>Scaffold is up. Slice 0 replaces this page.</p>
      <p>
        Shared contract resolves: {TRANSACTION_STATUSES.length} transaction statuses,{' '}
        {Object.keys(ERROR_CODES).length} error codes.
      </p>
    </main>
  );
}
