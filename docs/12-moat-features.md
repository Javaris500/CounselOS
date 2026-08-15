# CounselOS — Moat Features Specification
### Wire-Fraud Verification & TREC Business-Day Deadline Engine

> These two features came out of the deep research as the highest-impact additions available. Both plug into infrastructure that already exists — neither is greenfield. Wire-fraud verification rides on the document pipeline, communication log, and activity log. The deadline engine upgrades the extraction you already do. This document specifies both, and the alignment edits to schema, checklist, and project prompt follow from it.
>
> **Priority:** These are what the research called "speed to depth in real-estate-specific logic" — the moat no incumbent owns.
>
> **They ship at different times.** The **TREC deadline engine (M1) ships with Module 6 in slice 3**, because slice 3's Playwright gate requires the earnest-money vs option-fee divergence to render — the slice cannot close without it. It is a correctness upgrade to extraction you're already building, not an add-on. **Wire-fraud verification (M2) is the one that waits** until Phase 1 core is E2E-green and the pilot firm is live. See `01-codebase.md` Part 3.

---

# Feature 1 — Wire-Fraud Verification

## Why It Exists

Real estate wire fraud caused **$275.1M in losses across 12,368 complaints in 2025** (FBI IC3), growing year over year, increasingly AI-enabled (deepfake voice, AI-written emails). It is the single largest catastrophic-loss vector in a real estate practice. Even when the firm is not the settlement agent, it is an impersonation target and the party clients look to for protection. Preventing one incident justifies the entire product to a firm.

## How It Matches Existing Architecture

This is mostly new logic riding on infrastructure that already exists:

| Existing feature | What it already gives us |
|---|---|
| Document pipeline | Already extracts text and structured fields; already classifies CLOSING_DISCLOSURE and CORRESPONDENCE |
| Communication log | Already captures title company calls and emails |
| Activity log | Already provides the immutable audit trail this feature legally requires |
| Parties table | Already stores the title company as a party with a role |
| SSE alert system | Already delivers CRITICAL alerts (deadline alerts use it) |
| Client access token pattern | Already establishes hash-not-plaintext storage convention |

**What is genuinely new:** a verified-instructions store and a comparison-and-block workflow.

## Schema Additions

```typescript
// New enum
export const wireVerificationMethodEnum = pgEnum('wire_verification_method', [
  'PHONE',        // called a known number and confirmed
  'IN_PERSON',    // confirmed face to face
  'SECURE_PORTAL', // confirmed via title company's verified portal
])

// New table
export const verifiedWireInstructions = pgTable('verified_wire_instructions', {
  id:              uuid('id').primaryKey().defaultRandom(),
  transactionId:   uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:          uuid('firm_id').notNull().references(() => firms.id),
  // The party these instructions belong to (usually the title company)
  partyId:         uuid('party_id').references(() => parties.id),
  verifiedById:    uuid('verified_by_id').notNull().references(() => users.id),

  // Institution these instructions route to
  institutionName: text('institution_name').notNull(),  // "Independence Title / Wells Fargo"
  // Store routing in full (it is not secret — it is public bank data)
  routingNumber:   text('routing_number').notNull(),
  // NEVER store the full account number. Only last 4 for display + a hash for comparison.
  accountLast4:    text('account_last4').notNull(),
  accountHash:     text('account_hash').notNull(),  // SHA-256 of full account number

  verificationMethod: wireVerificationMethodEnum('verification_method').notNull(),
  // Free text: "Called Maria Webb at 512-555-0100 (number from title commitment), confirmed"
  verificationNotes:  text('verification_notes'),

  // Is this the current trusted baseline? Only one active baseline per party per transaction.
  isActive:        boolean('is_active').notNull().default(true),

  verifiedAt:      timestamp('verified_at').notNull().defaultNow(),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  deletedAt:       timestamp('deleted_at'),
}, (table) => ({
  transactionPartyIdx: index('verified_wire_instructions_transaction_party_idx')
    .on(table.transactionId, table.partyId),
}))

// New table — every flag raised, for the audit trail
export const wireFlagEvents = pgTable('wire_flag_events', {
  id:              uuid('id').primaryKey().defaultRandom(),
  transactionId:   uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:          uuid('firm_id').notNull().references(() => firms.id),
  // The document or communication that triggered the flag
  sourceDocumentId: uuid('source_document_id').references(() => documents.id),

  // What was detected vs. what was on file
  detectedRoutingNumber: text('detected_routing_number'),
  detectedAccountLast4:  text('detected_account_last4'),
  // 'NO_BASELINE' (first time seeing instructions) | 'MISMATCH' (differs from baseline)
  flagType:        text('flag_type').notNull(),

  // Set when an attorney resolves the flag
  resolvedById:    uuid('resolved_by_id').references(() => users.id),
  // 'VERIFIED_LEGITIMATE' | 'CONFIRMED_FRAUD' | 'DISMISSED'
  resolution:      text('resolution'),
  resolutionNotes: text('resolution_notes'),
  resolvedAt:      timestamp('resolved_at'),

  createdAt:       timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  transactionIdx: index('wire_flag_events_transaction_id_idx').on(table.transactionId),
}))
```

