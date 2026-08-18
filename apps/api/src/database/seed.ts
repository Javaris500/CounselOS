import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { PG_CLIENT_OPTIONS } from './database.module';
import * as schema from './schema';

/**
 * The Austin fixtures (11-test-data.md Part 3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO THINGS THIS FILE EXPORTS, AND WHY
 *
 * SEED_IDS   Every fixture has a fixed UUID. Playwright imports these rather
 *            than hardcoding a UUID or clicking through the UI to find a
 *            fixture — a test that navigates to find its own data is testing
 *            navigation, and it breaks the moment the list order changes.
 *
 * SEED_ANCHOR  Deadlines are seeded RELATIVE to this fixed instant, not to
 *            now(). Urgency tiers are the whole point of the deadline surface,
 *            so the fixtures have to sit at known distances from "today" — but
 *            if that were the real today, every assertion would drift daily.
 *            A test asserting urgency pins its clock to SEED_ANCHOR with
 *            page.clock.setFixedTime() and the two agree by construction.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Real Austin data throughout — Independence Title on S Lamar, UFCU, Realty
 * Austin, prices inside the documented neighborhood bands. Fake names, real
 * market. A demo that quotes a plausible East Austin price to a real estate
 * attorney reads very differently from one that says $500,000.
 *
 * NOT idempotent on its own — it inserts, it does not upsert. `pnpm db:reset`
 * runs reset.ts first, which truncates; that pairing is the supported way to
 * re-seed. Running this twice without a reset fails on a duplicate key, which
 * is the correct and loud outcome.
 */

/** The instant every relative date below is measured from. Pin clocks to this. */
export const SEED_ANCHOR = new Date('2026-06-15T09:00:00.000-05:00');

const days = (n: number): Date => new Date(SEED_ANCHOR.getTime() + n * 24 * 60 * 60 * 1000);

/** Fixed UUIDs. Import these in tests; never retype one. */
export const SEED_IDS = {
  firm: '00000000-0000-4000-8000-000000000001',
  users: {
    owner: '00000000-0000-4000-8000-000000000010',
    attorney: '00000000-0000-4000-8000-000000000011',
    paralegal: '00000000-0000-4000-8000-000000000012',
    /** Deactivated. Proves the USER_INACTIVE path without touching a live user. */
    inactive: '00000000-0000-4000-8000-000000000013',
  },
  /**
   * Supabase Auth UUIDs — the `sub` claim of an access token, and what
   * `users.auth_id` is matched against on every authenticated request.
   *
   * Fixed rather than null so tests can mint a token for a known identity. In
   * production these are real Supabase UUIDs, written by the first-login link
   * in AuthService; seeding them just means the demo firm arrives pre-linked.
   */
  authIds: {
    owner: '00000000-0000-4000-8000-0000000000a0',
    attorney: '00000000-0000-4000-8000-0000000000a1',
    paralegal: '00000000-0000-4000-8000-0000000000a2',
    inactive: '00000000-0000-4000-8000-0000000000a3',
  },
  transactions: {
    manorRd: '00000000-0000-4000-8000-000000000020',
    clawsonRd: '00000000-0000-4000-8000-000000000021',
    sCongress: '00000000-0000-4000-8000-000000000022',
    annieSt: '00000000-0000-4000-8000-000000000023',
  },
  deadlines: {
    financingContingency: '00000000-0000-4000-8000-000000000030',
    titleCommitment: '00000000-0000-4000-8000-000000000031',
    closingDate: '00000000-0000-4000-8000-000000000032',
  },
  lead: '00000000-0000-4000-8000-000000000040',
} as const;

