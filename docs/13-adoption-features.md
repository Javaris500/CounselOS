# CounselOS — Adoption & Access Features
### The features that decide whether a firm actually lives in the system

> These came out of the case-management failure-mode audit. They are not glamorous — they are the difference between software a firm adopts and software a firm abandons. Most of them are small. All of them close a specific, documented failure mode.
>
> **Sequencing:** matter-level access, passive time capture, and the search columns go in **before launch**. Two-way messaging and migration tooling go in **shortly after**. Mobile and permission-explaining errors are frontend requirements woven throughout.

---

# 1. Matter-Level Access Control

**Failure mode closed:** permission surprises, and the "everyone sees everything" model that real firms outgrow immediately.

## The problem

Current access is firm-wide by role — any ATTORNEY sees every transaction. Real firms need finer control: an associate should see their assigned matters by default, not every deal in the firm. A paralegal assigned to three transactions shouldn't browse the other forty.

## The model

| Role | Access |
|---|---|
| **OWNER** | Everything. Firm settings, user management, all matters. Bypasses all matter checks. |
| **ATTORNEY** | Full access to **assigned** matters (`assigned_attorney_id`) or matters they've been granted. Read-only visibility of other firm matters so they can cover. Can approve drafts, confirm deadlines, log time. |
| **PARALEGAL** | Full access to **assigned** matters (`assigned_paralegal_id`) or granted matters **only**. No visibility into unassigned matters. Can upload, log communications and notes, create tasks. Cannot approve drafts or confirm deadlines. |
| **CLIENT** | One transaction. Read-only + messaging. Via signed token, not an account. |

## Schema

```typescript
// Grants access to a matter beyond the two assignment fields.
// Covers vacation coverage, second-chairing, paralegal reassignment —
// without changing ownership of the matter.
export const matterAccess = pgTable('matter_access', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),
  userId:        uuid('user_id').notNull().references(() => users.id),
  grantedById:   uuid('granted_by_id').notNull().references(() => users.id),
  // Optional expiry for temporary coverage
  expiresAt:     timestamp('expires_at'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  txUserIdx: uniqueIndex('matter_access_transaction_user_idx')
    .on(table.transactionId, table.userId),
}))
```

## Implementation

A single `MatterAccessGuard` runs **after** `RolesGuard` on every transaction-scoped route. Not scattered checks.

```
resolveAccess(user, transactionId) →
  1. OWNER                                    → FULL
  2. assigned_attorney_id === user.id         → FULL
  3. assigned_paralegal_id === user.id        → FULL
  4. matter_access row exists (not expired)   → FULL
  5. role === ATTORNEY                        → READ_ONLY
  6. otherwise                                → DENIED
```

Endpoints declare what they require via a `@MatterAccess('FULL' | 'READ_ONLY')` decorator. Write operations require FULL; GETs accept READ_ONLY.

**Endpoints:**
```
POST   /v1/transactions/:id/access      — grant (OWNER, or the assigned attorney)
DELETE /v1/transactions/:id/access/:userId — revoke
GET    /v1/transactions/:id/access      — who can see this matter
```

## Permission errors must explain themselves

**This is the part teams skip and it becomes a support tax.** A bare 403 generates a ticket every time.

```json
{
  "success": false,
  "error": {
    "code": "MATTER_ACCESS_DENIED",
    "message": "You don't have access to this matter.",
    "details": {
      "reason": "NOT_ASSIGNED",
      "assignedAttorney": "James Okafor",
      "requestAccessFrom": "James Okafor"
    }
  }
}
```

Frontend renders: *"This matter is assigned to James Okafor. Ask them for access."* — with a button that requests it. Never a bare "Access denied."

Reason codes: `NOT_ASSIGNED`, `READ_ONLY_ROLE`, `ACCESS_EXPIRED`, `ROLE_INSUFFICIENT`.

---

# 2. Passive Time Capture

**Failure mode closed:** the data-entry burden that kills adoption, and the 30–40% of billable time lost to month-end reconstruction.

## The principle

**The attorney reviews, never enters.** This converts a discipline problem into a review problem.

You already log the raw material. Every document upload, communication entry, draft generation, and deadline confirmation is a timestamped `transaction_activities` row tied to a matter. Turn those into suggested time entries.

## Schema additions to `time_entries`

```typescript
  // MANUAL = attorney typed it. SUGGESTED = generated from activity.
  source:           timeEntrySourceEnum('source').notNull().default('MANUAL'),
  // DRAFT = suggested, awaiting review. CONFIRMED = attorney accepted.
  entryStatus:      timeEntryStatusEnum('entry_status').notNull().default('CONFIRMED'),
  // What activity produced this suggestion (null for manual entries)
  sourceActivityId: uuid('source_activity_id').references(() => transactionActivities.id),
```

```typescript
export const timeEntrySourceEnum = pgEnum('time_entry_source', ['MANUAL', 'SUGGESTED'])
export const timeEntryStatusEnum = pgEnum('time_entry_status', ['DRAFT', 'CONFIRMED'])
```

