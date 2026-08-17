---
description: Senior-level pre-merge code review — types, roles, module boundaries, tests
---

Review $ARGUMENTS as a senior engineer doing a rigorous pre-merge review. Do not tell me it looks good unless you've actually tried to break it. I want the honest version of this review, not the encouraging one.

**Assume you did not write this code.** Review it the way you'd review a stranger's PR — do not confirm choices just because they're already there.

Read in this order, not file-by-file:

## 1. Types first, alone, before any logic

- Is every entity type **inferred** from `schema.ts` (`typeof x.$inferSelect`), or is anything hand-written that shadows a Drizzle table? Hand-written duplicates *will* drift the first time the schema changes — flag every one.
- Is anything "stringly typed" that should be a union or enum? Check `packages/shared` for an existing enum before assuming one doesn't exist — redefining values as raw strings next to an existing enum is drift on day one.
- Find every `any` and unjustified `unknown`. For each, tell me whether it's defensible or laziness.

## 2. Role / access logic second, adversarially

- Trace the resolution order **by hand** against what's documented in `docs/02-repo-structure.md` and `docs/13-adoption-features.md` (matter-level access: OWNER bypasses → assigned attorney/paralegal full access → `matter_access` grant → ATTORNEY read-only fallback → else denied). Don't just confirm it "looks right" — walk each branch and tell me what actually happens.
- Specifically hunt for this bug pattern: code that checks a **plausible** field instead of the **correct** one — e.g. `user.role === 'ATTORNEY'` when the requirement was "assigned attorney on *this* matter." This compiles, looks reasonable, and is wrong. It's the single most common AI-generated access bug.
- What happens at every boundary? An expired `matter_access` grant — denied, or does an off-by-one leave it open one day too long? A user with no matching role at all — does it default-deny, or fall through to allow?
- Give me the specific adjacent-wrong-case test I should run manually: not "denied when it should deny," but "granted access to the *wrong* resource."
- Do permission denials return the explaining error shape (`reason`, `assignedAttorney`, `requestAccessFrom`) or a bare 403?

## 3. Module wiring third

- Does every module match the shape in `docs/02-repo-structure.md` exactly — `module.ts`, `controller.ts`, `service.ts`, `repository.ts`, `dto/`?
- Search explicitly for any module importing another module's **repository** instead of its **service**. This is the one rule that must never break — grep for it, don't eyeball it.
- Does the controller contain any business logic? Does the service touch the database directly instead of going through the repository?
- Is `instrument.ts` the literal first import in `main.ts`?
- Is any state (rate limits, caches) held in memory instead of Redis? With two processes (HTTP + worker), in-memory state is wrong by construction.

## 4. Tests last — and only after reading them without reading the implementation first

- Could you reconstruct the requirement from the test names and assertions alone? If not, the tests aren't doing their job.
- Flag any test that only asserts a mock was called (`expect(mockRepo.update).toHaveBeenCalled()`) without asserting the actual resulting state. That proves nothing about correctness.
- For every endpoint/function reviewed: is there a test for the wrong role, invalid input, and not-found case? Happy-path-only coverage is incomplete, full stop.
- If this is gated by an E2E test (per `docs/01-codebase.md`), does the test actually exercise the real HTTP stack with a real JWT — or does it mock something it shouldn't?

## Then tell me directly

- What's the **weakest part** of this you're least confident is correct?
- What did you flag as "fine" that you'd actually want a second pair of eyes on if this were going to production tomorrow?
- Is there anywhere the code **looks** uniform across files but actually isn't — one module quietly doing something differently than its siblings?
- Does anything here contradict `docs/03-schema.md` or `docs/05-backend-checklist.md`? If so, name the conflict — don't silently assume the code is right and the doc is stale, or vice versa.

Do not soften this. If something is slop dressed up as done, say so plainly.
