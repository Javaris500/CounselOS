'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import styles from './Dialog.module.css';

/**
 * THE overlay implementation. One, ever.
 *
 * Every modal in the product is this component — the attestation modal, confirm
 * dialogs, anything layered. A second overlay primitive is the single most
 * likely divergence on a five-agent team, and it is the example the Pattern
 * Registry leads with.
 *
 * Built on <dialog>, so focus trapping, Escape, and inertness on the background
 * come from the platform rather than from a hand-rolled key handler that misses
 * Shift+Tab.
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Blocks Escape and backdrop dismissal. For gates that need a real decision. */
  dismissible?: boolean;
  testId?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  dismissible = true,
  testId,
}: DialogProps): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  // A fixed id would duplicate the moment two overlays mount, and
  // aria-labelledby would resolve to whichever rendered first.
  const titleId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // showModal() is what makes the rest of the page inert and traps focus.
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const handleCancel = (event: Event): void => {
      // Escape fires 'cancel'. A non-dismissible dialog refuses it rather than
      // letting a keypress bypass a decision the user has to make explicitly.
      if (!dismissible) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      onClose();
    };

    node.addEventListener('cancel', handleCancel);
    return () => node.removeEventListener('cancel', handleCancel);
  }, [dismissible, onClose]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      data-testid={testId ?? 'ui-dialog'}
      aria-labelledby={titleId}
      onClick={(event) => {
        // Backdrop click: the click lands on <dialog> itself, never on content.
        if (dismissible && event.target === ref.current) onClose();
      }}
    >
      <div className={styles.panel}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </dialog>
  );
}
