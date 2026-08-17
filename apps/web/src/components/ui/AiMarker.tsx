'use client';

import type { ReactNode } from 'react';

import styles from './AiMarker.module.css';

/**
 * Wraps ALL AI-generated content. Draft sections, extracted deadlines, chat
 * answers — anything the machine produced.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A COMPLIANCE SURFACE, NOT DECORATION.
 *
 * Texas Opinion 705: the attorney must always be able to tell what came from
 * the machine. An unmarked AI output is a compliance failure, not a styling
 * oversight — which is why the marker is a primitive rather than a class
 * someone remembers to add.
 *
 * The label is real text, not colour alone: AI-teal carries the signal
 * visually, `aria-label` and the visible tag carry it for everyone else.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface AiMarkerProps {
  children: ReactNode;
  /** Shown next to the content. Keep it short — "AI-generated", "AI-extracted". */
  label?: string;
}

export function AiMarker({ children, label = 'AI-generated' }: AiMarkerProps): React.JSX.Element {
  return (
    <div className={styles.wrap} data-ai-generated="true" data-testid="ai-marker">
      <span className={styles.tag} aria-label={label}>
        {label}
      </span>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