**Rule: DRAFT entries never appear in invoices.** Only CONFIRMED entries are billable.

## Suggestion rules

A nightly BullMQ job groups yesterday's activities by transaction and user, then proposes entries:

| Activity | Suggested duration | Description template |
|---|---|---|
| `communication.logged` (PHONE_CALL) | 0.25 | "Call with {contactName} — {summary truncated}" |
| `communication.logged` (EMAIL) | 0.10 | "Correspondence with {contactName}" |
| `document.uploaded` + `document.ready` | 0.25 | "Reviewed {documentName}" |
| `draft.approved` | 0.50 | "Drafted and reviewed {draftTitle}" |
| `deadline.confirmed` (batch) | 0.25 | "Reviewed and confirmed contract deadlines" |
| `note.added` | 0.10 | "Matter review and file note" |

Multiple same-type activities on one matter in one day **collapse into a single suggestion** — three uploads becomes one 0.25 "Reviewed documents" entry, not three. Nobody wants to review twelve suggestions.

## The flow

Morning dashboard shows: *"6 suggested time entries from yesterday — review and confirm."* Attorney adjusts two durations, deletes one non-billable, confirms the rest. Thirty seconds, six entries captured.

```
GET   /v1/time-entries/suggested          — DRAFT entries for current user
PATCH /v1/time-entries/:id/confirm        — DRAFT → CONFIRMED (with edits)
POST  /v1/time-entries/confirm-batch      — confirm several at once
DELETE /v1/time-entries/:id               — dismiss a suggestion
```

**Suggestions expire.** DRAFT entries older than 14 days are auto-deleted — stale suggestions are noise, and an attorney who hasn't reviewed in two weeks won't remember the work anyway.

---

# 3. Full-Text Search

**Failure mode closed:** "find me the message where the seller agreed to extend closing" — currently impossible.

## Build the columns now, ship the UI when ready

Adding a generated `tsvector` column to a table with a year of data means a full table rewrite and a painful backfill. Adding it to an empty table costs nothing. **Put these in the first migration even if search ships in Phase 2.**

## Schema

Generated columns on three sources:

```sql
-- communications
ALTER TABLE communications ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(contact_name,'') || ' ' || coalesce(summary,''))
  ) STORED;
CREATE INDEX communications_search_idx ON communications USING GIN (search_vector);

-- matter_notes
ALTER TABLE matter_notes ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED;
CREATE INDEX matter_notes_search_idx ON matter_notes USING GIN (search_vector);

-- document_chunks
ALTER TABLE document_chunks ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED;
CREATE INDEX document_chunks_search_idx ON document_chunks USING GIN (search_vector);
```

## The endpoint

```
GET /v1/search?q=wire+instructions&types=communications,notes,documents&transactionId=
```

Returns typed results grouped by source, ranked by `ts_rank`, with a highlighted snippet via `ts_headline`.

```json
{
  "results": [
    {
      "type": "communication",
      "transactionId": "...",
      "transactionTitle": "Martinez / Chen — 2847 Manor Rd",
      "snippet": "Confirmed <b>wire instructions</b> received. Closer is...",
      "occurredAt": "2025-06-18T14:15:00Z",
      "rank": 0.87
    }
  ]
}
```

**Two rules:**
1. **Search respects matter-level access.** Results must never surface a matter the user can't open. Join through the access resolution from §1.
2. **This is keyword search and it complements vector search — it does not replace it.** Vector search answers *"what does the contract say about financing?"* Full-text answers *"find the message where Maria mentioned the wire."* Different queries, both needed.

---

# 4. Two-Way Client Messaging

**Failure mode closed:** clients as an afterthought; the read-only portal that under-delivers.

## The key decision: no client accounts

Two-way messaging does **not** require client accounts. The signed token already identifies the transaction and the client email — a client posts a message authenticated by that same token. This preserves the Phase 1 auth simplicity and avoids reintroducing the magic-link flow that was deliberately removed.

## Schema

```typescript
export const clientMessages = pgTable('client_messages', {
  id:            uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),

  direction:     messageDirectionEnum('direction').notNull(), // INBOUND (client) | OUTBOUND (firm)
  // For OUTBOUND: the attorney who sent it. Null for INBOUND.
  senderUserId:  uuid('sender_user_id').references(() => users.id),
  // For INBOUND: the client name from the access token. Null for OUTBOUND.
  senderName:    text('sender_name'),

  body:          text('body').notNull(),   // max 2,000 chars
  readAt:        timestamp('read_at'),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
  deletedAt:     timestamp('deleted_at'),
}, (table) => ({
  txIdx: index('client_messages_transaction_id_created_at_idx')
    .on(table.transactionId, table.createdAt),
}))
```

## Endpoints

