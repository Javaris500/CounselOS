# CounselOS — Test Data Brief
### Phase 1: Austin, Texas Real Estate Transactions

> **Phase 1 focus:** All test data is built around real estate transactions. The 5 test transactions below cover the full range of real estate scenarios your pipeline will encounter. PI test data is documented at the bottom under `[PHASE 2]` — don't build it now.

---

## Part 1 — Where to Get Real Estate Test Data

### Source 1 — Travis County Appraisal District (TCAD)
URL: tcad.org/property-search

Free public property search. Search any Austin address and get: legal description, lot size, improvement value, land value, ownership history, exemptions, and deed information. Use this to generate realistic property details for your test transactions. Pull 10–15 real Austin property records across different neighborhoods and property types.

### Source 2 — Travis County Clerk Public Records
URL: countyclerk.traviscountytx.gov/recording/property-records

Free access to recorded deeds, deeds of trust, releases, and easements. Download real Austin deed documents, warranty deeds, and deeds of trust as PDFs. These are the exact document formats your pipeline will process in production. Pull 5–10 real recorded instruments — they make perfect document pipeline test fixtures.

### Source 3 — Texas Real Estate Commission (TREC) Standard Forms
URL: trec.texas.gov/forms

TREC publishes all standard Texas real estate contract forms as free PDFs. Download the current versions of: One to Four Family Residential Contract (Form 20-17), Commercial Contract (Form 9-14), Residential Lease (Form 16-5), Amendment (Form 39-8), and all addenda. These are the exact forms your deadline extraction module needs to handle. Real formatting, real field names, real deadline language.

### Source 4 — Austin Board of Realtors (ABoR) Market Data
URL: abor.com/market-statistics

Free monthly Austin market reports with median sale prices by zip code, average days on market, list-to-sale price ratios, and inventory levels. Use this to make your test transaction prices realistic by neighborhood.

### Source 5 — Synthetic Documents Grounded in Real Data
Once you have real property data and TREC form formats, use Claude to generate realistic synthetic transactions using real Austin addresses, real title company names, real lender names, and real agent names. Legal and privacy-safe while giving you realistic documents to test against.

---

## Part 2 — Real Austin Real Estate Data to Hardcode into Seed Files

### Real Austin Title Companies (seed into Party records)
- Investors Title Company — 8310 N Capital of Texas Hwy, Austin, TX 78731
- Austin Title Company — 3933 Steck Ave, Austin, TX 78759
- Independence Title — 3005 S Lamar Blvd, Austin, TX 78704 (multiple Austin locations)
- Stewart Title of Austin — 3500 Jefferson St, Austin, TX 78731
- Chicago Title of Texas — 4301 Westbank Dr, Austin, TX 78746
- First American Title — 7320 N MoPac Expy, Austin, TX 78731

### Real Austin Lenders (seed into Party records)
- University Federal Credit Union (UFCU) — 3720 N Interstate Hwy 35, Austin, TX 78722
- Amplify Credit Union — 6800 Burleson Rd, Austin, TX 78744
- Frost Bank Mortgage — 401 Congress Ave, Austin, TX 78701
- HomeStreet Bank Austin — common Austin purchase lender
- Veterans United Home Loans — strong Austin military family presence
- Rocket Mortgage — common in Austin market

### Real Austin Real Estate Brokerages (seed into Agent Party records)
- Realty Austin — largest independent Austin brokerage
- Kuper Sotheby's International Realty — luxury and central Austin
- Moreland Properties — South Austin and Travis Heights
- Compass Austin — tech corridor and central
- Keller Williams Realty Austin — high volume residential

### Austin Neighborhood Price Ranges (for realistic transaction amounts)
Use these to seed realistic purchase prices in test transactions.

| Neighborhood | Typical Price Range | Property Type |
|---|---|---|
| Travis Heights / South Congress | $650K – $1.2M | Single family, bungalows |
| Mueller | $450K – $750K | New construction, townhomes |
| East Austin (78702) | $500K – $950K | Renovated bungalows, new builds |
| Tarrytown / Pemberton Heights | $900K – $2.5M | Established luxury |
| Circle C Ranch | $380K – $650K | Suburban family homes |
| Cedar Park / Leander | $320K – $520K | Suburban, commuter |
| South Lamar / Bouldin Creek | $580K – $1.1M | Urban, walkable |
| Rollingwood | $900K – $1.8M | Established luxury near Westlake |
| Hyde Park | $550K – $900K | Central, historic |
| Domain / North Austin | $380K – $580K | Condo and townhome heavy |

