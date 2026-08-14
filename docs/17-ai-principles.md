# CounselOS — AI Design Principles
### A breakdown for the team: why our AI works the way it does

> We had our AI implementation independently critiqued. It graded **B / B-minus** — good engineering, correct compliance, but low ambition. This doc explains what that means, why we made the choices we made, and what you should take from it when you build.
>
> The short version: **our AI is real, but three of our four AI features are things anyone can build. What makes CounselOS defensible is the boring deterministic code around the AI, not the AI itself.**

---

## 1. First, understand what "AI washing" means

AI washing is claiming AI capability you don't really have, or wrapping a thin layer over an LLM API and calling it a product.

This isn't just embarrassing — it's a legal risk. The FTC has brought more than a dozen enforcement actions since launching "Operation AI Comply" in 2024. One of them was against **DoNotPay**, which marketed itself as "the world's first robot lawyer." They settled for $193,000.

**The lesson for us:** never describe CounselOS as doing something autonomously that actually requires an attorney. Our honest framing — *"AI proposes, the attorney disposes"* — isn't just ethical. It's legally protective.

**The test to apply:** if you removed the LLM call and replaced it with a well-written function, would the feature still work? If yes, it probably should be a function. That's not a knock on AI — it's how you tell real use from decoration.

---

## 2. Why we deleted an AI feature (and why that was the right call)

We originally had an AI document classifier. It sent 500 tokens to Claude and got back one word from a list of eleven — `PURCHASE_AGREEMENT`, `AMENDMENT`, `TITLE_COMMITMENT`, and so on.

We killed it and replaced it with a keyword function that checks TREC form numbers first, then falls back to keyword matching.

**Why this was correct:**

| | AI classifier | Keyword function |
|---|---|---|
| Speed | ~800ms network round trip | ~1ms |
| Cost | Per-call API charge | Zero |
| Failure modes | Timeout, rate limit, malformed response | None — it's a pure function |
| Testable | "probably returns the right word" | Exact assertions |

Texas real estate runs on standardized TREC forms with the form number printed on the document. Classification isn't intelligence here — it's pattern matching. Paying an LLM to do pattern matching is waste dressed up as innovation.

**The question to internalize:** *is this genuinely intelligence, or is it pattern matching wearing an AI costume?*

We applied the same test to Texas business-day date math, conflict-check name matching, deadline urgency tiers, and the wire-fraud comparison logic. All deterministic. All better for it.

---

## 3. Why the guardrails exist (this is the important part)

Stanford's RegLab ran 202 queries against the major legal AI research tools and published the results in the *Journal of Empirical Legal Studies*. What they found:

- **Lexis+ AI hallucinated on more than 17% of queries**
- **Westlaw AI-Assisted Research on roughly 33%**
- GPT-4 baseline: 43%

These are purpose-built legal tools from companies with enormous resources. They still fabricate information one time in five or one time in three.

Now consider the stakes in our domain. A hallucinated closing date means a client forfeits earnest money. A hallucinated contract term means malpractice. Missed deadlines are already the **single largest category of legal malpractice claims** — roughly a quarter of all claims.

So our architecture has three specific defenses. Understand each one:

**Defense 1 — We never trust Claude's arithmetic.**
Claude extracts *"closing is 30 days after the effective date."* Our deterministic TREC engine computes what that actually means under Texas counting rules. The AI reads; the code calculates.

**Defense 2 — If we don't have the data, we don't ask the model.**
In document chat, we do a vector search and score each chunk for relevance. If **zero chunks clear the 0.70 threshold**, we do not call Claude at all. We return a fixed string saying the answer isn't in the uploaded documents.

This is the one people find counterintuitive. Why not let the model try? Because an LLM with no relevant context will answer from its training data — and it will sound confident. In a legal product, a confident wrong answer is worse than no answer.

**Defense 3 — Nothing the AI produces takes effect until an attorney confirms it.**
Extracted deadlines stage as `PENDING_REVIEW`. Drafts require section-by-section review plus a stored attestation. This is required by Texas Opinion 705, and it's also just correct.

**The takeaway for your code:** when you build an AI feature, ask *"what happens when the model is wrong?"* If the answer is "something bad and nobody notices," you need a guardrail before you ship.

