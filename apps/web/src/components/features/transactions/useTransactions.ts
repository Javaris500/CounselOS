'use client';

import useSWR from 'swr';
import type {
  ActivityEntry,
  Paginated,
  Transaction,
  TransactionDetail,
} from '@counselos/shared';

import { keys } from '@/lib/api/queryKeys';

/**
 * SWR reads for this slice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PIPELINE READS THE BARE `keys.transactions()` KEY, WITH NO QUERY STRING.
 *
 * `mutations.ts` is append-only and `createTransaction` already declares its
 * invalidation as `mutate(keys.transactions())` — an EXACT key match. A board
 * fetching `keys.transactions('limit=100')` would therefore never be
 * invalidated by a create: the new matter would not appear until a manual
 * refresh, and that reads as a backend bug for a day before anyone finds it.
 *
 * So the board takes the default page and renders an honest "showing N of M"
 * when there are more. Filters live in the columns (the board groups by status
 * itself) rather than in the query string, for the same reason.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function useTransactionList(): {
  transactions: Transaction[] | undefined;
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  error: unknown;
} {
  const { data, isLoading, error } = useSWR<Paginated<Transaction>>(keys.transactions());

  return {
    transactions: data?.data,
    total: data?.meta.total ?? 0,
    hasMore: data?.meta.hasMore ?? false,
    isLoading,
    error,
  };
}

export function useTransaction(id: string): {
  transaction: TransactionDetail | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, isLoading, error } = useSWR<TransactionDetail>(keys.transaction(id));
  return { transaction: data, isLoading, error };
}

export function useActivity(id: string): {
  entries: ActivityEntry[] | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, isLoading, error } = useSWR<Paginated<ActivityEntry>>(keys.activity(id));
  return { entries: data?.data, isLoading, error };
}
