import Link from 'next/link';

import { EmptyState } from '@/components/ui';

/**
 * The morning dashboard — the attorney's home screen.
 *
 * NOT BUILT. The real aggregation is Case Ops' slice; the dashboard owns no
 * table of its own and reads through other modules' services.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SAYS SO ON SCREEN, ADDED 2026-08-24.
 *
 * It used to render `EmptyState title="No active transactions"` — the exact
 * component, and the exact sentence, a finished dashboard shows a firm with no
 * matters. Against a seeded database holding ten, it cost an operator twenty
 * minutes and two wrong hypotheses before anyone opened this file. See
 * SURPRISES.md 005.
 *
 * The rule this was missing already exists here one layer down: `not_configured`
 * is a first-class state for every external service, and CLAUDE.md forbids
 * rendering a spinner for a service known to be down — show a disabled state
 * with a plain explanation instead. That principle was written for SERVICES and
 * never extended to SURFACES, so an unbuilt page was still allowed to
 * impersonate a built one in the product's own confident voice.
 *
 * A docstring is not the fix. It is visible to whoever opens the file and
 * invisible to everyone looking at the running app — which is precisely the
 * population that gets misled.
 *
 * So: a placeholder announces itself in the medium where it is encountered, and
 * sends the reader somewhere real. When Case Ops lands, this whole file goes.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function DashboardPage(): React.JSX.Element {
  return (
    <EmptyState
      title="The dashboard isn’t built yet"
      description="It lands with Case Ops and will summarise deadlines, documents and matters needing attention. Nothing here reflects your data — this page reads nothing. Matters live under Transactions."
      action={
        <Link href="/transactions" data-testid="dashboard-placeholder-transactions-link">
          Go to Transactions
        </Link>
      }
    />
  );
}