### Texas Real Estate Deadline Rules to Hardcode

**Option Period**
Texas law allows buyers to purchase an unrestricted right to terminate for any reason during the option period. Typical option periods in Austin market: 7–10 days on standard residential, up to 14 days on commercial. Option fee: typically $100–$500 earnest, non-refundable. After option period expires, buyer can only exit for specific contract reasons.

**Financing Contingency**
Typically 21–30 days from effective date. If buyer cannot secure financing within this window, they can terminate and recover earnest money. This is the most commonly missed deadline in your system.

**Third Party Financing Addendum Deadline**
Tied to financing contingency. Buyer must deliver lender approval by this date or seller has right to terminate.

**Title Commitment Deadline**
Title company must deliver title commitment within specified days of effective date. Typically 20 days. Attorney reviews for exceptions, liens, and encumbrances.

**Survey Deadline**
Buyer must deliver existing survey or order new one by this date. Typically within 7 days of effective date. Survey review period follows.

**Closing Date**
The hard deadline. All parties must fund and close by this date. Extensions require signed amendment from all parties.

**Possession Date**
When buyer takes possession. Usually at closing, sometimes delayed by seller lease-back agreement.

### Texas Real Estate Specific Context

**Earnest Money**
Typically 1% of purchase price in Austin market. Held by title company. Buyer forfeits earnest money if they terminate outside contract-allowed reasons. Seller forfeits double earnest money if they breach. Critical to capture in every transaction record.

**TREC Promulgated Forms**
Texas is a TREC promulgated form state. Attorneys do not draft purchase agreements from scratch — they use TREC forms with addenda. Your document classifier must recognize TREC form numbers in headers (e.g., "TREC No. 20-17" on the One to Four Family contract).

**HOA Addendum**
Common in Austin market. Adds HOA approval contingency with its own deadline — typically 7 days. If HOA does not approve buyer, buyer can terminate. Miss this deadline and the contingency is waived.

**MUD/PID Addendum**
Required for many North and Northwest Austin properties in Municipal Utility Districts. Adds disclosure requirements and sometimes additional deadlines.

---

## Part 3 — The 5 Test Transactions

### Transaction 1 — Standard Residential Purchase, First-Time Buyer

**Transaction title:** 2847 Manor Road Purchase — Martinez / Chen
**Property:** 2847 Manor Rd, Austin, TX 78722 (East Austin, 3/2, 1,450 sqft)
**Transaction type:** PURCHASE
**Status:** DUE_DILIGENCE

**Parties:**
- Buyer: Sofia Martinez
- Seller: David and Linda Chen
- Buyer's Agent: James Okafor, Realty Austin
- Seller's Agent: Patricia Nguyen, Compass Austin
- Title Company: Independence Title, 3005 S Lamar Blvd
- Lender: UFCU, loan officer Marcus Webb
- Inspector: Austin Home Inspection Services

**Financials:**
- Purchase price: $615,000
- Earnest money: $6,150 (1%)
- Option fee: $250
- Loan amount: $492,000 (80% LTV, conventional)
- Down payment: $123,000

**Key dates:**
- Effective date: June 2, 2025
- Option period expiry: June 9, 2025 (7 days)
- Inspection deadline: June 11, 2025
- Financing contingency: June 23, 2025 (21 days)
- Title commitment deadline: June 22, 2025 (20 days)
- Survey delivery deadline: June 9, 2025 (7 days)
- Closing date: July 2, 2025
- Possession: At closing

**Active deadlines to seed:**
- Financing contingency: June 23 — WARNING urgency (7 days out from demo)
- Title commitment: June 22 — COMPLETED (commitment delivered June 12; gives a completed-deadline state to test)
- Closing date: July 2 — INFO urgency (30+ days)

**Documents to generate:**
- TREC Form 20-17 (One to Four Family Residential Contract) — signed by all parties
- Third Party Financing Addendum
- HOA Addendum (Cherrywood Neighborhood Association approval required — Manor Rd is in Cherrywood, not Mueller)
- Inspection report (Austin Home Inspection Services format)
- Independence Title commitment letter

