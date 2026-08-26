'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'counselos.rail.collapsed';
const NARROW = '(max-width: 1000px)';

/**
 * Is the rail collapsed, and may the user change that?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COLLAPSE IS STATE, NOT A MEDIA QUERY — AND THAT IS THE WHOLE POINT.
 *
 * It used to be CSS-only: a `@media (max-width: 1000px)` block hid the labels
 * and a matching block in `Tooltip.module.css` revealed the bubble. Two files
 * agreeing on a breakpoint by coincidence, with nothing linking them — change
 * one number and the rail collapses while its tooltips stay hidden, which is an
 * icon-only nav nobody can read.
 *
 * Now one hook owns the answer and everything downstream reads it: the rail
 * clips its labels, the tooltips arm, and the toggle knows what it is toggling.
 * One rule, one implementation — which is `20-review-lessons.md` M3.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two inputs, and narrow WINS. Below 1000px there is no room for labels
 * whatever the user prefers, so the toggle is hidden rather than offered and
 * then ignored — a control that does nothing is worse than no control.
 *
 * The stored preference is per-browser and deliberately not server state: it is
 * a viewing convenience, not something the firm has an opinion about.
 */
export interface RailCollapse {
  collapsed: boolean;
  /** False below the breakpoint, where collapse is forced and not a choice. */
  canToggle: boolean;
  toggle: () => void;
}

/**
 * Shared, because TWO components need the same answer.
 *
 * The rail reshapes itself and the top bar hosts the toggle, so a plain hook
 * would give each its own `useState` and they would disagree the moment either
 * one changed. This is the same lesson as the tooltip's breakpoint: one rule,
 * one implementation, read by everyone who needs it.
 */
const Ctx = createContext<RailCollapse | null>(null);

export function RailProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const value = useRailCollapsedState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRailCollapsed(): RailCollapse {
  const ctx = useContext(Ctx);
  if (ctx === null) {
    throw new Error('useRailCollapsed must be used inside <RailProvider>.');
  }
  return ctx;
}

function useRailCollapsedState(): RailCollapse {
  /*
   * Both start false so the server and the first client render agree.
   * Reading localStorage or matchMedia during render would produce a
   * hydration mismatch — the rail would flash expanded, then snap.
   */
  const [preferred, setPreferred] = useState(false);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    try {
      setPreferred(window.localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      // Private windows and blocked site data both throw. A rail that refuses
      // to render because it could not read a preference is worse than a rail
      // that opens expanded.
    }

    const mq = window.matchMedia(NARROW);
    setNarrow(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => {
      setNarrow(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => {
      mq.removeEventListener('change', onChange);
    };
  }, []);

  const toggle = useCallback(() => {
    setPreferred((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Same as above: the toggle still works for this session.
      }
      return next;
    });
  }, []);

  return { collapsed: narrow || preferred, canToggle: !narrow, toggle };
}
