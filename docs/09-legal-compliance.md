# CounselOS — Legal Compliance Guide
### Texas State Bar Opinion 705 | Phase 1 Real Estate Implementation

---

## Why This Document Exists

CounselOS is not software that happens to be used by lawyers. It is software that becomes part of how a law firm practices law. That means the Texas Disciplinary Rules of Professional Conduct apply to how the system works — not just to how attorneys choose to use it.

This document covers every legal obligation the firm takes on when it deploys CounselOS, what the system does to satisfy those obligations, and what actions the firm must take before going live. This is not optional reading before the first client transaction touches the system.

---

## The Governing Authority — Texas State Bar Opinion 705

In February 2025, the Professional Ethics Committee for the State Bar of Texas issued **Opinion 705** — the first formal Texas-specific guidance on generative AI in legal practice. It is the definitive authority for any Texas attorney using AI tools.

Opinion 705 does not ban AI. It establishes that existing Rules of Professional Conduct apply to AI use and mandates four specific obligations:

1. **Competence** — attorneys must understand how the AI works before using it
2. **Confidentiality** — client data cannot be shared with unvetted AI vendors
3. **Supervision** — attorneys remain fully responsible for verifying all AI output
4. **Candor** — attorneys cannot submit AI-generated content without review and may need to disclose its use

Federal courts in Texas have added their own requirements. The Northern District of Texas requires a generative AI disclosure statement under Local Rule 7.2(f). The Southern District issued General Order 2025-04 with its own AI-use requirements.

**Every feature in CounselOS was designed around Opinion 705.** This document explains where the system enforces compliance and where the firm must act independently.

---

## What We Do NOT Need to Build

Before covering what is required, here is what the firm should explicitly avoid building or adding:

**Trust accounting (IOLTA)** — one of the most heavily regulated areas in Texas legal practice. Subject to State Bar audits. Use dedicated accounting software (Clio, QuickBooks for Lawyers). CounselOS is a transaction management platform, not a banking system. Never expand into this area.

**Automated client communications** — the AI cannot send emails, messages, or documents to clients automatically. The client status page is read-only by design. Having the system send AI-generated communications to clients without attorney approval is an Opinion 705 violation and a potential UPL risk.

**Legal research features** — CounselOS answers questions about uploaded transaction documents. It is not a Westlaw or LexisNexis competitor. Do not add case law search, statute lookup, or legal research features. The RAG system stays scoped to transaction documents only.

**DocuSign / e-signature integration** — attorneys use their own signing tools. Adding this creates vendor dependency and integration maintenance for no Phase 1 value. Attorneys download the generated draft and use their existing workflow.

**Court e-filing integration** — real estate attorneys do not regularly file in court. Not relevant for this client.

**Voice/audio transcription** — out of scope for real estate transaction management. Creates additional data retention and confidentiality obligations.

---

## Obligation 1 — Competence (Rule 1.01)

### What the Rule Requires

Texas Rule 1.01 requires attorneys to maintain competence in the tools they use, including technology. For AI tools, Opinion 705 specifies that attorneys must understand how generative AI functions — including its limitations, its failure modes, and what adequate review of its output looks like.

Three Texas attorneys have already been sanctioned for AI-related violations since Opinion 705 was published, with penalties ranging from $1,000 to $2,000 plus CLE requirements.

### What CounselOS Does

The system enforces competence through the draft verification workflow. Attorneys cannot approve a draft without:
- Opening and marking every section as reviewed individually
- A minimum review time check (approval under 30 seconds triggers a confirmation prompt)
- An explicit attestation: "I have read, verified, and take professional responsibility for this AI-generated document"

The attestation text and timestamp are stored on every approved draft. This is the compliance record.

### What the Firm Must Do

**Before any attorney uses the system:**

Train every attorney on the following, and document that the training occurred:
- How CounselOS generates drafts (what Claude does, what it can get wrong)
- What their review obligation is for each AI feature
- What to do when an AI output appears incorrect
- That ignorance of how the tool works is not a defense under Rule 1.01

The training documentation belongs in the firm's personnel file for each attorney. If the State Bar ever inquires about AI use, this documentation is the first line of defense.