**What this transaction tests:**
- Standard TREC form deadline extraction
- Multiple simultaneous deadline tracking
- HOA addendum deadline detection
- Financing contingency warning alert
- Document classifier identifying TREC form numbers

---

### Transaction 2 — Closing Date Extension Amendment, Deal Almost Fell Through

**Transaction title:** 4102 Clawson Rd Purchase — Washington / Rodriguez
**Property:** 4102 Clawson Rd, Austin, TX 78704 (South Lamar, 4/3, 2,100 sqft)
**Transaction type:** PURCHASE
**Status:** CLOSING_PREP

**Parties:**
- Buyer: James and Keisha Washington
- Seller: Miguel Rodriguez (estate sale)
- Buyer's Agent: Sarah Kim, Kuper Sotheby's
- Seller's Agent: Tom Bradley, Moreland Properties
- Title Company: Austin Title Company, 3933 Steck Ave
- Lender: HomeStreet Bank, loan officer Amy Clark
- Estate attorney: involved due to probate

**Financials:**
- Purchase price: $875,000
- Earnest money: $8,750
- Option fee: $500
- Loan amount: $700,000 (jumbo conventional)
- Down payment: $175,000

**Key dates:**
- Effective date: April 15, 2025
- Original closing date: May 30, 2025 (missed — probate delay)
- Amendment 1 executed: May 28, 2025 — extended closing to June 20, 2025
- Amendment 2 executed: June 18, 2025 — extended closing to July 10, 2025
- Current closing date: July 10, 2025

**Critical scenario:**
Two closing date amendments. The second amendment was executed 2 days before the prior closing date — attorney caught the expiring deadline, drafted the amendment, and got all parties signed in time. This is the scenario that proves deadline intelligence earns its keep.

**Documents to generate:**
- Original TREC Form 20-17
- Amendment 1 — Extension of Closing Date (TREC Form 39-8)
- Amendment 2 — Extension of Closing Date (TREC Form 39-8)
- Lender approval letter
- Probate court order (simplified)

**What this transaction tests:**
- Multiple amendment deadline superseding — system updates closing date when new amendment uploaded
- Near-miss deadline scenario — closing date was 2 days away when amendment was signed
- Deadline extraction from TREC Amendment Form 39-8
- Transaction intelligence chat: "what is the current closing date?" should return July 10 from Amendment 2, not the original date
- Document version awareness — later amendment takes precedence

---

### Transaction 3 — Commercial Lease, Restaurant Space

**Transaction title:** 1500 S Congress Ave Commercial Lease — Blackbird Café
**Property:** 1500 S Congress Ave, Suite 101, Austin, TX 78704 (1,800 sqft retail)
**Transaction type:** LEASE
**Status:** TITLE_REVIEW

**Parties:**
- Tenant: Blackbird Café LLC (Marcus Thompson, managing member)
- Landlord: South Congress Properties LP
- Tenant's agent: Commercial Realty Austin
- Landlord's attorney: opposing counsel
- Title Company: N/A (lease transaction)

**Lease terms:**
- Base rent: $6,500/month ($43.33/sqft/year)
- Lease term: 5 years — August 1, 2025 to July 31, 2030
- Option to renew: two 5-year options
- Tenant improvement allowance: $90,000
- Personal guarantee required: yes, Marcus Thompson personally

**Key dates:**
- Letter of intent executed: May 15, 2025
- Lease execution deadline: June 30, 2025
- Tenant improvement commencement: August 1, 2025
- Rent commencement: November 1, 2025 (4 months free for build-out)
- TABC license application deadline: July 15, 2025 (attorney to advise)

**Documents to generate:**
- Texas commercial lease agreement (40+ pages, non-TREC form)
- Letter of intent
- Personal guarantee addendum
- Tenant improvement work letter

**What this transaction tests:**
- Non-TREC document type classification — commercial lease vs residential purchase
- Long-form document extraction (40+ pages)
- Lease-specific deadline types not in TREC forms
- Transaction intelligence chat on complex commercial terms: "what is the rent commencement date?" "does the lease allow subletting?"
- Multi-page chunking and cross-page citation

