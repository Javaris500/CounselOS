# 20 — What Review Keeps Missing

### The defect classes that survive a green suite, and the checks that actually catch them

**Read this before reviewing any module, and before writing the tests for one.** It is short on
purpose. Every entry below is a real defect that shipped into this repo, passed lint, passed
typecheck, passed every test that existed, and was caught late or by accident.

The organising claim: **our tooling catches malformed code, and our reviews catch missing code.
Neither catches code that is well-formed, present, and wrong about which rule it implements.**
That is the whole gap.

---

## Part 1 — The four miss-patterns

### M1. A level is used as a stand-in for a named population

**The shape.** A rule in prose names *specific people* — "OWNER, or the assigned attorney". The
code implements it with the nearest *permission level* — `FULL`. The level is wider. The code
reads as correct, cites the doc, and grants more than the doc allows.

**What it cost.** Three confirmed privilege escalations in Module 3, found 2026-08-24, after the
slice was merged:

| | what was permitted | why it read as fine |
|---|---|---|
| an assigned **paralegal** could grant matter access to the whole firm | `@MatterAccess('FULL')` | she legitimately has FULL |
| an assigned **paralegal** could reassign the matter's attorney and demote him to read-only | `assignedAttorneyId` on the general `PATCH` | it looks like a details field |
| a **two-week grant** could re-grant its own holder with no expiry | grant upserts and overwrites `expires_at` | the caller held FULL |

**Why every existing test passed.** The access suite was thorough in one direction only. Every
test asked *"is the WRONG person denied?"* — including a twelve-route enumeration against an
unassigned paralegal. **None asked "is the RIGHT person limited?"** All three attackers were
legitimately on the matter, so no denial test could ever have fired.

**The check.** For every permission gate, write down the *set of people* the prose names, then the
*set of people* the code admits, and compare them as sets. If the code's set is larger, the gate is
wrong even when every test is green. Then write the **adjacent-wrong-case test**: not "denied when
it should deny", but *"someone legitimately here does something they may not do"*.

### M2. A comment asserts the property the code lacks

**The shape.** A confident, specific, well-written comment states a guarantee. The code does not
provide it. The comment is *why* nobody re-checks — it reads as a review already done.

**Instances, all real:**

- `supabase.provider.ts` documented the exact cross-user session leak it had (`SURPRISES.md` 001).
- `transactions.controller.ts` said `FULL` "is exactly 'OWNER, or the assigned attorney' (13 §1)".
  It is not, and it cited the doc while being wider than it — see M1.
- `packages/shared/.../transaction.schema.ts` said "ONE definition, validating in the browser and
  at the Zod pipe" over a schema the Zod pipe never runs, with a helper annotated "Mirrors
  `money()` in the API's create DTO" that had **already drifted** — the browser accepted a price
  the server rejected.
- `packages/shared/.../types/transaction.ts` says "a mismatch becomes a compile error instead of a
  bug report". Nothing on the API side is annotated with that type, so there is no compile-time
  link in either direction. *(Still open — see Part 3.)*

**The check.** **Treat a load-bearing comment as a claim to verify, never as evidence.** The more
specific and confident it is, the more it is worth checking — a vague comment misleads nobody. When
a comment names a guarantee, find the line that enforces it or delete the sentence.

### M3. One rule, two implementations, no link

**The shape.** The same rule is expressed in two places that cannot drift *loudly*. Nothing fails
when they diverge; the product just behaves differently on two surfaces.

**Instances:** grant expiry evaluated against the injected `Clock` on the detail route and SQL
`now()` in the list predicate — so a Clock-pinned test could not pin the list. The create schema
duplicated between browser and pipe with divergent bounds. The `Transaction` wire type hand-written
beside the Drizzle row it describes. `OUTCOME_NOTES_MAX = 500` declared three times before it was
hoisted (error-log rows 4/8/10).

**The check.** When you find a rule stated twice, ask what makes them fail *together*. If the
answer is "a person remembering", it is drift waiting for a date. Prefer one definition; where the
shapes genuinely differ, name the seam explicitly and put the rule on one side of it only.

### M4. The doc describes the target, the tree describes reality

**The shape.** A doc references a file, path, or section that was planned and never built — or
built somewhere else. Someone follows the reference and loses an hour.