**Storage security note:** routing numbers are public bank data — store them in full. Account numbers are sensitive — store only the last 4 for display and a SHA-256 hash for comparison, matching the client-access-token convention already in the schema.

## Where It Plugs In

- **Document processing worker** — after a document classified CLOSING_DISCLOSURE or CORRESPONDENCE reaches READY, run wire-instruction extraction. If routing/account details are present, run the comparison.
- **Communication log** — when an attorney logs a communication flagged as involving wire instructions, prompt to verify.
- **SSE alerts** — a mismatch fires a CRITICAL alert through the existing channel.
- **Activity log** — every verification and every flag writes an immutable record.

## Detection & Comparison Logic

```
On document READY (type CLOSING_DISCLOSURE or CORRESPONDENCE):
  1. Extract routing number + account number if present
     (deterministic regex for routing/account patterns, confidence-scored)
  2. If none found → done, no action
  3. If found:
     a. Look up active verified baseline for this transaction + party
     b. NO baseline exists → create wire_flag_event (flagType: NO_BASELINE)
        → CRITICAL alert: "Unverified wire instructions detected. Verify by
           phone using a known number before trusting these."
     c. Baseline exists AND routing + accountHash match → no flag, safe
     d. Baseline exists AND anything differs → create wire_flag_event
        (flagType: MISMATCH)
        → CRITICAL alert + block-and-confirm UI:
          "The wire instructions in this document differ from the verified
           instructions on file for {institution}. Do NOT proceed until you
           confirm by phone using a known number."
```

Deliberately conservative — unverified instructions always prompt verification, never auto-trust. False positives cost the attorney a phone call; false negatives cost a client $400,000.

## Endpoints

```
POST   /v1/transactions/:id/wire-instructions/verify
       — attorney records verified instructions. Body: partyId, institutionName,
         routingNumber, accountNumber (hashed server-side, never stored raw),
         verificationMethod, verificationNotes.
       — deactivates any prior baseline for this party, sets new one active.

GET    /v1/transactions/:id/wire-instructions
       — list verified instructions (accountLast4 only, never full account)

GET    /v1/transactions/:id/wire-flags
       — list all flag events, resolved and unresolved

POST   /v1/transactions/:id/wire-flags/:flagId/resolve
       — attorney resolves a flag. Body: resolution
         (VERIFIED_LEGITIMATE | CONFIRMED_FRAUD | DISMISSED), resolutionNotes.
       — if VERIFIED_LEGITIMATE, optionally promote the detected instructions
         to the new active baseline.
```

## User Flow

**First-time setup for a title company.** The attorney adds Independence Title as a party. The first wire instructions arrive on a title commitment; CounselOS extracts them, finds no baseline, and prompts: *"No verified wire instructions on file for Independence Title. Verify by calling a known number before trusting these."* The attorney calls a number they already trust — not one from the email — confirms routing and account, and records it as verified by phone. That becomes the baseline.

