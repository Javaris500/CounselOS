'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import styles from './Drawer.module.css';

/**
 * Side panel — quick-add and detail panels.
 *
 * Distinct from Dialog because the interaction differs: a drawer is for a task
 * you do *alongside* the current view (log a call while reading the matter),
 * where a dialog interrupts for a decision. Quick-add lives here, and that
 * surface has a ten-second budget, so it must never animate slower than the
 * entrance token.
 */
export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testId?: string;
}

export function Drawer({ open, onClose, title, children, testId }: DrawerProps): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  // A fixed id would duplicate the moment two overlays mount, and
  // aria-labelledby would resolve to whichever rendered first.
  const titleId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handleCancel = (event: Event): void => {
      event.preventDefault();
      onClose();
    };
    node.addEventListener('cancel', handleCancel);
    return () => node.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={styles.drawer}
      data-testid={testId ?? 'ui-drawer'}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.panel}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <div className={styles.body}>{children}</div>
      </div>
    </dialog>
  );
}
