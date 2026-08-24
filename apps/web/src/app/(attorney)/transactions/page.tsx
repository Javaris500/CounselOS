'use client';

import { PipelineBoard } from '@/components/features/transactions/PipelineBoard';

/**
 * `/transactions` — the pipeline.
 *
 * A client component, like everything under `(attorney)`: the access token
 * lives in memory and the SSE connection will mount in this layout, and neither
 * can exist on the server.
 */
export default function TransactionsPage(): React.JSX.Element {
  return <PipelineBoard />;
}
