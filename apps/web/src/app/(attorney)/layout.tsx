'use client';

import type { ReactNode } from 'react';

import { Providers } from '../providers';
import styles from './layout.module.css';

/**
 * The attorney product shell.
 *
 * `(attorney)` and `(client)` are two different products sharing one deploy —
 * different layouts, different auth, different visual language. This one is
 * client-rendered because it holds the SSE connection and reads the in-memory
 * access token, neither of which can exist on the server.
 *
 * Still to land in 0b, once auth exists: the auth guard, the SSE mount, the
 * nav shell, and the service-honesty banner.
 */
export default function AttorneyLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <Providers>
      <div className={styles.shell}>
        <main className={styles.main}>{children}</main>
      </div>
    </Providers>
  );
}