**The moment the feature earns its existence.** Two weeks later a new email appears to be from Independence Title with updated wire instructions. The attorney uploads it. The pipeline extracts the new routing number, compares against the verified baseline — mismatch. Before the attorney can act, a CRITICAL banner: *"The wire instructions in this document differ from the verified instructions on file for Independence Title. Do NOT proceed until you confirm by phone using a known number."* The attorney calls, discovers the email was fraud, and a $400,000 wire never leaves. That is the entire product justified in one moment.

**Ongoing.** Every verified set becomes the baseline. Any later change triggers block-and-confirm. The attorney can view the full verification and flag history on the transaction.

## Build-vs-Integrate Note

The research flagged CertifID (Austin-based, up to $5M/file insurance, integrates with SoftPro/Qualia/Settlor) and ClosingLock as mature partners. The spec above is the **build** path, which keeps the data and workflow inside CounselOS. A future option is to integrate CertifID's API for the verification + insurance layer while keeping the detection and audit trail native. Decide based on whether the pilot firm values the insurance backing enough to warrant a third-party dependency.

---

# Feature 2 — TREC Business-Day Deadline Engine

## Why It Exists

Texas TREC contracts run on strict deadlines with counting rules that firms get wrong by hand. The research surfaced the specific trap: the **earnest-money deadline rolls to the next business day if it lands on a weekend or holiday, but the option-fee deadline does not roll.** Get one wrong and a client can forfeit their option or their earnest money. Texas courts enforce these deadlines as written. This turns your existing extraction into a genuine safety net.

## How It Matches Existing Architecture

This is a **direct upgrade to a feature you already have**, not a new module. You already extract deadlines and stage them as PENDING_REVIEW. You already have amendment superseding. What's missing is correct date math — right now the extracted date is whatever Claude returned, unvalidated. The engine sits between extraction and confirmation.

| Existing feature | How the engine extends it |
|---|---|
| Deadline extraction | Engine converts Claude's relative deadline into a correct absolute date |
| Urgency calculator | Engine lives beside it as another pure, unit-tested function |
| Amendment superseding | When the effective date changes, engine recomputes; superseding chain tracks it |
| PENDING_REVIEW staging | Unchanged — computed deadline still stages for attorney confirmation |
| Tiered alerts | Unchanged — fire off the corrected dates |

## Schema Additions

```typescript
// New table — Texas state + federal holidays, maintained years forward
export const holidays = pgTable('holidays', {
  id:           uuid('id').primaryKey().defaultRandom(),
  date:         timestamp('date').notNull(),
  name:         text('name').notNull(),           // "Juneteenth", "Thanksgiving"
  // FEDERAL | TX_STATE | COUNTY
  jurisdiction: text('jurisdiction').notNull(),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  dateIdx: index('holidays_date_idx').on(table.date),
}))
```

Add three columns to the existing `deadlines` table to record how each date was computed (so the attorney sees the reasoning):

```typescript
// Added to deadlines table:
  // How this deadline was counted — shown to the attorney for trust
  dayType:        text('day_type'),        // CALENDAR | BUSINESS | TREC_DAYS
  rollRule:       text('roll_rule'),       // NONE | NEXT_BUSINESS_DAY | PREVIOUS_BUSINESS_DAY
  // Human-readable calculation note: "7 calendar days from effective date (June 2) = June 9"
  calculationNote: text('calculation_note'),
```

## The Core Function

```typescript
// src/modules/deadlines/deadline-calculator.ts
// Pure function. No I/O. Exhaustively unit-tested against every Texas holiday
// and every boundary for a decade forward. This is the moat — correctness.

type DayType = 'CALENDAR' | 'BUSINESS' | 'TREC_DAYS'
type RollRule = 'NONE' | 'NEXT_BUSINESS_DAY' | 'PREVIOUS_BUSINESS_DAY'

interface DeadlineComputation {
  dueAt: Date
  calculationNote: string
}

function computeDeadline(
  effectiveDate: Date,
  offsetDays: number,
  dayType: DayType,
  rollRule: RollRule,
  holidays: Set<string>,  // ISO date strings
): DeadlineComputation {
  // TREC rule: effective date is "day zero" — counting starts the next day
  // CALENDAR: count every day including weekends/holidays
  // BUSINESS: skip weekends and holidays while counting
  // TREC_DAYS: TREC-specific counting (calendar days, but with roll rules)
  //
  // After landing on the target date, apply the roll rule:
  //   NONE                → keep the date even if it's a weekend/holiday
  //                         (this is the OPTION FEE rule — it does NOT roll)
  //   NEXT_BUSINESS_DAY   → if weekend/holiday, roll forward
  //                         (this is the EARNEST MONEY rule — it DOES roll)
  //   PREVIOUS_BUSINESS_DAY → roll backward if weekend/holiday
  //
  // Returns the computed date AND a human-readable note explaining the count.
}
```

