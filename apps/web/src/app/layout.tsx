import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'CounselOS',
  description: 'The OS your firm runs on.',
};

/**
 * Root layout — static chrome only, so it stays a server component.
 *
 * The real layouts live in the route groups: (attorney) carries auth, the SSE
 * connection, and the nav shell; (client) is a completely different shell for
 * the read-only portal. They are two products sharing one deploy
 * (06-frontend-architecture.md).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
