# CounselOS — Compliance & Data Capture Gaps
### TDPSA reality, and the columns that must exist before day one

> Two categories here. **Part 1** is what the law actually requires (and mostly doesn't). **Part 2** is the data-capture additions that are trivial now and impossible to backfill later — these go in before the first migration runs.

---

# Part 1 — TDPSA: What Actually Applies

## The short answer: you are almost certainly exempt today

The Texas Data Privacy and Security Act (Tex. Bus. & Com. Code ch. 541) took effect **July 1, 2024**, with universal opt-out signal obligations effective **January 1, 2025**.

TDPSA is unusually broad in one way and unusually narrow in another:

- **No revenue threshold. No data-volume threshold.** Unlike CCPA's $25M/100K-consumer floor, TDPSA applies to any business that conducts business in Texas or produces services consumed by Texas residents and processes personal data.
- **But it exempts businesses meeting the U.S. Small Business Administration definition** — generally under 500 employees, varying by NAICS code.

**The Austin firm is an SBA small business. CounselOS in Phase 1 is an SBA small business.** Both are exempt from the core obligations: privacy notice requirements, consumer rights response duties, and universal opt-out honoring.

### The one edge that survives the exemption

A small business **may not sell sensitive personal data without prior opt-in consent.** Sensitive data includes health data, biometrics, children's data, precise geolocation, and data revealing race or immigration status.

CounselOS does not sell data of any kind. This does not apply.

### Enforcement posture

Exclusive enforcement by the **Texas Attorney General**. **No private right of action** — consumers cannot sue directly. There is a **30-day cure period** before enforcement action.

The AG has been active since early 2025 (DeepSeek, TP-Link, Alibaba, CapCut), but enforcement is aimed at data brokers and foreign platforms handling consumer data at scale — not small vertical SaaS serving a professional services firm.

## What actually binds you today

TDPSA is not your governing constraint. These are, and they apply regardless of company size:

| Obligation | Source | Status in our docs |
|---|---|---|
| Attorney-client privilege | Common law + evidentiary rules | Implicit — should be explicit |
| Client confidentiality | Texas Rule 1.05 | ✅ `09-legal-compliance.md` |
| AI vendor vetting / no training on client data | Texas Opinion 705 | ✅ Documented — DPAs required |
| Competence in the tools used | Rule 1.01 + Opinion 705 | ✅ Documented |
| Conflict checking | Rules 1.09 / 1.10 | ✅ Built (Layer 8) |
| 7-year file retention | TX real estate practice standard | ✅ `retention_until` on transactions |

**Our existing Opinion 705 work already covers the substance.** Rule 1.05 confidentiality is a stricter standard than TDPSA's consumer-privacy obligations, and we're already building to it.

## When this changes — and why we build anyway

**Phase 2 multi-tenant SaaS**, once CounselOS crosses SBA thresholds, puts you fully in scope. At that point you owe: a privacy notice, a data subject rights process (access, correction, deletion, portability), processor contracts with every subprocessor, data protection assessments, and universal opt-out signal handling.

Building the underlying capabilities now costs one endpoint and one column. Retrofitting them across a live multi-tenant base with real client data is a project.

**Two capabilities to build now for that reason:**

**Export.** A documented, complete export of a firm's data. Satisfies future TDPSA portability, removes the vendor lock-in objection in every sales conversation, and is simply correct.

**Deletion.** A documented deletion path that respects the 7-year retention obligation — legal retention overrides a deletion request, and that interaction needs to be written down before someone asks for it.

## What you personally need to do (non-code)

- [ ] **Write a privacy notice** — not legally required yet under the exemption, but expected by any firm evaluating you, and required the moment you scale
- [ ] **Confirm the firm's SBA status** in writing for the file — employee count against their NAICS code
- [ ] **Execute vendor DPAs** — Anthropic (zero data retention), Voyage AI, Supabase, Resend. This is the Opinion 705 requirement and it's the real obligation.
- [ ] **Write a breach response procedure** — who is notified, in what order, within what window. Needed before an incident, not during one.
- [ ] **Document the subprocessor list** — every vendor touching client data, what they see, and under what agreement. This becomes a security questionnaire answer.
- [ ] **Reassess when CounselOS approaches 480–490 employees** or takes on a non-exempt client (a firm inside a larger non-small entity)

---

# Part 2 — Data Capture That Cannot Be Backfilled

These are the urgent ones. Each is a small schema addition. Each is **permanently unrecoverable** if you launch without it — you cannot reconstruct a source span, a referral source, or an outcome reason after the fact.

## 2.1 — Source-Linked Extraction `[URGENT]`

**The problem it solves.** The AI evaluation's sharpest critique: because every AI output requires review, our AI *adds* a verification step rather than removing one. That's the #1 reason lawyers abandon AI tools.

If an attorney has to re-read a 40-page contract to verify an extracted deadline, we've saved them nothing. If we show them the exact sentence it came from, verification takes five seconds.

**Schema — add to `deadlines`:**

```typescript
  // ── Source Linking (verification acceleration) ───────────────────────
  // The exact location this deadline was extracted from. Lets the UI show
  // the attorney the source sentence instead of making them re-read.
  // NULL for manually-entered deadlines.
  sourcePage:      integer('source_page'),
  // The verbatim contract text that produced this deadline.
  // "Closing shall occur on or before the 30th day following the Effective Date"
  sourceText:      text('source_text'),
  // Character offsets within the extracted page text, for highlight rendering
  sourceCharStart: integer('source_char_start'),
  sourceCharEnd:   integer('source_char_end'),
  // Model's self-reported confidence, if available. Used to sort review order —
  // low-confidence extractions surface first.
  extractionConfidence: numeric('extraction_confidence', { precision: 3, scale: 2 }),
  // ─────────────────────────────────────────────────────────────────────
```

**Prompt change.** The deadline extraction Zod schema must require `source_text` and `page_number` per extracted deadline. Claude already sees the page-chunked text; asking it to quote the triggering sentence is nearly free and makes the output verifiable.

**UI consequence.** The confirmation screen shows the extracted date beside its source quote and a link that opens the document at that page. Review becomes a glance.

**Why it can't be backfilled:** re-running extraction over historical documents to recover spans means re-processing every document, and the model may extract differently the second time. The link between a confirmed deadline and its source is lost permanently.

---

## 2.2 — Referral Source Tracking `[URGENT]`

**The problem it solves.** Referrals are the highest-ROI acquisition channel for small firms. Knowing *which* referrers send profitable, fast-closing work is directly actionable — it tells the firm where to spend relationship time. This is the single most useful input to the analytics layer.

**Schema — add to `leads` and `transactions`:**

```typescript
export const referralSourceTypeEnum = pgEnum('referral_source_type', [
  'REALTOR',
  'PAST_CLIENT',
  'ATTORNEY',
  'LENDER',
  'TITLE_COMPANY',
  'WEB_SEARCH',
  'WALK_IN',
  'OTHER',
])
```

```typescript
  // ── Referral Attribution ─────────────────────────────────────────────
  referralSourceType: referralSourceTypeEnum('referral_source_type'),
  // Free text — the specific person or firm. "Maria Delgado, Compass RE"
  // Free text deliberately: forcing a dropdown at intake kills capture rate,
  // and the analytics layer can normalize later.
  referralSourceName: text('referral_source_name'),
  // ─────────────────────────────────────────────────────────────────────
```

Set on the lead at intake; **copied to the transaction on conversion** so the attribution survives even if the lead is later archived.

**Why it can't be backfilled:** nobody remembers who referred a client eighteen months ago. Every day without this is a permanent hole in referral ROI analysis.

---

## 2.3 — Outcome Capture `[URGENT]`

**The problem it solves.** We track *that* a transaction reached `FALLEN_THROUGH`. We don't track *why*. Without the why, no risk scoring, no pattern analysis, and no honest answer to "what kills our deals?"

**Schema — add to `transactions`:**

```typescript
export const outcomeReasonEnum = pgEnum('outcome_reason', [
  'CLOSED_ON_TIME',
  'CLOSED_DELAYED',
  'FINANCING_DENIED',
  'INSPECTION_ISSUES',
  'TITLE_DEFECT',
  'APPRAISAL_GAP',
  'BUYER_TERMINATED_OPTION',
  'SELLER_TERMINATED',
  'PARTIES_RENEGOTIATED_ELSEWHERE',
  'OTHER',
])
```

```typescript
  // ── Outcome Capture ──────────────────────────────────────────────────
  // Set when the transaction reaches CLOSED or FALLEN_THROUGH.
  // Required by the status transition — the UI prompts for it on close.
  outcomeReason:  outcomeReasonEnum('outcome_reason'),
  outcomeNotes:   text('outcome_notes'),   // max 500 chars
  // Computed on close: days from effective_date to closed_at.
  // Stored rather than derived so cycle-time analysis stays trivial.
  cycleTimeDays:  integer('cycle_time_days'),
  // ─────────────────────────────────────────────────────────────────────
```

**Behavior:** the status transition to `CLOSED` or `FALLEN_THROUGH` prompts for the reason. One dropdown, optional note. Ten seconds at the moment when the attorney actually knows the answer.

**Why it can't be backfilled:** three months later nobody remembers whether the Patel deal died on financing or inspection.

---

## 2.4 — Access Audit Log `[BEFORE LAUNCH]`

**The problem it solves.** `transaction_activities` logs what people *did*. It doesn't log what they *saw*. For a system holding privileged client material, read access matters as much as writes — it proves matter-level access control is working, and it answers "who looked at this file?" if that's ever asked.

**Schema — new table:**

```typescript
// ------------------------------------------------------------
// ACCESS LOG
// Read-access audit trail. Separate from transaction_activities,
// which logs actions. This logs views.
//
// High volume — this table grows faster than any other. Partition by
// month in Phase 2. Retain 2 years, then purge.
// ------------------------------------------------------------
export const accessLog = pgTable('access_log', {
  id:            uuid('id').primaryKey().defaultRandom(),
  firmId:        uuid('firm_id').notNull().references(() => firms.id),
  userId:        uuid('user_id').notNull().references(() => users.id),
  transactionId: uuid('transaction_id').references(() => transactions.id),

  // 'transaction.viewed' | 'document.downloaded' | 'search.performed'
  // | 'client_portal.accessed' | 'export.generated'
  action:        text('action').notNull(),
  // Which specific resource, when applicable
  resourceId:    uuid('resource_id'),
  ipAddress:     text('ip_address'),

  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  firmCreatedIdx: index('access_log_firm_id_created_at_idx').on(table.firmId, table.createdAt),
  txIdx:          index('access_log_transaction_id_idx').on(table.transactionId),
}))
```

**Write it from an interceptor**, not from individual controllers — one place, no chance of a route forgetting. Document downloads and client-portal access are the highest-value entries.

---

## 2.5 — Session Timeout `[BEFORE LAUNCH]`

**The problem it solves.** An attorney's laptop left open in a coffee shop is a confidentiality exposure under Rule 1.05. We have no documented session policy.

**Not a schema change** — a config decision and a frontend behavior:

- **Idle timeout: 30 minutes.** Warning modal at 28 minutes with a "stay signed in" action.
- **Absolute session limit: 12 hours.** Re-authentication required regardless of activity.
- Access token TTL stays short (15 min) with silent refresh; the idle timer is separate and tracks user interaction, not token age.
- On timeout: clear the auth store, close SSE connections, redirect to login with a `?reason=timeout` so the UI can explain rather than appearing to have crashed.
- Client portal tokens are unaffected — they're already 30-day scoped and read-only.

---

## 2.6 — Export & Deletion `[BEFORE LAUNCH]`

**The problem it solves.** Removes the vendor lock-in objection in sales, satisfies future TDPSA portability, and forces us to think about deletion-versus-retention before someone asks.

```
POST /v1/firms/me/export        — OWNER only. Queues a full export job.
GET  /v1/firms/me/export/:jobId — status + signed download URL when ready
```

**Export contents:** all transactions, parties, deadlines, documents (actual files, not just metadata), matter notes, communications, tasks, time entries, invoices, and activity log. JSON for structured data, original files preserved, one archive.

**Runs as a BullMQ job** — a full export is too slow for a request cycle. Notify by email when ready. Signed URL, 24-hour expiry.

**Deletion — and the interaction that matters:**

```
POST /v1/transactions/:id/request-deletion
```

Deletion **does not override the 7-year retention obligation.** A deletion request on a matter still inside `retention_until` is recorded and honored *at* the retention date, not immediately. The response says so explicitly rather than silently refusing.

This interaction — client privacy right versus attorney retention duty — is exactly the kind of thing that needs to be written down before it comes up.

---

# Part 3 — The Full Gap List

Everything identified that isn't yet in the docs, by urgency.

### Before the first migration (unrecoverable if missed)
- [ ] Source-linked extraction — `source_page`, `source_text`, char offsets, confidence
- [ ] Referral source — type enum + free-text name, on leads and transactions
- [ ] Outcome capture — reason enum, notes, `cycle_time_days`

### Before launch
- [ ] Access audit log table + interceptor
- [ ] Session timeout (30 min idle / 12 hr absolute)
- [ ] Export endpoint (queued job, full archive)
- [ ] Deletion request with retention-override behavior
- [ ] Encryption-at-rest documentation (what Supabase encrypts, written down)
- [ ] Backup **restoration** test — not just that backups exist
- [ ] Breach response procedure (written)
- [ ] Subprocessor list (written)
- [ ] Vendor DPAs executed — Anthropic ZDR, Voyage, Supabase, Resend

### Shortly after launch
- [ ] Bulk confirm for extracted deadlines
- [ ] Post-confirmation automation (calendar, reminders, checklist advance)
- [ ] AI accuracy instrumentation — correction rate, fallback rate, citation validity
- [ ] Analytics module — closing rate, cycle time, per-matter profitability, referral ROI, utilization
- [ ] Cost monitoring and alerting (Anthropic + Voyage spend per firm)

### Operational (non-code, launch-critical)
- [ ] Support model — response times, escalation path, after-hours expectations
- [ ] Incident communication plan
- [ ] Uptime / performance targets
- [ ] Privacy notice (not required under the exemption, but expected by evaluating firms)

---

*The three urgent items are three enums and about ten columns. They cost an hour today and are unrecoverable tomorrow.*
