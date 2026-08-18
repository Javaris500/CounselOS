'use client';

import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui';
import { useRequireAuth } from '@/lib/auth/useRequireAuth';

import { Providers } from '../providers';
import styles from './layout.module.css';

/**
 * The attorney product shell.
 *
 * `(attorney)` and `(client)` are two different products sharing one deploy —
 * different layouts, different auth, different visual language. This one is
 * client-rendered because it holds the in-memory access token and, later, the
 * SSE connection; neither can exist on the server.
 *
 * The guard lives HERE rather than on each page so a new route is protected by
 * existing, not by someone remembering to add a check.
 *
 * Still to land: the SSE mount, the nav shell, and the service-honesty banner.
 */
export default function AttorneyLayout({ children }: { children: ReactNode }): React.JSX.Element {
  const status = useRequireAuth();

  return (
    <Providers>
      <div className={styles.shell}>
        <main className={styles.main}>
          {status === 'authenticated' ? (
            children
          ) : (
            /**
             * A skeleton, not a spinner, and not the children.
             *
             * On a reload the access token is gone from memory and the refresh
             * call has not answered yet. Rendering children during that window
             * would fire their fetches with no token, producing a burst of 401s
             * and a visible flash of empty state before the redirect.
             */
            <Skeleton rows={4} />
          )}
        </main>
      </div>
    </Providers>
  );
}
