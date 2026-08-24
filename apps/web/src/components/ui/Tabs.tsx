'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import styles from './Tabs.module.css';

/**
 * Tab navigation. Registered because the transaction detail shell is the frame
 * five other slices mount into — Documents, Deadlines, Chat, Drafts, Case Ops
 * all render inside these tabs, and they must not each style their own strip.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A TAB WHOSE SLICE HAS NOT LANDED RENDERS DISABLED, NOT MISSING.
 *
 * Hiding it would make the product look smaller than it is and make each
 * arriving slice a layout change. Disabled says "this exists, it is not ready",
 * which is the same honesty rule `not_configured` applies to a dependency:
 * never a spinner for something known not to be there.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Links, not buttons — each tab is a route, so it deep-links, opens in a new
 * tab, and works with the back button, all for free.
 */
export interface TabItem {
  key: string;
  label: string;
  /** Absent means the slice has not landed. Renders disabled. */
  href?: string;
  /** e.g. an unread count. Kept to a short string. */
  badge?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  /** `key` of the active tab. */
  active: string;
  ariaLabel: string;
  testId?: string;
}

export function Tabs({ items, active, ariaLabel, testId }: TabsProps): React.JSX.Element {
  return (
    <nav className={styles.tabs} aria-label={ariaLabel} data-testid={testId ?? 'ui-tabs'}>
      <ul className={styles.list}>
        {items.map((item) => {
          const isActive = item.key === active;

          return (
            <li key={item.key}>
              {item.href === undefined ? (
                <span
                  className={`${styles.tab} ${styles.disabled}`}
                  aria-disabled="true"
                  data-testid={`tab-${item.key}`}
                  // Explains the disabled state rather than leaving the user to
                  // guess whether they lack permission.
                  title="Not available yet"
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className={`${styles.tab} ${isActive ? styles.active : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  data-testid={`tab-${item.key}`}
                >
                  {item.label}
                  {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
