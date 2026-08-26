'use client';

import type { Transaction } from '@counselos/shared';

import { Badge } from '@/components/ui';

import { STATUS_LABELS, STATUS_TONES, formatDate, formatMoney } from './status-ladder';
import styles from './MattersList.module.css';

/**
 * The matters LIST — the same rows the board holds, in one scannable column.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND VIEW EXISTS AT ALL.
 *
 * The board is the right shape for "where is everything in the pipeline" and
 * the wrong shape for "what closes next" — seven columns do not fit a laptop,
 * so it scrolls sideways and comparing two matters means scrolling between
 * them. The list answers the second question without moving: one row each,
 * sorted, every field in the same place.
 *
 * Neither replaces the other, which is why this is a toggle and not a
 * migration.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The whole row is a link, not a div with an onClick. Middle-click, cmd-click,
 * open-in-new-tab and the status-bar preview are how people actually work a
 * caseload, and every one of them comes free from the element or not at all —
 * the same reasoning that made `Tabs` links and finally gave `Card` an `href`.
 */
export function MattersList({ rows }: { rows: Transaction[] }): React.JSX.Element {
  return (
    <div className={styles.wrap} data-testid="transaction-list">
      {/*
        A real <table>. Screen readers announce row and column position from it,
        and a grid of divs has to reimplement all of that with roles — badly,
        usually. The visual layout is grid; the semantics are the table's.
      */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.th}>
              Matter
            </th>
            <th scope="col" className={styles.th}>
              Status
            </th>
            <th scope="col" className={styles.th}>
              Closing
            </th>
            <th scope="col" className={`${styles.th} ${styles.right}`}>
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className={styles.row} data-transaction-id={t.id} data-status={t.status}>
              <td className={styles.cell}>
                {/*
                  The link wraps the identity cell rather than the row: an <a>
                  cannot contain <td>s, and stretching it over the row with a
                  pseudo-element is what makes text unselectable. This keeps
                  selection working and still gives the whole identity block —
                  the part people aim at — real link behaviour.
                */}
                <a href={`/transactions/${t.id}`} className={styles.link}>
                  <span className={styles.title}>{t.title}</span>
                  <span className={`${styles.meta} tabular`}>
                    {t.transactionNumber} · {t.propertyAddress}
                  </span>
                </a>
              </td>
              <td className={styles.cell}>
                <Badge tone={STATUS_TONES[t.status]}>{STATUS_LABELS[t.status]}</Badge>
              </td>
              <td className={`${styles.cell} ${styles.dim} tabular`}>{formatDate(t.closingDate)}</td>
              <td className={`${styles.cell} ${styles.right} tabular`}>{formatMoney(t.purchasePrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