---

### Transaction 4 — Residential Sale with Title Issue Found

**Transaction title:** 802 W Annie St Sale — Park / Okonkwo
**Property:** 802 W Annie St, Austin, TX 78704 (Travis Heights, 3/2, 1,650 sqft)
**Transaction type:** SALE
**Status:** TITLE_REVIEW (issue discovered)

**Parties:**
- Seller: Grace Park (our client — attorney represents seller)
- Buyer: Emeka Okonkwo
- Buyer's Agent: Realty Austin
- Seller's Agent: Moreland Properties
- Title Company: Stewart Title of Austin
- Lender: Rocket Mortgage

**Financials:**
- Sale price: $789,000
- Earnest money: $7,890

**Title issue discovered:**
Stewart Title's commitment revealed an unreleased deed of trust from 2019 — a HELOC that Grace Park paid off in 2021 but the bank (Wells Fargo) never filed a release. Attorney must obtain and file a release before closing. Bank release processing: 10–30 business days.

**Key dates:**
- Effective date: June 1, 2025
- Title commitment delivered: June 18, 2025 (today — issue just discovered)
- Title objection deadline: June 25, 2025 (7 days from commitment delivery)
- Closing date: July 15, 2025
- Release filing deadline (internal): July 1, 2025 (must file 2 weeks before closing)

**Critical deadline:** July 1 internal deadline to have release filed — 13 days from today. This is URGENT status in the system.

**Documents to generate:**
- TREC Form 20-17 (purchase agreement)
- Title commitment from Stewart Title (with Schedule C exception listing the unreleased lien)
- Wells Fargo HELOC payoff confirmation letter (2021)
- Attorney title objection letter to buyer's counsel
- Draft release of lien (for Wells Fargo to execute)

**What this transaction tests:**
- Title commitment document classification
- Title issue extraction — "unreleased deed of trust" flag
- Transaction intelligence chat: "what title exceptions are listed in the commitment?" "what is the status of the lien release?"
- Internally computed deadline (release filing) not in any contract — manually added by attorney
- Urgency escalation — July 1 is 13 days out, URGENT tier

---

### Transaction 5 — Simple Lead Intake, New Buyer Client

**Lead name:** David and Priya Patel
**Contact method:** Intake form submission via firm website, 8:32pm Sunday
**Source:** Referral from existing client (Ana Rodriguez, closed March 2025)

**Inquiry:**
First-time homebuyers. Pre-approved for $550,000 conventional loan. Looking in Mueller, Hyde Park, and East Austin. Want attorney to review purchase agreement before they sign anything. Have a showing scheduled for next Saturday. Want to move fast — Austin market is competitive.

**What they need:**
Purchase agreement review and representation through closing. Standard real estate transaction legal services.

**Lead status flow to test:**
NEW → REVIEWED → CONVERTED (when attorney accepts and creates transaction)

**Attorney notification:**
Email to assigned attorney at 8:32pm with lead name, referral source, budget, and target neighborhoods. No AI qualification for Phase 1 — attorney reviews and calls Monday morning.

**What this tests:**
- Intake form submission and lead record creation
- Email notification to attorney on new lead
- Lead dashboard appearance — new lead visible immediately
- Convert lead to transaction endpoint — once attorney accepts, creates transaction shell with buyer party already populated
- Referral source tracking

---

## Part 4 — Document Types to Generate Per Transaction

For each transaction, generate these documents using Claude with real Austin formatting. These are your document pipeline test fixtures.

**For all purchase transactions (1, 2, 4):**
- TREC Form 20-17 — One to Four Family Residential Contract (current version, real field names)
- Third Party Financing Addendum (TREC Form 40-9)
- HOA Addendum if applicable (TREC Form 36-9)
- Title commitment (Independence Title or Stewart Title format, Schedule A/B/C)
- Survey (simple plat survey format, Austin surveying company letterhead)
- Inspection report (Austin Home Inspection Services format, 25–30 pages)
- Lender approval letter (lender letterhead, loan amount, rate, term)
- Earnest money receipt from title company

**For Transaction 2 (amendment scenario):**
- TREC Amendment Form 39-8 — two versions with different closing dates
- Both amendments signed by all parties

