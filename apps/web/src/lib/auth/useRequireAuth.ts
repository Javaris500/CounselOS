'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { restoreSession } from '@/lib/api/auth';
import { useAuthStore } from '@/stores/auth.store';

export type SessionStatus = 'checking' | 'authenticated' | 'redirecting';

/**
 * The attorney-side auth guard.
 *
 * Three states rather than two, deliberately. Without `checking`, the first
 * paint after a reload has no token yet and every guard would bounce the user
 * to login before the refresh call had a chance to answer — signing them out
 * on every refresh.
 */
export function useRequireAuth(): SessionStatus {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [status, setStatus] = useState<SessionStatus>('checking');

  useEffect(() => {
    if (isAuthenticated) {
      setStatus('authenticated');
      return;
    }

    let cancelled = false;
    void restoreSession().then((restored) => {
      if (cancelled) return;
      if (restored) {
        setStatus('authenticated');
        return;
      }
      setStatus('redirecting');
      router.replace('/auth/login');
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, router]);

  return status;
}
