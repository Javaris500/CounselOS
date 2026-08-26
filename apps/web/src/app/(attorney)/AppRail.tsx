'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';

import { Tooltip } from '@/components/ui';
import { keys } from '@/lib/api/queryKeys';
import { useAuthStore } from '@/stores/auth.store';

import styles from './AppRail.module.css';
import { useRailCollapsed } from './useRailCollapsed';
import {
  HomeIcon,
  MatterIcon,
  ClockIcon,
  LeadIcon,
  TimeIcon,
  ChartIcon,
  GearIcon,
  SearchIcon,
} from './icons';

/**
 * The attorney rail.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ROUTE THAT DOES NOT EXIST RENDERS DISABLED, NEVER HIDDEN.
 *
 * The same contract `Tabs` carries: a destination whose slice has not landed
 * still shows, greyed, with the slice named. Hiding it makes the product look
 * smaller than it is and gives a returning user no way to tell "not built yet"
 * from "you lost access". Linking it would 404, which is worse than both.
 *
 * `href: null` is the whole mechanism — the row renders as a `<span>` instead
 * of a `<Link>`, so it is unreachable by mouse AND by keyboard rather than
 * being a focusable dead end.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Matter-centric on purpose. Documents, drafts and chat are absent because none
 * of them exists outside a transaction — they are lenses on a matter and live
 * in its tab strip, not beside it.
 */
interface NavRow {
  label: string;
  icon: React.JSX.Element;
  /** null = the slice has not landed. Renders disabled, with `note` as the reason. */
  href: string | null;
  note?: string;
}

const PRIMARY: NavRow[] = [
  { label: 'Home', icon: <HomeIcon />, href: '/home' },
  { label: 'Matters', icon: <MatterIcon />, href: '/transactions' },
  { label: 'Deadlines', icon: <ClockIcon />, href: null, note: 'Lands with slice 3' },
  { label: 'Leads', icon: <LeadIcon />, href: null, note: 'Lands with slice 8' },
];

const FIRM: NavRow[] = [
  { label: 'Time & billing', icon: <TimeIcon />, href: null, note: 'Lands with slice 7' },
  { label: 'Reports', icon: <ChartIcon />, href: null, note: 'Phase 2' },
  { label: 'Settings', icon: <GearIcon />, href: null, note: 'Not built yet' },
];

/**
 * Every row is wrapped, and the tooltip shows ONLY when the rail is collapsed
 * (the primitive handles that in CSS). Above 1000px the label is on screen and
 * a bubble repeating it would be noise.
 *
 * The `note` is the second line — "Lands with slice 3" — which is the whole
 * reason a disabled row is worth showing at all. Collapsed to an icon with no
 * tooltip, a greyed row says nothing; with one, it says when it arrives.
 */
function Row({
  row,
  active,
  collapsed,
}: {
  row: NavRow;
  active: boolean;
  collapsed: boolean;
}): React.JSX.Element {
  const body = (
    <>
      <span className={styles.icon}>{row.icon}</span>
      <span className={styles.label}>{row.label}</span>
    </>
  );

  const testId = `rail-${row.label.toLowerCase().replace(/[^a-z]+/g, '-')}`;

  if (row.href === null) {
    return (
      <Tooltip label={row.label} note={row.note} enabled={collapsed}>
        <span className={`${styles.row} ${styles.disabled}`} aria-disabled="true" data-testid={testId}>
          {body}
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip label={row.label} enabled={collapsed}>
      <Link
        href={row.href}
        className={`${styles.row} ${active ? styles.active : ''}`}
        aria-current={active ? 'page' : undefined}
        data-testid={testId}
      >
        {body}
      </Link>
    </Tooltip>
  );
}

/**
 * Service honesty (8L), read from the real probe.
 *
 * `not_configured` is a first-class state, never disguised as an error and
 * never as working. While the probe is in flight this renders nothing at all
 * rather than an optimistic green dot — a fake "all good" is exactly the
 * failure this endpoint exists to prevent.
 */
function ServiceStatus(): React.JSX.Element | null {
  const { data } = useSWR<Record<string, { status: string }>>(keys.healthServices());
  if (!data) return null;

  const states = Object.values(data).map((s) => s.status);
  const down = states.filter((s) => s === 'down' || s === 'degraded').length;
  const off = states.filter((s) => s === 'not_configured').length;

  const tone = down > 0 ? 'down' : off > 0 ? 'off' : 'ok';
  const text =
    down > 0
      ? `${String(down)} service${down === 1 ? '' : 's'} unavailable`
      : off > 0
        ? `${String(off)} not configured`
        : 'All services running';

  return (
    /*
      `aria-live="polite"`: a dependency dropping while someone is on the page
      re-renders this row silently otherwise — a screen-reader user gets nothing
      and a sighted one notices only by looking at the corner. 8L exists so
      people know the AI is unavailable BEFORE they rely on it.
    */
    <div
      className={styles.status}
      data-testid="rail-service-status"
      data-tone={tone}
      role="status"
      aria-live="polite"
    >
      <span className={`${styles.dot} ${styles[tone]}`} />
      <span className={styles.statusText}>{text}</span>
    </div>
  );
}

export function AppRail(): React.JSX.Element {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const { collapsed } = useRailCollapsed();

  const isActive = (href: string): boolean =>
    href === '/home' ? pathname === href : pathname.startsWith(href);

  const initials = (user?.fullName ?? '')
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <nav
      className={styles.rail}
      aria-label="Main"
      data-testid="app-rail"
      /* One attribute drives every collapsed rule in the stylesheet, so the
         labels, the tooltips and the toggle can never disagree about the
         state — which is exactly what two matching media queries could. */
      data-collapsed={collapsed}
    >
      {/*
        No toggle here.

        It sat in this header, and before that at the foot beside the service
        status. Both were wrong for the same reason: collapsed, the rail is
        60px wide, so ANY control inside it lands in the middle of that strip —
        there is no off-centre position available. It now lives at the far left
        of the top bar, where it holds one fixed spot whatever the rail is
        doing, and reads as "this control acts on the thing to its left".
      */}
      <div className={styles.brand}>
        <span className={styles.mark}>R</span>
        <span className={styles.firm}>Rodriguez Law</span>
      </div>

      {/*
        The command palette is slice 11. Rendering a working-looking search box
        that does nothing would be a faked integration; rendering nothing would
        hide a keybinding people should learn. So: disabled, with the chord
        visible and the reason on hover.
      */}
      <Tooltip label="Search" note="The command palette lands with slice 11" enabled={collapsed}>
        <span className={styles.search} aria-disabled="true" data-testid="rail-search">
          <SearchIcon />
          <span className={styles.searchLabel}>Search</span>
          <kbd className={styles.kbd}>⌘K</kbd>
        </span>
      </Tooltip>

      <div className={styles.group}>
        {PRIMARY.map((row) => (
          <Row
            key={row.label}
            row={row}
            active={row.href !== null && isActive(row.href)}
            collapsed={collapsed}
          />
        ))}
      </div>

      <p className={styles.groupLabel}>FIRM</p>
      <div className={styles.group}>
        {FIRM.map((row) => (
          <Row key={row.label} row={row} active={false} collapsed={collapsed} />
        ))}
      </div>

      <div className={styles.spacer} />

      <ServiceStatus />

      {user ? (
        <div className={styles.user} data-testid="rail-user">
          <span className={styles.avatar}>{initials}</span>
          <span className={styles.userText}>
            <span className={styles.userName}>{user.fullName}</span>
            <span className={styles.userRole}>{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</span>
          </span>
        </div>
      ) : null}
    </nav>
  );
}
