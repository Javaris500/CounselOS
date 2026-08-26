'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * The label for the deepest breadcrumb, supplied by the page that owns the record.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A CONTEXT AND NOT A FETCH.
 *
 * `TopBar` derives the trail from the path and deliberately refuses to load
 * anything: a crumb that fetches separately from its page produces
 * "Matters / Loading…" on every navigation, which is worse than a generic
 * crumb. But the generic crumb is worse than the real name, and the page ALREADY
 * HAS the name — it rendered the matter to get here.
 *
 * So the data flows the one direction that costs nothing: the page hands its
 * label up, the shell renders it. No second request, no second trail, and no
 * loading state — because there is nothing to load.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The fallback is the path-derived label. A page that forgets to call
 * `useCrumbLabel` degrades to "Matter", which is exactly where this started —
 * so forgetting is survivable rather than broken.
 */
interface CrumbContext {
  label: string | null;
  setLabel: (label: string | null) => void;
}

const Ctx = createContext<CrumbContext>({ label: null, setLabel: () => undefined });

export function CrumbProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [label, setLabel] = useState<string | null>(null);
  return <Ctx.Provider value={{ label, setLabel }}>{children}</Ctx.Provider>;
}

/** Read by `TopBar`. */
export function useCrumb(): string | null {
  return useContext(Ctx).label;
}

/**
 * Called by the page that owns the record.
 *
 * It CLEARS on unmount, which is the whole reason this is an effect and not a
 * render-time write: navigating from one matter to another would otherwise
 * leave the previous matter's name in the trail for a frame, and navigating to
 * a list would leave it there permanently.
 */
export function useCrumbLabel(label: string | null | undefined): void {
  const { setLabel } = useContext(Ctx);
  useEffect(() => {
    setLabel(label ?? null);
    return () => {
      setLabel(null);
    };
  }, [label, setLabel]);
}
