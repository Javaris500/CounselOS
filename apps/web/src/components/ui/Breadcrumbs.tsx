'use client';

import Link from 'next/link';

import styles from './Breadcrumbs.module.css';

/**
 * The trail. Registry-canonical — do not build another.
 *
 * It earns its place here more than in most products: this one drills
 * matter → document → deadline → draft, and every one of those is a dead end
 * without a way back up that is not the browser button. The matter is the
 * spine, so the trail is how you climb it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LAST CRUMB IS TEXT, NOT A LINK.
 *
 * A link to the page you are already on is a control that does nothing and
 * takes a keyboard tab stop to do it. `aria-current="page"` is what marks it
 * instead, so assistive tech gets the position without the dead control.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Crumb labels come from data the caller already has. Never fetch a name to
 * render a crumb: a trail that loads separately from its page produces the
 * "Matters / Loading… / Loading…" flicker on every navigation.
 */
export interface Crumb {
  label: string;
  /** Omit on the last crumb. Present on every ancestor. */
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }): React.JSX.Element {
  return (
    <nav className={styles.nav} aria-label="Breadcrumb" data-testid="ui-breadcrumbs">
      <ol className={styles.list}>
        {items.map((crumb, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${crumb.label}-${String(i)}`} className={styles.item}>
              {crumb.href !== undefined && !isLast ? (
                <Link href={crumb.href} className={styles.link}>
                  {crumb.label}
                </Link>
              ) : (
                <span className={styles.current} aria-current={isLast ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
              {isLast ? null : (
                <span className={styles.sep} aria-hidden="true">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
