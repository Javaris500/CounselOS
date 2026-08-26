'use client';

import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui';
import { useRequireAuth } from '@/lib/auth/useRequireAuth';

import { Providers } from '../providers';
import { AppRail } from './AppRail';
import { CrumbProvider } from './crumb';
import { RailProvider } from './useRailCollapsed';
import { TopBar } from './TopBar';
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
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RAIL RENDERS ONLY WHEN AUTHENTICATED, AND THAT IS DELIBERATE.
 *
 * On a hard reload the access token is gone from memory and the refresh call
 * has not answered. Rendering the rail during that window would show the firm
 * name and the user's own name to whoever is holding the laptop, a beat before
 * the redirect to login — which is a small leak, but it is a leak, and it is
 * the kind that only appears on the unhappy path nobody screenshots.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Still to land: the SSE mount, and the notification surface that depends on
 * it. There is no bell in the top bar yet on purpose — a bell with no feed
 * behind it is a faked integration, and `not_configured` being a first-class
 * state is a rule about surfaces as much as services.
 */
export default function AttorneyLayout({ children }: { children: ReactNode }): React.JSX.Element {
  const status = useRequireAuth();

  if (status !== 'authenticated') {
    return (
      <Providers>
        <div className={styles.shell}>
          <div className={styles.panel}>
            <div className={styles.content}>
              {/*
                A skeleton, not a spinner, and not the children.
                Rendering children during the refresh window would fire their
                fetches with no token, producing a burst of 401s and a visible
                flash of empty state before the redirect.
              */}
              <Skeleton shape="rows" rows={4} />
            </div>
          </div>
        </div>
      </Providers>
    );
  }

  return (
    <Providers>
      <RailProvider>
        <div className={styles.shell}>
          <AppRail />
          <CrumbProvider>
            <div className={styles.panel}>
              <TopBar />
              <main className={styles.content}>
                <div className={styles.measure}>{children}</div>
              </main>
            </div>
          </CrumbProvider>
        </div>
      </RailProvider>
    </Providers>
  );
}