**For Transaction 3 (commercial lease):**
- Texas commercial lease agreement (non-TREC, 40+ pages)
- Letter of intent
- Personal guarantee

**For Transaction 4 (title issue):**
- Title commitment with Schedule C exception (unreleased lien)
- Attorney title objection letter
- Wells Fargo payoff confirmation letter
- Draft lien release

**For Transaction 5 (lead only):**
- Intake form JSON payload
- Attorney notification email (generated output)

---

## Part 5 — Pre-Build Checklist

Everything you need before writing a single line of code.

### Accounts to Create Today

- [ ] Supabase project — dev instance, separate from prod. Create `documents` storage bucket, set to private.
- [ ] Upstash Redis — free tier, connection string uses `rediss://` not `redis://`
- [ ] Upstash Redis — free tier, dev instance
- [ ] Anthropic API key — test with a simple completion before building
- [ ] Voyage AI account + API key — voyage-law-2 model, free tier
- [ ] Resend account — free tier (3,000 emails/mo), verify sender domain
- [ ] GitHub repo — private, counselos-api
- [ ] Railway account — for deployment when ready

### Environment Variables — Document Before First Commit

Create `.env.example` with all of these:

```bash
# Supabase (database + auth + storage — one platform)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
SUPABASE_STORAGE_BUCKET=documents

# Database (Drizzle)
DATABASE_URL=                # postgres://... — must include ?sslmode=require

# Redis
REDIS_URL=                   # rediss:// not redis:// — TLS required

# AI
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=              # voyage-law-2 legal embeddings

# Calendar Integration (Phase 1)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=
CALENDAR_TOKEN_ENCRYPTION_KEY=   # openssl rand -base64 32 — encrypts stored OAuth tokens

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Observability
SENTRY_DSN=

# Security
HMAC_SECRET=           # generate: openssl rand -base64 32

# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000
CLIENT_PORTAL_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
FIRM_ID=               # hardcoded single firm ID for Phase 1
```

### Local Tools to Install

- [ ] LibreOffice — DOC/DOCX to PDF conversion
  - Mac: `brew install --cask libreoffice`
  - Ubuntu: `sudo apt install libreoffice`
  - Confirm working: `libreoffice --headless --convert-to pdf test.docx`
- [ ] pgvector extension — Supabase dashboard → Database → Extensions → enable `vector`
- [ ] BullMQ Board — queue visibility during dev: `npx @bull-board/cli`

### Texas Real Estate References to Bookmark

- TREC forms (all current): trec.texas.gov/forms
- TREC contract form 20-17 instructions: trec.texas.gov/contracts
- Travis County Appraisal District property search: tcad.org/property-search
- Travis County Clerk recorded documents: countyclerk.traviscountytx.gov/recording
- Austin Board of Realtors market data: abor.com/market-statistics
- Texas Property Code: statutes.capitol.texas.gov/Docs/PR/htm/PR.5.htm

### Seed Files to Create Before First API Endpoint

> Seeds live at `apps/api/src/database/seed/` and run via `pnpm --filter api db:seed`. **All IDs are hardcoded UUIDs** — see Part 6 for why this is non-negotiable for Playwright.

```
apps/api/src/database/seed/
  firm.ts              — 1 firm record
                         Name: [client firm name]
                         firm_id: hardcoded UUID, also set in FIRM_ID env var
                         practice_area: REAL_ESTATE
                         city: Austin, state: TX, timezone: America/Chicago

  users.ts             — 1 Owner/Attorney + 1 Paralegal + 4 test clients
                         Each client maps to one of the 4 test transactions

  transactions.ts      — 5 test transactions above
                         All statuses represented
                         Parties fully populated per transaction

  deadlines.ts         — All key dates per transaction as deadline records
                         Status: ACTIVE on confirmed ones, PENDING_REVIEW on unconfirmed
                         Transaction 1: financing contingency at WARNING, closing at INFO
                         Transaction 2: closing date at WARNING (July 10)
                         Transaction 4: release filing deadline at URGENT (July 1)

  leads.ts             — Transaction 5 (Patel) as a lead record
                         Status: NEW
                         Source: referral
```


---

## Part 6 — Playwright / E2E Test Data

