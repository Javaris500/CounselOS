import type { ReactNode } from 'react';

import styles from './layout.module.css';

/**
 * The client portal shell — a different product from the attorney app.
 *
 * Server-rendered on purpose: the signed access token never reaches client JS,
 * so it cannot leak through a devtools inspection or a third-party script. It
 * mounts none of the attorney providers — no SWR fetcher, no auth store, no
 * SSE — because a client has none of those things.
 *
 * Comfortable density here, unlike the attorney surfaces: this is read once by
 * someone unfamiliar with the system, not scanned twenty times a day.
 */
export default function ClientLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
