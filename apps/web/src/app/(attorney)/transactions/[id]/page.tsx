'use client';

import { TransactionOverview } from '@/components/features/transactions/TransactionOverview';

/**
 * `/transactions/[id]` — the overview tab.
 *
 * No fetch of its own: the shell already holds the matter and hands it over by
 * context (06 Part 9).
 */
export default function TransactionOverviewPage(): React.JSX.Element {
  return <TransactionOverview />;
}