Browser tests have requirements the domain fixtures above don't cover. Without these, Playwright tests are slow, flaky, and can't navigate directly to a known record.

### Fixed UUIDs — non-negotiable

Every seeded record uses a **hardcoded UUID**, never `defaultRandom()`. Playwright must be able to navigate straight to `/transactions/{id}` instead of clicking through the UI to find its fixture. Random IDs make every test a scavenger hunt.

Convention — readable, obviously synthetic, valid v4 shape:

```ts
// apps/api/src/database/seed/ids.ts — the single source of seeded IDs.
// Imported by BOTH the seed script and the Playwright tests.
export const SEED = {
  firm:            '00000000-0000-4000-8000-000000000001',

  users: {
    owner:         '00000000-0000-4000-8000-000000000101',  // Elena Vasquez
    attorney:      '00000000-0000-4000-8000-000000000102',  // James Okafor
    paralegal:     '00000000-0000-4000-8000-000000000103',  // Sarah Kim
    attorney2:     '00000000-0000-4000-8000-000000000104',  // unassigned — for access tests
  },

  transactions: {
    martinez:      '00000000-0000-4000-8000-000000000201',  // T1 clean purchase
    delacruz:      '00000000-0000-4000-8000-000000000202',  // T2 amendment chain
    commercial:    '00000000-0000-4000-8000-000000000203',  // T3 commercial lease
    park:          '00000000-0000-4000-8000-000000000204',  // T4 title defect
  },

  leads: { patel: '00000000-0000-4000-8000-000000000301' },
} as const
```

Playwright imports the same constants the seed uses — the test and the fixture can never drift.

### Test users — one per role, per access scenario

| Constant | Name | Role | Purpose |
|---|---|---|---|
| `owner` | Elena Vasquez | OWNER | Full access. Bypasses matter checks. |
| `attorney` | James Okafor | ATTORNEY | **Assigned** to Martinez + Park. |
| `paralegal` | Sarah Kim | PARALEGAL | **Assigned** to Martinez only. Proves paralegal isolation. |
| `attorney2` | Marcus Webb | ATTORNEY | **Assigned to nothing.** Proves read-only fallback and the explaining 403. |

`attorney2` exists solely so the matter-access tests have a subject. Without an unassigned attorney you can't test the READ_ONLY path or the `NOT_ASSIGNED` error.

All test users share password `TestPassword123!` in dev/CI only. Never in staging or production.

### Auth via `storageState` — do not log in every test

Logging in through the UI in every spec is the single largest source of slow, flaky Playwright suites. Authenticate once per role in a setup project, save the storage state, reuse it.

```ts
// playwright.config.ts
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  { name: 'owner',     dependencies: ['setup'], use: { storageState: '.auth/owner.json' } },
  { name: 'attorney',  dependencies: ['setup'], use: { storageState: '.auth/attorney.json' } },
  { name: 'paralegal', dependencies: ['setup'], use: { storageState: '.auth/paralegal.json' } },
]
```

The **login flow itself** is still tested explicitly in the Slice 0 spec — it just isn't repeated as setup for every other test.

### Reset between runs

```bash
pnpm --filter api db:reset   # truncate all tables, re-run seed, restore fixed IDs
```

Run before the Playwright suite in CI, and available locally. Tests assume a known starting state — a suite that depends on leftover data from a previous run will fail in CI and pass locally, which is the worst failure mode to debug.

