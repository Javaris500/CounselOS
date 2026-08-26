'use client';

import { useCallback, useEffect, useState } from 'react';

import { Tooltip } from '@/components/ui';

import styles from './ViewSwitch.module.css';

const STORAGE_KEY = 'counselos.matters.view';

export type MattersView = 'board' | 'list';

/**
 * Which view the matters page is in, remembered per browser.
 *
 * Not a URL parameter, deliberately. A shared link to a matters page should
 * open in the recipient's own preferred view — the thing being shared is the
 * page, not the sender's layout habit. Filters and sort ARE about the content
 * and belong in the URL when they land; this is chrome.
 *
 * Starts at `board` on both server and first client render, then reads storage
 * in an effect. Reading during render would flash the wrong view on every load.
 */
export function useMattersView(): [MattersView, (v: MattersView) => void] {
  const [view, setView] = useState<MattersView>('board');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'list' || stored === 'board') setView(stored);
    } catch {
      // Private windows and blocked site data throw. A page that refuses to
      // render because it could not read a preference is worse than one that
      // opens on the default.
    }
  }, []);

  const choose = useCallback((next: MattersView) => {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Still works for this session.
    }
  }, []);

  return [view, choose];
}

const BoardIcon = (): React.JSX.Element => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2.5" width="3.6" height="11" rx="1" />
    <rect x="6.4" y="2.5" width="3.6" height="7.5" rx="1" />
    <rect x="10.8" y="2.5" width="3.2" height="9.5" rx="1" />
  </svg>
);

const ListIcon = (): React.JSX.Element => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </svg>
);

/**
 * Two icons, one pressed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ICON-ONLY CONTROLS NEED A REAL NAME, NOT A `title`.
 *
 * `aria-label` carries the accessible name and the tooltip carries the visible
 * one, and they say the same words. `title` was rejected for both jobs: it is
 * unstyleable, delayed by about a second, and never appears on keyboard focus —
 * so a keyboard user tabbing onto an unlabelled icon gets nothing at all.
 *
 * `aria-pressed` rather than a class, because "which view am I in" is state a
 * screen reader must be able to answer, and a highlighted background answers it
 * only for people who can see it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function ViewSwitch({
  view,
  onChange,
}: {
  view: MattersView;
  onChange: (v: MattersView) => void;
}): React.JSX.Element {
  const options: { key: MattersView; label: string; note: string; icon: React.JSX.Element }[] = [
    { key: 'board', label: 'Board', note: 'Every matter by pipeline stage', icon: <BoardIcon /> },
    { key: 'list', label: 'List', note: 'One row each, soonest closing first', icon: <ListIcon /> },
  ];

  return (
    <div className={styles.group} role="group" aria-label="View" data-testid="matters-view-switch">
      {options.map((o) => (
        <Tooltip key={o.key} label={o.label} note={o.note} placement="bottom">
          <button
            type="button"
            className={styles.option}
            aria-pressed={view === o.key}
            aria-label={`${o.label} view`}
            onClick={() => {
              onChange(o.key);
            }}
            data-testid={`matters-view-${o.key}`}
          >
            {o.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
