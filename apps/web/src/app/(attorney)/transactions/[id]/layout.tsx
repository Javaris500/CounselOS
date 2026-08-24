'use client';

import { use, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { TransactionShell } from '@/components/features/transactions/TransactionShell';

/**
 * The detail shell. Every tab renders inside this.
 *
 * The transaction is fetched HERE, once, and provided by context — status,
 * parties, address and dates are needed by every tab, and nine tabs each
 * fetching the matter would be nine identical requests (06 Part 9).
 *
 * The active tab is derived from the pathname rather than passed down, so a
 * slice adding `…/[id]/documents/page.tsx` gets its tab highlighted without
 * touching this file. That is deliberate: five agents mount here, and the fewer
 * of them that need to edit the shell, the better.
 */
export default function TransactionLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}): React.JSX.Element {
  const { id } = use(params);
  const pathname = usePathname();

  const segment = pathname.split(`/transactions/${id}`)[1]?.replace(/^\//, '') ?? '';
  const activeTab = segment === '' ? 'overview' : (segment.split('/')[0] ?? 'overview');

  return (
    <TransactionShell transactionId={id} activeTab={activeTab}>
      {children}
    </TransactionShell>
  );
}