**Instances:** `seed/ids.ts` (never existed; the seed is one file) cost a Playwright fixture real
time. `01-architecture.md §8` in the attestation template — a doc that has never been in this repo,
sitting in an `e.g.` that teaches every attestation written after it. `CLAUDE.md` asserting
"`schema.ts` contains enums only — no tables" nine days after 27 tables landed, in the same section
that warns against exactly that.

**The check.** `/gap-check`, run before merging any slice — not only when something feels off. And
the standing rule it exists to enforce: **never claim a file, table, endpoint, or command exists
because a doc mentions it. Check the filesystem.**

---

## Part 2 — What this changes about how we work

**1. Every access-control review runs the set comparison in M1, in writing.** Named population vs.
admitted population. This is now part of the adversarial first-module review (merge-queue condition
3), and its output goes in the completion report.

**2. Every permission gate ships an adjacent-wrong-case test.** The negative-case rule
("wrong role → 403, invalid input → 422, not-found → 404") is necessary and was never sufficient:
it only ever tests outsiders. A permission gate without an insider-overreach test is incomplete in
the same way a module without an E2E test is incomplete.

**3. A finding is not confirmed until it has been executed.** All three escalations were provable
by reading the code, and all three were *proved* by running them against the real stack — a
throwaway E2E, deleted after. "I traced it" and "I ran it" are different claims; only the second
belongs in a report. This is cheap: the harness already exists.

**4. Never trust a green turbo cache as evidence.** The first verification run of slices 0 and 1
returned `FULL TURBO` — replaying logs cached from a **worktree path**, so lint and typecheck had
never executed against `main`'s tree at all. **When a run is being used as proof, force it.**

**5. Docs change in the same commit as the code.** Already the rule; the failures above are all
places it lapsed. `/gap-check` before merge is what makes the lapse visible.

---

## Part 3 — Open, deliberately not bundled

These were found in the 2026-08-24 review and are **not** fixed. They are recorded here so they are
not mistaken for handled.

- **The `Transaction` wire type is decorative** (M2 + M3). The API returns the full Drizzle row via
  bare `select()`, so every read ships `conflictCheckStatus`, `conflictCheckNotes`,
  `conflictCheckCompletedAt`, `aiDisclosureAcknowledgedAt`, `deletedAt` and four computed deadline
  columns that the shared type does not list. Harmless among firm staff today. **Slice 9 is the
  client portal and will reuse this shape** — attorney conflict notes are not client-facing. Fix is
  an explicit column projection in the repository, typed so TS enforces correspondence. Not bundled
  with a security fix because it changes the response shape across six components and 48 browser
  tests, and wants its own review.
- **`health.service.ts` holds an in-memory `Map` cache**, the only non-Redis cache in the codebase,
  in the module Architecture Rule 4 names. Two HTTP replicas will disagree for up to 30s on a
  service-honesty surface. Needs a Redis move or an explicit written exemption.
- **The `Card` primitive has zero consumers and two hand-rolled duplicates** shipped in the same
  commit that registered it. Real constraint underneath (a pipeline card must be an `<a>`; `Card`
  has no `href` form). Foundations' decision — see `.team-5/shared/pattern-registry.md`.
- **`common/decorators/matter-access.decorator.ts` imports a type from a module's repository.**
  Type-only, so no runtime coupling, but `common/` should not depend on a module's repository file
  and slice 2's guard will follow the same path. Move `MatterAccessContext`.
- **The guard's UUID regex is stricter than the `uuid` column** — it requires a v1–v8 version nibble
  and an RFC variant. A non-conforming id from the slice-11 CSV import would 404 on a row that
  exists. Seeded ids are valid v4 and pass.

---

## Part 4 — The pre-merge checklist this produces

Additions to the review checklist in `CLAUDE.md`. Not a replacement for it.

- [ ] For each permission gate: named population vs. admitted population, compared **as sets**
- [ ] At least one **adjacent-wrong-case** test per gate — an insider doing something they may not
- [ ] Every load-bearing comment's guarantee traced to the line that enforces it
- [ ] Any rule stated twice: what makes the two fail together?
- [ ] Any field that feeds an access decision: is it writable through a route that does not look
      like an access-control route?
- [ ] `/gap-check` run, and clean
- [ ] Verification runs **forced**, not cache-replayed (`--force`), and the counts recorded
- [ ] Findings **executed**, not only traced