**Test isolation rule:** a test that mutates shared seed data (changing a transaction's status, confirming a deadline) must either create its own record or reset afterward. Prefer creating — it's cheaper than cleanup and can't leak.

### `data-testid` — the selector contract

**This is what keeps Claude-written tests stable.** Without it, tests select on text content or CSS classes and shatter on every design change — a guaranteed problem with a new design system landing.

Convention: `data-testid="{domain}-{element}-{action?}"`, kebab-case.

```
transaction-card                 transaction-status-select
deadline-confirm-btn             deadline-calculation-note
doc-upload-dropzone              doc-status-badge
comm-quickadd-trigger            comm-quickadd-submit
draft-section-review-btn         draft-attest-checkbox
chat-input                       chat-citation-list
dashboard-deadline-list          time-entry-confirm-batch
access-denied-reason             wire-flag-critical-banner
```

**Rule: the `data-testid` is added in the same commit as the component.** Not retrofitted. A component without one is an incomplete component.

### Fixture documents for browser upload

Playwright needs real files on disk at `apps/web/e2e/fixtures/`:

| File | Purpose |
|---|---|
| `purchase-agreement-martinez.pdf` | Happy-path upload → extraction → checklist auto-check |
| `amendment-1.pdf`, `amendment-2.pdf` | Deadline superseding chain |
| `title-commitment-martinez.pdf` | Checklist auto-check (TITLE_COMMITMENT) |
| `title-commitment-park-lien.pdf` | Title-defect chat questions |
| `wire-instructions-original.pdf` | Wire baseline verification |
| `wire-instructions-fraudulent.pdf` | **Wire MISMATCH → CRITICAL block** |
| `scanned-no-text.pdf` | FAILED path with human-readable error |
| `not-a-pdf.pdf` | `.exe` bytes renamed — magic-bytes rejection |
| `oversized-51mb.pdf` | Size-limit rejection |

The title and wire PDFs already exist as generated fixtures — copy them into `e2e/fixtures/`.

### Deterministic AI in tests

Anthropic and Voyage are **mocked in CI**, not called live. Reasons: cost, latency, and non-determinism — a test asserting on a generated draft's wording will flake against a live model.

- `E2E_MOCK_AI=true` returns canned responses keyed by input
- Deadline extraction returns a fixed deadline set for `purchase-agreement-martinez.pdf`
- Chat returns a fixed cited answer, and the **exact** fallback string for the no-results case
- Draft generation returns a fixed section array

Keep one **manually-run** suite (`pnpm test:e2e:live`) that hits real AI, run before releases — not in CI on every PR.

### Time and dates

Seed dates are relative to a fixed **`SEED_TODAY = 2025-06-16`**, not `new Date()`. Otherwise the urgency tiers drift — a deadline seeded as URGENT becomes CRITICAL a few days later and the test breaks for no reason.

Playwright pins the clock where urgency matters:

```ts
await page.clock.setFixedTime(new Date('2025-06-16T09:00:00-05:00'))
```

This is what makes "financing contingency shows WARNING" a stable assertion.



---

## Part 7 — Demo Mode

**Principle: never pitch against an empty dashboard.** A populated system demos well; a blank one demos badly. The seed fixtures already exist — demo mode is the flag that makes them presentable.

- `DEMO_MODE=true` seeds the full fixture set and marks the environment as demo
- **All demo data is visually marked as synthetic** — a persistent, unobtrusive banner reading *"Demo environment — all data is fictional."* Never let a prospect mistake fixture data for their own, and never let demo data reach a production database.
- Demo firm is a distinct `firm_id` from any real deployment
- Demo attorney account auto-logs-in — no credential fumbling mid-pitch
- Seed includes at least one of each state worth showing: an URGENT deadline, a document mid-processing, a title defect, a flagged conflict, a wire-fraud MISMATCH, and a completed transaction
- `SEED_TODAY` pinning applies (Part 6) so urgency tiers render as intended on any demo day — a deadline seeded URGENT must still read URGENT three weeks later
- **Demo mode is never enabled in a real firm's environment.** `validateEnvVars()` rejects `DEMO_MODE=true` when `NODE_ENV=production`.


---

## `[PHASE 2]` PI Test Data — Build When Expanding to Personal Injury

When CounselOS expands to serve PI firms, add these test cases and seed data. Do not build this for Phase 1.

**PI test data needed for Phase 2:**
- 4 PI test cases (Rodriguez v. State Farm, Williams v. Allstate, Patel v. Schneider National, Thompson v. USAA) — fully documented in previous version of this file, archived in git history
- Travis County civil district court judges seed data
- Insurance carrier behavioral profiles (State Farm, USAA, Allstate, GEICO, Progressive)
- Austin PI settlement range baselines by injury severity
- PI document fixtures (police reports, medical records, demand letters, court filings)
- Case DNA seed data with pre-computed scores

Retrieve the full PI test data spec from git history when Phase 2 begins.

---

*Use alongside the Backend Checklist. Seed Phase 1 data before building Layer 3. All 5 test transactions and deadlines loaded before Layer 4 testing begins.*