Write a one-page **Firm AI Use Policy** and have the managing attorney sign it. Every attorney must acknowledge the policy when they first log into CounselOS (tracked in the system via `ai_policy_acknowledged_at` on the User record). The policy must cover:
- What AI features exist in CounselOS
- The review requirement for each AI output
- That AI is never the final decision-maker
- Who to contact if an AI output appears wrong
- The prohibition on submitting unreviewed AI output to courts or clients

---

## Obligation 2 — Confidentiality (Rule 1.05)

### What the Rule Requires

Texas Rule 1.05 requires attorneys to protect client confidential information. Opinion 705 extends this to AI vendors: attorneys must vet every AI vendor before sharing client data with them. The specific requirements are:
- Confirm the vendor will not use client data to train models
- Confirm the vendor has strong security including encryption and access controls
- Confirm data ownership terms protect the firm

The Texas Data Privacy and Security Act (TDPSA), effective July 2024, also applies.

### What CounselOS Does — Vendor Chain

Client data flows through five external vendors in CounselOS. Two are AI vendors; the other three are equally subprocessors under Rule 1.05, because the rule turns on whether the vendor *receives* client confidences, not on whether it is intelligent.

**Anthropic (Claude)** — receives chat messages, document content, and draft instructions. Every prompt that includes transaction party names, property addresses, or document excerpts is client data.

**Voyage AI** — receives document chunk text for embedding. Every piece of real estate document content sent for embedding is client data.

**Resend** — receives attorney email addresses, client email addresses, and deadline information for notification emails.

**Supabase** — stores all client data in PostgreSQL and object storage.

**Sentry** — receives error reports from both processes: stack traces, the correlation ID, the user ID, the firm ID, and the role. It is configured never to send request bodies, cookies, emails, or names (`sendDefaultPii: false`, plus explicit scrubbing in `instrument.ts`).

The exposure that matters here is **error messages**, not request payloads. A Postgres unique-violation quotes the conflicting value; a Zod validation error echoes the input that failed, and a chat message is up to 4,000 characters of client content; a not-found error can interpolate a party name or property address. `instrument.ts` scrubs message strings for this reason, but scrubbing is mitigation, not exemption — Sentry sees privileged material when something goes wrong, which is exactly when it is least predictable. Treat it as a subprocessor and paper it like one.

### What the Firm Must Do — Priority Order

**This week, before a single client transaction enters the system:**

1. **Anthropic DPA** — Contact Anthropic via their API privacy settings. Confirm your account is enrolled in the zero data retention policy (ZDR) — this means prompts are not stored after the API call completes and are never used for training. Get written confirmation. Anthropic's ZDR policy is available to API customers. Store the confirmation in the firm's vendor file.

2. **Voyage AI DPA** — Contact Voyage AI and get a data processing agreement confirming they do not use your embedding requests to train models. Store the confirmation.

3. **Supabase DPA** — Supabase has a standard Data Processing Agreement available at supabase.com/privacy. Execute it. Confirm US East data residency is set on the project — all client data stays in the United States.

4. **Resend DPA** — Resend publishes a standard DPA. Execute it. It covers attorney and client email addresses and the deadline content in notification emails.

5. **Sentry DPA** — Sentry publishes a standard DPA at sentry.io/legal/dpa. Execute it, and set the organization's **data region to US** and its **event retention to the shortest term the plan allows**. Error reports are not a place to accumulate privileged material indefinitely. If the firm's own risk posture rules out sending error data to a third party at all, the alternative is self-hosting (Sentry OSS or GlitchTip on Railway) — this removes the subprocessor entirely at the cost of running it yourself, and is a decision for the firm rather than for engineering.

6. **Document the vendor vetting** — write a one-page memo to the firm's file listing each vendor, the data they process, and the protections confirmed. Date it, sign it, keep it. This is your Rule 1.05 compliance record.

**What to tell clients:**

Draft and add to the firm's standard engagement letter before the first CounselOS-assisted transaction:

> "The firm uses AI-assisted tools for transaction document management, deadline tracking, and document drafting. All AI output is reviewed and approved by the responsible attorney before use in your matter. Client information is processed by vetted third-party technology vendors subject to data protection agreements that prohibit use of your information for training AI models. AI assistance does not alter the attorney's professional responsibility for all work product."