---

## 4. The critique that stung: we automate *reading*, not *doing*

Here's where the review pushed back on us.

Every AI output in CounselOS is staged for human review. That's compliant — but it means the AI never actually *completes* anything. It proposes, a human disposes. And because of that, **our AI adds a verification step rather than removing one.**

That's the number one reason lawyers abandon AI tools. If it takes an attorney as long to check the AI's work as it would have taken to do it, they stop using it.

**But we've been over-applying the rule.** The ethics opinions require human review of *legal work product*. They say nothing about administrative tasks. There's a real gradient:

**Must be reviewed by a human** — deadline confirmation, document drafts, anything client-facing that's legal in nature, wire-fraud determinations, conflict clearances.

**Safe to automate** — deadline reminders, status update notifications, checklist advancement, internal task assignment, calendar population *after* the attorney confirmed the deadline, follow-up nudges.

We currently treat both categories identically. That's leaving value on the table.

**Two things this changes about how we build:**

**Make verification fast, not optional.** Pre-populate the confirmation screen. Link every extracted field back to the exact span in the source document. Support one-click and bulk confirm. The goal is to make checking take five seconds, not to skip it.

**Automate what happens *after* the human says yes.** Once an attorney confirms a deadline, populating the calendar, scheduling the reminders, and advancing the checklist can all happen automatically. The human gate stays; the downstream work stops being manual.

---

## 5. The biggest gap isn't an AI feature at all

We collect a lot of data — every activity, time entry, communication, deadline, checklist state, and transaction outcome. Immutable, timestamped, structured.

And we currently do **nothing** with it.

Every competitor ships analytics. We deferred reporting to Phase 2. That means CounselOS is entirely **defensive**:

- Don't miss a deadline
- Don't get defrauded
- Don't lose billable time

There's no **offensive** capability — nothing that helps the firm actually grow. And the data we're sitting on is exactly the data that would:

- **Closing rate / fall-through rate** — which deal types and referral sources actually close
- **Cycle time** — where deals stall
- **Per-matter profitability** — industry realization averages 88%, meaning roughly one in eight recorded hours never becomes revenue
- **Referral-source ROI** — which referrers send profitable, fast-closing work
- **Utilization** — the metric most predictive of firm profitability, industry average around 38%

**And here's the thing worth noticing:** almost none of that requires AI. It's SQL over data we already have. The highest-value thing we could build next isn't a fifth AI feature — it's a dashboard.

One honest caveat: the evidence that analytics *features* drive software retention is weak, and small firms underutilize reporting tools. So we build this because it genuinely helps our firm make money — not because we assume it's a moat.

---

## 6. What actually makes CounselOS defensible

This is the part to remember when someone asks what's special about what we're building.

**It is not the AI.** Deadline extraction, document chat, and wire-instruction extraction are commoditized. Dozens of products do them. The market has figured out that thin LLM wrappers aren't worth much — valuations for wrapper products have compressed sharply while workflow-integrated products hold value.

**It is the deterministic engines and the integration.**

- The Texas business-day calculation engine that knows the earnest-money deadline rolls to Monday but the option-fee deadline does not
- The wire-fraud comparison logic that catches a changed routing number
- The fact that a logged phone call becomes context for the AI chat
- The fact that a document upload triggers extraction, checklist advancement, and embedding in one motion

Encoded domain expertise and workflow integration are defensible. An API call to Claude is not.

---

## 7. What to take into your work

**Ask the pattern-matching question before reaching for an LLM.** Most "AI features" are deterministic logic that hasn't been thought through yet.

**Every AI output needs a failure plan.** What happens when it's wrong, and how would we know? If you can't answer, don't ship it.

**Never let the model fill a gap in our data.** If the context is empty, return the fallback. Silence beats a confident lie.

**Optimize the review step, not around it.** The human gate stays. Making it fast is the engineering problem worth solving.

**Deterministic where possible, AI where necessary.** That's not conservatism — it's what makes the product both trustworthy and cheap to run.

---

*Our AI is real. It's also not the point. The boring code around it is what makes this worth building.*
