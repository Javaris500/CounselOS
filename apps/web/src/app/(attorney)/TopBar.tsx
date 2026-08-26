'use client';

import { usePathname } from 'next/navigation';

import { Breadcrumbs, Tooltip, type Crumb } from '@/components/ui';

import { useCrumb } from './crumb';
import { ChevronsIcon } from './icons';
import { useRailCollapsed } from './useRailCollapsed';

import styles from './TopBar.module.css';

/**
 * The panel's top bar. Breadcrumb left, page actions right.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TRAIL IS DERIVED FROM THE PATH, NOT FETCHED.
 *
 * A crumb that loads separately from its page produces "Matters / Loading… "
 * on every navigation, which is worse than no crumb. So the deepest segment
 * renders as its id until the page that owns the record supplies a better
 * label — and the page does that by rendering its own `<Breadcrumbs>` in the
 * content, which is why this component keeps the trail short rather than
 * trying to name records it has not loaded.
 *
 * When slice 2 adds `/transactions/:id/documents`, the segment map below gains
 * one row. It is a map and not a route table on purpose: an unmapped segment
 * falls through to the raw path piece, which is ugly but never wrong.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const SEGMENTS: Record<string, string> = {
  home: 'Home',
  transactions: 'Matters',
};

function crumbsFor(pathname: string, recordLabel: string | null): Crumb[] {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return [{ label: 'Home' }];

  return parts.map((part, i) => {
    const href = `/${parts.slice(0, i + 1).join('/')}`;
    const known = SEGMENTS[part];
    // A uuid segment is a record, and this component does not know its name.
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(part);
    // The owning page's label wins on the LAST crumb only — an ancestor is a
    // section, and sections are named by the map above.
    const isLast = i === parts.length - 1;
    const fallback = known ?? (isId ? 'Matter' : part);
    const label = isLast && recordLabel !== null ? recordLabel : fallback;
    return isLast ? { label } : { label, href };
  });
}

export function TopBar({ actions }: { actions?: React.ReactNode }): React.JSX.Element {
  const pathname = usePathname();
  const recordLabel = useCrumb();
  const { collapsed, canToggle, toggle } = useRailCollapsed();

  return (
    <header className={styles.bar} data-testid="app-topbar" data-rail-collapsed={collapsed}>
      {/*
        Far left, before the trail — the one place that never moves.
        
        Inside the rail there was nowhere good: collapsed it is 60px wide, so
        every position is effectively centred. Here it keeps one fixed spot
        whatever the rail is doing, sits directly beside what it acts on, and
        joins the tab order before the navigation instead of after it.
        
        Hidden below the breakpoint, where collapse is forced: a control that
        cannot expand is a control that does nothing.
      */}
      {canToggle ? (
        <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="bottom">
          <button
            type="button"
            className={styles.railToggle}
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            data-testid="rail-toggle"
          >
            <ChevronsIcon />
          </button>
        </Tooltip>
      ) : null}

      <Breadcrumbs items={crumbsFor(pathname, recordLabel)} />
      <div className={styles.spacer} />
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