This language satisfies the Opinion 705 recommendation to "consider informing clients when generative AI will be used in their matter."

---

## Obligation 3 — Supervision of AI Output (Opinion 705 Core Requirement)

### What the Rule Requires

Opinion 705 makes human oversight of AI-generated work mandatory, not recommended. Attorneys must actively prevent the submission of fabricated content. This is not just about verifying citations — it is about having systems in place to catch AI errors before they reach clients or courts.

### What CounselOS Does

Every AI feature in the system requires explicit attorney action before output is used:

**Draft Generation** — drafts are never sent automatically. The `sent_at` field can only be written after `approved_at` is set. Approval requires section-by-section review with attestation.

**Deadline Extraction** — extracted deadlines are staged as `PENDING_REVIEW`. They do not fire alerts and are not displayed as active until the attorney explicitly confirms each one.

**Chat Responses** — every factual claim includes a citation to the exact document and page. When no relevant content is found, the system returns a deterministic fallback rather than hallucinating an answer.

**No auto-send, no auto-confirm, no auto-action.** The attorney is always the final step.

### What the Firm Must Do

Establish a review procedure for each AI feature and communicate it to every attorney:

- For draft generation: the attorney reads every section before approving. The attestation confirms this. If the draft contains an error the attorney should have caught in review, the attorney bears responsibility — not the software.
- For deadline extraction: the attorney verifies each extracted deadline against the source document before confirming. The system shows the source document and page number. Use it.
- For chat responses: citations must be verified. The attorney should spot-check that the cited page actually contains the information the system attributed to it.

---

## Obligation 4 — Federal Court Disclosure

### What the Rules Require

For any filing in federal court that was drafted with AI assistance:

**Northern District of Texas** — Local Rule 7.2(f) requires a generative AI disclosure statement. The filing must identify any AI tool used in drafting and confirm the attorney has reviewed and verified the content.

**Southern District of Texas** — General Order 2025-04 imposes similar requirements.

Real estate attorneys rarely file in federal court. But if this firm handles any federal matter, every AI-assisted document needs a disclosure.

### What CounselOS Does

Every draft generated by CounselOS has `was_ai_assisted: boolean` set to true. The system can generate a standard disclosure statement via `POST /v1/transactions/:id/drafts/:id/disclosure`. The generated text follows the Northern District format and includes the attorney's name, the document title, and the date.

### What the Firm Must Do

When the firm handles a federal matter, use the disclosure generation feature before filing any CounselOS-generated document. Add the disclosure statement to the filing in the format required by the relevant district's local rules.

---

## Obligation 5 — Conflict of Interest Checking

### What the Rule Requires

Texas Rule 1.09 and 1.10 require firms to check for conflicts of interest before accepting a new client or matter. A missed conflict can result in disqualification, malpractice liability, and bar discipline. This is not optional and it is not a Phase 2 feature.

### What CounselOS Does

The conflict check runs automatically when a lead is created and when a lead is converted to a transaction. The system searches party names from the incoming lead against all existing transaction parties across the firm. Matches are flagged as `PENDING` → `FLAGGED`. The attorney must review and acknowledge before the lead can be converted.

**Important limitation:** The system searches for name matches only. It does not check business entity relationships, related-party networks, or former client history going back years. For a firm starting fresh with CounselOS, this covers the essential requirement. As the firm's data grows, the conflict check becomes more comprehensive automatically.

### What the Firm Must Do

The attorney must review every FLAGGED conflict before converting a lead. "I checked and it is not a conflict" must be documented in the `conflict_check_notes` field — not just clicked through.

For parties that have different names but are related (e.g., a trust and its trustee), the attorney must manually check in addition to the system check. Document that check in the transaction's `internal_notes` field.

---

## Obligation 6 — Billing Ethics

### What the Rule Requires

Opinion 705 clarifies that attorneys cannot bill clients for hours not genuinely worked, even if tasks have become streamlined through AI. If a draft that used to take two hours now takes fifteen minutes because CounselOS generated the first draft, the attorney bills fifteen minutes of review time — not two hours.

Reasonable AI tool costs (subscription fees) may be passed through to clients with prior agreement in the engagement letter.

### What the Firm Must Do

Update the engagement letter to address AI costs: "Technology costs associated with AI-assisted document management and drafting, estimated at $X per month, are billed as a matter expense."