**The test suite is the deliverable.** Every Texas holiday, every leap year, every boundary (deadline landing exactly on a Saturday, a Sunday, Juneteenth), and the critical divergence: earnest-money vs option-fee on the same weekend producing two different dates.

## Deadline Type → Counting Rule Map

```
OPTION_PERIOD_EXPIRY      CALENDAR   NONE                (does not roll)
OPTION_FEE_DELIVERY       TREC_DAYS  NONE                (3 days, does NOT roll — the trap)
EARNEST_MONEY_DELIVERY    TREC_DAYS  NEXT_BUSINESS_DAY   (3 days, DOES roll)
FINANCING_CONTINGENCY     CALENDAR   NEXT_BUSINESS_DAY
INSPECTION_DEADLINE       CALENDAR   NEXT_BUSINESS_DAY
TITLE_COMMITMENT_DEADLINE CALENDAR   NEXT_BUSINESS_DAY
CLOSING_DATE              CALENDAR   NEXT_BUSINESS_DAY
```

Two new deadline types are added: `OPTION_FEE_DELIVERY` and `EARNEST_MONEY_DELIVERY` (see enum change below).

## Where It Plugs In

- **Extraction service** — after Claude returns a relative deadline, call `computeDeadline()` to produce the correct absolute date and note, instead of trusting Claude's arithmetic.
- **Deadline staging** — the computed deadline stages as PENDING_REVIEW with its `calculationNote` visible, so the attorney sees the math.
- **Amendment superseding** — when an amendment changes the effective date, recompute every deadline derived from it; the existing superseding chain records the change.

## User Flow

**Normal path.** The attorney uploads the purchase agreement. Extraction pulls the deadlines; the engine computes them correctly. Each is staged with its calculation shown: *"Option Period Expiry — 7 calendar days from effective date (June 2) = June 9."* The attorney sees the math, confirms, the deadline goes active.

**The trap the engine catches.** Without this, an attorney might roll both the earnest-money and option-fee deadlines to Monday because that's intuitive. The engine knows earnest money rolls and the option fee does not, so it stages the option-fee deadline on Saturday with a note: *"Option fee delivery — 3 days from effective date. TREC rule: option fee deadline does not extend for weekends. Due Saturday, June 5."* The attorney sees two dates that look inconsistent, reads why, and trusts it because the reasoning is shown.

**Amendment path.** An amendment moves the effective date back three days. The attorney uploads it. The engine recomputes every derived deadline; the superseding logic marks the old ones superseded and creates the new set. The attorney reviews the recalculated deadlines instead of manually adjusting eight dates.

---

# Alignment Summary

These edits are applied to the other docs:

**Schema (`03-schema.md`)**
- Add `wireVerificationMethodEnum`
- Add `verified_wire_instructions` table
- Add `wire_flag_events` table
- Add `holidays` table
- Add `OPTION_FEE_DELIVERY` and `EARNEST_MONEY_DELIVERY` to `deadlineTypeEnum`
- Add `dayType`, `rollRule`, `calculationNote` columns to `deadlines`
- Add relations + type exports for the new tables

**Checklist (`05-backend-checklist.md`)**
- New Layer 6G — TREC Deadline Calculation Engine
- New Layer 8F — Wire-Fraud Verification
- Both marked as post-core Phase 1 moat features

**Project Prompt (`15-project-context.md`)**
- Add both to the Phase 1 feature list under a "Moat Features" note

*These two features are where CounselOS stops being "case management with AI" and becomes something a Texas real estate firm cannot safely practice without.*
