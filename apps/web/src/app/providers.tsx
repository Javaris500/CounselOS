'use client';

import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

import { ToastProvider } from '@/components/ui';
import { fetcher } from '@/lib/api/client';
import { swrConfig } from '@/lib/api/queryKeys';

/**
 * Global client providers.
 *
 * The SWR fetcher is apiFetch, so every hook inherits the auth lifecycle —
 * refresh-and-retry, USER_INACTIVE routing — without any component knowing it
 * exists. That is the entire reason apiFetch is not mocked in tests: mock it
 * and none of this runs.
 */
export function Providers({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <SWRConfig value={{ ...swrConfig, fetcher }}>
      <ToastProvider>{children}</ToastProvider>
    </SWRConfig>
  );
}
