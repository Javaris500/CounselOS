'use client';

import { EmptyState } from '@/components/ui';

import { PARTY_ROLE_LABELS } from './status-ladder';
import type { Party } from './transaction.types';
import styles from './PartiesList.module.css';

/**
 * Everyone on the matter.
 *
 * Grouped by role because that is how an attorney looks a party up — "who is
 * the title company on this?" rather than "who is fourth in the list". `notes`
 * is rendered inline: for a LENDER it holds the loan number and rate, for a
 * TITLE_COMPANY the file number and closer, and that is the field someone is
 * actually reaching for when they open this.
 */
export function PartiesList({ parties }: { parties: Party[] }): React.JSX.Element {
  if (parties.length === 0) {
    return (
      <EmptyState
        title="No parties recorded"
        description="Buyers, sellers, agents, title, lender — adding them is what makes “every matter where Independence Title closed” answerable later."
      />
    );
  }

  return (
    <ul className={styles.list} data-testid="transaction-parties">
      {parties.map((party) => (
        <li key={party.id} className={styles.party} data-party-role={party.role}>
          <div className={styles.head}>
            <span className={styles.role}>{PARTY_ROLE_LABELS[party.role] ?? party.role}</span>
            <span className={styles.name}>{party.name}</span>
          </div>

          {party.companyName === null ? null : (
            <p className={styles.company}>{party.companyName}</p>
          )}

          <div className={styles.contact}>
            {party.email === null ? null : (
              <a href={`mailto:${party.email}`} className={styles.link}>
                {party.email}
              </a>
            )}
            {party.phone === null ? null : <span className="tabular">{party.phone}</span>}
            {party.licenseNumber === null ? null : (
              <span className="tabular">Lic. {party.licenseNumber}</span>
            )}
          </div>

          {party.notes === null ? null : <p className={styles.notes}>{party.notes}</p>}
        </li>
      ))}
    </ul>
  );
}