```
# Client side — authenticated by signed token, never a JWT
GET  /v1/client/transactions/:id/messages?token=...
POST /v1/client/transactions/:id/messages?token=...

# Attorney side — JWT + matter access
GET  /v1/transactions/:id/client-messages
POST /v1/transactions/:id/client-messages
```

## Rules that are not negotiable

**The AI never auto-responds to a client message.** Ever. That is UPL territory and an Opinion 705 violation. An attorney composes every outbound reply. No draft suggestions surfaced to the client, no automated acknowledgements beyond a system-generated "we received your message."

**Every message writes to the communication log** with `type: CLIENT_PORTAL`, `direction` matching. This is the real win — two-way messaging feeds institutional memory for free, and the AI chat can then answer "what did the client ask about?"

**Inbound messages notify the assigned attorney** via Resend + SSE.

**Rate limit inbound:** 20 messages per token per hour. A compromised link shouldn't become a spam vector.

---

# 5. Migration & Onboarding

**Failure mode closed:** migration paralysis — the firm runs two systems in parallel, hates it, and quits.

## CSV import

```
POST /v1/import/transactions   — multipart CSV upload
POST /v1/import/parties        — multipart CSV upload
GET  /v1/import/template/:type — download the expected CSV template
```

**Behavior:**
- **Dry-run first.** Parse and validate the whole file, return a preview with row-level errors, and import nothing until the user confirms.
- Row-level error reporting: *"Row 14: `closing_date` is not a valid date."* Never fail the whole file for one bad row — report all errors at once.
- Transactions import creates the document checklist automatically, same as manual creation.
- Import writes `transaction.imported` to the activity log, so imported matters are distinguishable from native ones.
- OWNER role only.

## The documented transition

Ship this as guidance, not just code:

> **Start new matters in CounselOS. Let existing matters close out where they are.**
> Import only matters that are (a) under contract and (b) more than 14 days from closing. Anything closing sooner finishes in the old system. This avoids a parallel-running period on time-critical deals, which is where migrations go wrong.

## The single-champion problem

Not a code fix — a rollout requirement, and it sinks more deployments than missing features do.

- **The managing partner must be a user, not a stakeholder.** If they only see reports, adoption collapses when the champion leaves.
- **At least one paralegal invested from day one.** Paralegals do the highest volume of data entry; if they don't adopt, the log has holes and the AI context degrades.
- **Named checkpoints at day 1, 7, 14, 30** — not a single training session. Week three is when people revert to old habits if it hasn't become reflex.
- **Document who trained whom.** Doubles as the Opinion 705 competence record.

---

# 6. Mobile

**Failure mode closed:** attorneys are in cars, at closings, in court — and the communication log gets holes.

**Responsive web is table stakes.** No native app in Phase 1.

Priority order for mobile fidelity:

1. **Communication quick-add** — must work one-handed on a phone. This is the highest-frequency mobile action: the attorney logs a call in the parking lot after a closing. If it's awkward on mobile, the log has gaps and the institutional-memory value collapses.
2. **Morning dashboard** — checking deadlines from anywhere.
3. **Deadline confirm/complete** — actionable from a phone.
4. **Transaction detail (read)** — look up a party, an address, a date.
5. **Document upload** — camera capture is a nice-to-have, not required.

Everything else can degrade gracefully. Draft review, invoicing, and time-entry review are desk work.

---

# 7. Deadline Calculation Trust

**Failure mode closed:** one wrong extracted date and the attorney verifies everything manually forever, making the feature worthless.

This is already partially specced — `calculation_note` exists on the `deadlines` table from the TREC engine work. The point worth restating:

**Always show the math.** Never a bare date.

> Option Period Expiry — **June 9, 2025**
> *7 calendar days from effective date (June 2). TREC: effective date is day zero.*

> Option Fee Delivery — **Saturday, June 5, 2025**
> *3 days from effective date. TREC rule: the option fee deadline does not extend for weekends.*

That second one is the trust-builder. An attorney seeing a Saturday deadline next to a Monday earnest-money deadline will assume the system is broken — unless the note explains exactly why they differ. Showing the reasoning turns an apparent bug into a demonstration of competence.

**Corollary:** the TREC engine must ship before deadlines are demoed. Extraction without correct date math is your strongest feature resting on your weakest link.

---

## Sequencing Summary

| Feature | When | Why |
|---|---|---|
| Matter-level access | **Before launch** | Access model is painful to retrofit |
| Passive time capture | **Before launch** | Closes the revenue leak that makes the ROI case |
| `tsvector` columns | **Before launch** | Free now, expensive later |
| Deadline calculation notes | **Before demo** | Trust in the flagship feature |
| Mobile responsive | **Before launch** | Quick-add especially |
| Permission-explaining errors | **Before launch** | Support-cost prevention |
| Two-way messaging | Shortly after | Additive, not blocking |
| CSV import | Shortly after | Needed for real onboarding |
| Search UI | Phase 2 | Columns exist; UI can wait |

*None of these are glamorous. All of them are the difference between a firm that adopts and a firm that quits.*