async function seed(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    throw new Error('db:seed refuses to run in production.');
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');

  const client = postgres(url, { ...PG_CLIENT_OPTIONS, max: 1 });
  const db = drizzle(client, { schema });

  try {
    await db.insert(schema.firms).values({
      id: SEED_IDS.firm,
      name: 'Rodriguez & Associates',
      slug: 'rodriguez-associates',
      state: 'TX',
      city: 'Austin',
      timezone: 'America/Chicago',
      settings: { intakeEnabled: true, clientPortalEnabled: true, alertEmailEnabled: true },
    });

    // auth_id is seeded rather than left null, so an E2E can mint a token for a
    // known identity. Real users are linked on first login by AuthService.
    await db.insert(schema.users).values([
      {
        id: SEED_IDS.users.owner,
        firmId: SEED_IDS.firm,
        authId: SEED_IDS.authIds.owner,
        role: 'OWNER',
        email: 'elena@rodriguezlaw.test',
        fullName: 'Elena Rodriguez',
        barNumber: '24085512',
      },
      {
        id: SEED_IDS.users.attorney,
        firmId: SEED_IDS.firm,
        authId: SEED_IDS.authIds.attorney,
        role: 'ATTORNEY',
        email: 'james@rodriguezlaw.test',
        fullName: 'James Okafor',
        barNumber: '24102847',
      },
      {
        id: SEED_IDS.users.paralegal,
        firmId: SEED_IDS.firm,
        authId: SEED_IDS.authIds.paralegal,
        role: 'PARALEGAL',
        email: 'sarah@rodriguezlaw.test',
        fullName: 'Sarah Kim',
      },
      {
        id: SEED_IDS.users.inactive,
        firmId: SEED_IDS.firm,
        authId: SEED_IDS.authIds.inactive,
        role: 'ATTORNEY',
        email: 'former@rodriguezlaw.test',
        fullName: 'Former Attorney',
        isActive: false,
      },
    ]);

    await db.insert(schema.transactions).values([
      {
        id: SEED_IDS.transactions.manorRd,
        firmId: SEED_IDS.firm,
        assignedAttorneyId: SEED_IDS.users.attorney,
        assignedParalegalId: SEED_IDS.users.paralegal,
        transactionType: 'PURCHASE',
        status: 'DUE_DILIGENCE',
        transactionNumber: 'RE-2026-0001',
        title: 'Martinez / Chen — 2847 Manor Rd',
        propertyAddress: '2847 Manor Rd',
        propertyZip: '78722',
        effectiveDate: days(-13),
        closingDate: days(17),
        purchasePrice: '615000.00',
        earnestMoneyAmount: '6150.00',
        optionFee: '250.00',
        conflictCheckStatus: 'CLEAR',
        conflictCheckCompletedAt: days(-13),
        referralSourceType: 'REALTOR',
        referralSourceName: 'James Okafor, Realty Austin',
        tags: ['first_time_buyer'],
      },
      {
        id: SEED_IDS.transactions.clawsonRd,
        firmId: SEED_IDS.firm,
        assignedAttorneyId: SEED_IDS.users.attorney,
        transactionType: 'PURCHASE',
        status: 'CLOSING_PREP',
        transactionNumber: 'RE-2026-0002',
        title: 'Washington / Rodriguez — 4102 Clawson Rd',
        propertyAddress: '4102 Clawson Rd',
        propertyZip: '78704',
        effectiveDate: days(-45),
        closingDate: days(5),
        purchasePrice: '842000.00',
        earnestMoneyAmount: '8420.00',
        optionFee: '300.00',
        conflictCheckStatus: 'CLEAR',
        referralSourceType: 'PAST_CLIENT',
        tags: ['amendment', 'extension'],
      },
      {
        id: SEED_IDS.transactions.sCongress,
        firmId: SEED_IDS.firm,
        // Deliberately NOT assigned to the paralegal — this is the matter the
        // Slice 0 gate denies her, and the denial must explain itself.
        assignedAttorneyId: SEED_IDS.users.owner,
        transactionType: 'COMMERCIAL',
        status: 'TITLE_REVIEW',
        transactionNumber: 'RE-2026-0003',
        title: 'Bright Owl Coffee — 1500 S Congress Ave, Suite 101',
        propertyAddress: '1500 S Congress Ave, Suite 101',
        propertyZip: '78704',
        effectiveDate: days(-30),
        closingDate: days(30),
        purchasePrice: '0.00',
        conflictCheckStatus: 'CLEAR',
        referralSourceType: 'ATTORNEY',
        tags: ['commercial_lease', 'restaurant'],
      },
      {
        id: SEED_IDS.transactions.annieSt,
        firmId: SEED_IDS.firm,
        assignedAttorneyId: SEED_IDS.users.attorney,
        transactionType: 'SALE',
        status: 'TITLE_REVIEW',
        transactionNumber: 'RE-2026-0004',
        title: 'Okonkwo / Hale — 802 W Annie St',
        propertyAddress: '802 W Annie St',
        propertyZip: '78704',
        effectiveDate: days(-20),
        closingDate: days(22),
        purchasePrice: '925000.00',
        earnestMoneyAmount: '9250.00',
        conflictCheckStatus: 'CLEAR',
        referralSourceType: 'REALTOR',
        tags: ['title_issue'],
      },
    ]);

    await db.insert(schema.parties).values([
      {
        transactionId: SEED_IDS.transactions.manorRd,
        firmId: SEED_IDS.firm,
        role: 'BUYER',
        type: 'PERSON',
        name: 'Sofia Martinez',
        email: 'sofia.martinez@example.test',
        phone: '+15125550142',
      },
      {
        transactionId: SEED_IDS.transactions.manorRd,
        firmId: SEED_IDS.firm,
        role: 'SELLER',
        type: 'PERSON',
        name: 'David and Linda Chen',
      },
      {
        transactionId: SEED_IDS.transactions.manorRd,
        firmId: SEED_IDS.firm,
        role: 'TITLE_COMPANY',
        type: 'ORGANIZATION',
        name: 'Independence Title',
        companyName: 'Independence Title',
        address: '3005 S Lamar Blvd, Austin, TX 78704',
        notes: 'File #2026-04821',
      },
      {
        transactionId: SEED_IDS.transactions.manorRd,
        firmId: SEED_IDS.firm,
        role: 'LENDER',
        type: 'ORGANIZATION',
        name: 'University Federal Credit Union',
        companyName: 'UFCU',
        address: '3720 N Interstate Hwy 35, Austin, TX 78722',
        notes: 'Loan officer Marcus Webb · $492,000 conventional, 80% LTV',
      },
      {
        transactionId: SEED_IDS.transactions.manorRd,
        firmId: SEED_IDS.firm,
        role: 'BUYERS_AGENT',
        type: 'PERSON',
        name: 'James Okafor',
        companyName: 'Realty Austin',
      },
      {
        transactionId: SEED_IDS.transactions.manorRd,
        firmId: SEED_IDS.firm,
        role: 'SELLERS_AGENT',
        type: 'PERSON',
        name: 'Patricia Nguyen',
        companyName: 'Compass Austin',
      },
    ]);

    /**
     * Three deadlines spanning three states, so every branch of the deadline
     * surface has data: an ACTIVE one inside the WARNING band, a COMPLETED one,
     * and an ACTIVE one far enough out to be INFO.
     *
     * Each carries its calculation note and source link — the trust surface. A
     * deadline without them renders as a bare date, which the Deadlines agent
     * is explicitly forbidden from shipping.
     */
    await db.insert(schema.deadlines).values([
      {
        id: SEED_IDS.deadlines.financingContingency,
        transactionId: SEED_IDS.transactions.manorRd,
        firmId: SEED_IDS.firm,
        confirmedById: SEED_IDS.users.attorney,
        type: 'FINANCING_CONTINGENCY',
        status: 'ACTIVE',
        urgency: 'WARNING',
        title: 'Financing Contingency Deadline',
        dueAt: days(8),
        dayType: 'CALENDAR',
        rollRule: 'NEXT_BUSINESS_DAY',
        calculationNote:
          '21 calendar days from the effective date. Rolls to the next business day.',
        isAutoExtracted: true,
        sourcePage: 3,
        sourceText:
          'Buyer shall have twenty-one (21) days from the Effective Date to obtain financing approval.',
        extractionConfidence: '0.94',
        confirmedAt: days(-12),
      },
      {
        id: SEED_IDS.deadlines.titleCommitment,
        transactionId: SEED_IDS.transactions.manorRd,
        firmId: SEED_IDS.firm,
        confirmedById: SEED_IDS.users.attorney,
        type: 'TITLE_COMMITMENT_DEADLINE',
        status: 'COMPLETED',
        urgency: 'INFO',
        title: 'Title Commitment Deadline',
        dueAt: days(7),
        dayType: 'CALENDAR',
        rollRule: 'NONE',
        calculationNote: '20 calendar days from the effective date.',
        isAutoExtracted: true,
        sourcePage: 4,
        sourceText:
          'Title Company shall deliver the Commitment within 20 days of the Effective Date.',
        extractionConfidence: '0.91',
        confirmedAt: days(-12),
        completedAt: days(-3),
      },
      {
        id: SEED_IDS.deadlines.closingDate,
        transactionId: SEED_IDS.transactions.manorRd,
        firmId: SEED_IDS.firm,
        confirmedById: SEED_IDS.users.attorney,
        type: 'CLOSING_DATE',
        status: 'ACTIVE',
        urgency: 'INFO',
        title: 'Closing Date',
        dueAt: days(17),
        dayType: 'CALENDAR',
        rollRule: 'NEXT_BUSINESS_DAY',
        calculationNote: 'Stated closing date in the contract.',
        isAutoExtracted: true,
        sourcePage: 1,
        sourceText: 'The Closing Date shall be July 2, 2026.',
        extractionConfidence: '0.98',
        confirmedAt: days(-12),
      },
    ]);

    await db.insert(schema.leads).values({
      id: SEED_IDS.lead,
      firmId: SEED_IDS.firm,
      leadStatus: 'NEW',
      firstName: 'Priya',
      lastName: 'Raghavan',
      email: 'priya.raghavan@example.test',
      phone: '+15125550188',
      transactionType: 'PURCHASE',
      propertyAddress: '1207 Alta Vista Ave, Austin, TX 78704',
      inquiryDescription:
        'First-time buyer under contract in Bouldin Creek. Option period ends in a week and I need someone to review the contract and the HOA addendum.',
      source: 'intake_form',
      referralSourceType: 'WEB_SEARCH',
      conflictCheckStatus: 'PENDING',
    });

    /**
     * Texas and federal holidays the TREC engine reads to apply roll rules.
     * `date` is a Postgres `date`, so these are 'YYYY-MM-DD' strings and carry
     * no timezone — a holiday is a calendar day, not an instant.
     */
    await db.insert(schema.holidays).values([
      { name: "New Year's Day", jurisdiction: 'FEDERAL', date: '2026-01-01' },
      { name: 'Martin Luther King Jr. Day', jurisdiction: 'FEDERAL', date: '2026-01-19' },
      { name: "Presidents' Day", jurisdiction: 'FEDERAL', date: '2026-02-16' },
      { name: 'Memorial Day', jurisdiction: 'FEDERAL', date: '2026-05-25' },
      { name: 'Juneteenth', jurisdiction: 'FEDERAL', date: '2026-06-19' },
      { name: 'Independence Day', jurisdiction: 'FEDERAL', date: '2026-07-03' },
      { name: 'Labor Day', jurisdiction: 'FEDERAL', date: '2026-09-07' },
      { name: 'Veterans Day', jurisdiction: 'FEDERAL', date: '2026-11-11' },
      { name: 'Thanksgiving', jurisdiction: 'FEDERAL', date: '2026-11-26' },
      { name: 'Day After Thanksgiving', jurisdiction: 'TX_STATE', date: '2026-11-27' },
      { name: 'Christmas Day', jurisdiction: 'FEDERAL', date: '2026-12-25' },
    ]);

    // console.warn, not .log — base.js allows only warn and error, and a CLI
    // script that reports nothing is indistinguishable from one that silently
    // did nothing. reset.ts reports the same way.
    console.warn(
      `Seeded 1 firm · 4 users · 4 transactions · 6 parties · 3 deadlines · 1 lead · 11 holidays`,
    );
  } finally {
    await client.end();
  }
}

/**
 * Only runs when invoked as a script (`pnpm db:seed`).
 *
 * Without this guard, importing SEED_IDS executes the seed as a side effect —
 * so a Playwright spec doing `import { SEED_IDS } from '.../seed'` would write
 * to the database just by being loaded. Module scope is not a place to do I/O.
 */
if (require.main === module) {
  void seed().catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  });
}
