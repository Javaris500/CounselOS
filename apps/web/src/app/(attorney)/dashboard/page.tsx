import { EmptyState } from '@/components/ui';

/**
 * The morning dashboard — the attorney's home screen.
 *
 * A placeholder shell in 0a: it renders the empty state so the route and the
 * primitives are exercised end to end. The real aggregation is Case Ops' slice,
 * and the dashboard owns no table of its own — it reads through other modules.
 */
export default function DashboardPage(): React.JSX.Element {
  return (
    <EmptyState
      title="No active transactions"
      description="Add your first one and CounselOS starts working immediately — deadlines extracted, documents classified, nothing to configure."
    />
  );
}
