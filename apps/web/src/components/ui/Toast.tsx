'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import styles from './Toast.module.css';

/**
 * Mutation failure + rollback feedback.
 *
 * The four optimistic creates roll back on error, and a row that appears and
 * then silently vanishes is worse than one that took a second to save — the
 * attorney assumes the call was logged and it wasn't. The toast is what makes
 * the rollback honest, so it is a primitive rather than a per-slice decision.
 */
export interface ToastMessage {
  id: string;
  tone: 'error' | 'success';
  text: string;
}

interface ToastContextValue {
  toast: (tone: ToastMessage['tone'], text: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Module-scoped so ids stay unique across every provider instance. */
let nextToastId = 0;

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast = useCallback((tone: ToastMessage['tone'], text: string) => {
    // A monotonic counter, not list length + text. Two identical failures in a
    // row produced the same id, so React rendered one toast for two events and
    // warned about duplicate keys — and a rollback the attorney never saw is
    // exactly the failure this component exists to prevent.
    nextToastId += 1;
    const id = `toast-${String(nextToastId)}`;
    setMessages((current) => [...current, { id, tone, text }]);
    // Errors persist until dismissed; a failure that disappears on its own is
    // a failure the attorney can miss entirely.
    if (tone === 'success') {
      setTimeout(() => setMessages((c) => c.filter((m) => m.id !== id)), 4000);
    }
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.toast} ${styles[message.tone]}`}
            data-testid="ui-toast"
          >
            <span>{message.text}</span>
            <button
              type="button"
              className={styles.dismiss}
              aria-label="Dismiss"
              onClick={() => setMessages((c) => c.filter((m) => m.id !== message.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}