Train attorneys that billing review time for AI-generated documents must reflect actual review time — not the time it would have taken to draft from scratch.

Note: The CounselOS billing capture feature is Phase 2. For Phase 1, the firm tracks time with their existing method. When billing capture is added, it will flag AI-assisted tasks automatically.

---

## Pre-Launch Checklist — Complete Before First Client Transaction

### Legal Firm Actions

- [ ] Managing attorney reads Texas State Bar Opinion 705 in full
- [ ] Firm AI Use Policy written and signed by managing attorney
- [ ] All attorneys acknowledge Firm AI Use Policy (tracked in CounselOS)
- [ ] Attorney training conducted on all CounselOS AI features — documented
- [ ] Engagement letter updated with AI disclosure and cost language
- [ ] Malpractice insurer notified of AI tool deployment — coverage confirmed in writing
- [ ] Conflict check procedure established — who reviews FLAGGED conflicts, how they document it

### Vendor Compliance Actions

- [ ] Anthropic: zero data retention (ZDR) policy confirmed for API account — written confirmation obtained
- [ ] Voyage AI: data processing agreement executed — no model training on embedding requests
- [ ] Supabase: Data Processing Agreement executed — US East data residency confirmed
- [ ] Resend: Data Processing Agreement reviewed — client email addresses covered
- [ ] Sentry: Data Processing Agreement executed — US data region set, event retention set to the shortest term the plan allows
- [ ] Vendor vetting memo written, signed, dated, filed

### Technical Actions (CounselOS System)

- [ ] `ai_policy_acknowledged_at` field working — attorneys must acknowledge policy on first login
- [ ] Draft verification workflow live — section-by-section review enforced, attestation stored
- [ ] Conflict check running on lead creation — FLAGGED leads cannot be converted without review
- [ ] `was_ai_assisted = true` on all generated drafts — disclosure generation working
- [ ] `ai_disclosure_acknowledged_at` prompt working on first client communication
- [ ] `retention_until` auto-calculated on transaction close — 7 years for real estate

---

## Ongoing Obligations After Launch

**Monthly:**
Review the `email_jobs` table and Sentry logs for any AI feature errors or failures. If an AI output caused an attorney to miss a deadline or send incorrect information to a client, document the incident and the corrective action taken.

**On every new matter:**
Confirm conflict check is complete before the transaction moves from INTAKE status. Confirm engagement letter with AI disclosure was sent and `ai_disclosure_acknowledged_at` is set.

**When Opinion 705 is updated:**
The Texas State Bar Professional Ethics Committee may update Opinion 705 or issue follow-on guidance. Assign one attorney to monitor State Bar ethics publications and update the Firm AI Use Policy within 30 days of any material change.

**When a federal matter arises:**
Check whether the relevant district has AI disclosure requirements. Generate the disclosure text from CounselOS and add it to any AI-assisted filings.

**Annual:**
Review all vendor agreements for changes to data usage terms. Anthropic, Voyage AI, Supabase, Resend, and Sentry all update their privacy policies. Reverify that ZDR and no-training commitments remain in effect, and that Sentry's data region and retention window have not been changed by a plan migration.

---

## Reference Links

- Texas State Bar Opinion 705 (February 2025): texasbar.com/ethics → Professional Ethics Committee → Opinion 705
- Texas State Bar AI Toolkit: texasbarpractice.com
- TRAIL (Taskforce for Responsible AI in the Law) Reports: texasbar.com/trail
- Northern District of Texas Local Rules: txnd.uscourts.gov → Local Rules → Rule 7.2(f)
- Southern District General Order 2025-04: txs.uscourts.gov
- Texas Data Privacy and Security Act (TDPSA): capitol.texas.gov → SB 2 (88th Legislature)
- Anthropic Privacy Policy and ZDR: anthropic.com/privacy → API Data Usage
- Supabase DPA: supabase.com/privacy → Data Processing Agreement
- Sentry DPA: sentry.io/legal/dpa → also set data region and event retention in organization settings

---

*This document is not legal advice. It is a practical compliance guide for the firm's managing attorney to review with qualified legal counsel before deployment. The firm's own attorney should review this document and the applicable rules before going live.*
