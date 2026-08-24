---
# WRITTEN BY: reviewer or /review, at merge review.
# FILENAME:   nemi-slice-1-findings.md

reviewer:                 nemi
slice:                    1
target_agent:             transactions      # findings 6-9 are about the OPERATOR / the harness
branch:                   test/nemi-slice-1
reviewed:                 2026-08-24
findings_count:           10
severity:                 [warn, warn, warn, warn, note, warn, warn, note, note, note]
categories:               [unhandled-error-code, competing-pattern, other, contract-drift,
                           missing-state, other, other, other, missing-testid, contract-drift]
gate:                     pass
---

## Findings

**Gate result first, because it is what the operator acts on.** The slice 1 browser gate is
**GREEN**, and so is the clause slice 0 deferred. 48 browser tests pass against the real stack.
Nothing below blocks the merge. Findings 1 and 2 are the two that a user meets; findings 6-8 are
the ones the next five slices will each pay for again if they are not fixed now.

---

### 1. The explaining denial is thrown away by the component that renders it — WARN (unhandled-error-code)

**What.** `MatterAccessService.denial()` does exactly what `13-adoption-features.md` §1 asks: it
returns `MATTER_ACCESS_DENIED` with a message naming the assigned attorney, plus
`details.reason`, `details.assignedAttorney` and `details.requestAccessFrom`. The backend half of
"permission errors must explain themselves" is correct and tested.

`ErrorState` then discards all of it. It maps the CODE to a fixed sentence —

> "You don't have access to this matter. Ask the assigned attorney to add you."

— and never reads `error.message`, `error.details`, or renders the button 13 §1 requires. The
paralegal is told to ask "the assigned attorney"; the server knew it was James Okafor and said so.

**Where.** `apps/web/src/components/ui/ErrorState.tsx:22-23` (the mapped copy), and every caller
that passes only `code` and `requestId`: `TransactionShell.tsx:94-97`, `PipelineBoard.tsx:63-67`,
`ActivityFeed.tsx:38-41`.

**Why it is a `warn` and not a blocker.** The gate clause reads "sees the **explaining** error, not
a bare 403", and what renders is genuinely not a bare 403: it is actionable prose, mapped from a
typed code, announced with `role="alert"`. The clause passes. But the specific mechanism the
dispatch names — `reason`, `assignedAttorney`, `requestAccessFrom` — reaches the browser and dies
in the component, so the feature that 13 §1 calls "the part teams skip" is skipped in the last
five lines of its own path.

**The same product already gets this right on the other path**, which is what makes it a defect
rather than a decision: `StatusControl.tsx:84-86` renders `error.message` verbatim for the same
code, so an attorney refused a status move DOES read "You have read-only cover on this matter.
Elena Rodriguez can give you full access." Two paths, one error code, two levels of helpfulness.
Proven in `slice-1-access.spec.ts` — the status-move test asserts the named message; the
page-load test can only assert the generic one.

**Fix.** `ErrorState` takes an optional `message` and `details`, prefers the server's message when
present, and renders the request-access action when `details.requestAccessFrom` exists. Keep the
code→copy map as the fallback for codes with no useful server message (`INTERNAL_ERROR` must never
render server text). `ErrorState` is `components/ui/` — Foundations' file, not the transactions
agent's, so this is an operator or Foundations change.

---

### 2. A refused transition names the wrong origin state — WARN (competing-pattern / correctness)

**What.** The rejection banner renders two sentences. The first is the server's message and is
right. The second is composed locally:

```
From {STATUS_LABELS[transaction.status]} this matter can move to {allowed}.
```

`transaction.status` is the STALE local value — it has to be, because a stale view is the only way
a browser can request an illegal transition at all. `rejection.allowed` is the SERVER's list,
computed from the real status. So the two halves of one sentence describe two different matters.

Observed live, in `slice-1.spec.ts`:

> A matter in Closing Prep cannot move to Under Contract.
> **From Due Diligence** this matter can move to **Closed, Fell Through**.

Closed is not reachable from Due Diligence. The banner states, in the product's own voice, a
transition rule that does not exist — and it does it in the one message whose entire purpose is
to teach the attorney the rule.

**Where.** `apps/web/src/components/features/transactions/StatusControl.tsx:146`.

**Fix.** One line. The server already sends `details.from`; read it instead of the local status:
capture `from: error.details?.from?.[0]` alongside `allowed` in the catch at line 77-80, and render
that. As a bonus the sentence stops being a lie about which matter it is describing.

**Not asserted in the gate**, deliberately: it fails no clause, and encoding the current wrong text
in a test would make the bug harder to fix than to keep.

---

### 3. `Card` was registered as a canonical primitive and then never used — WARN (competing-pattern)

**What.** The Pattern Registry audit's one real violation. `components/ui/Card` was built and
registered in commit `77bc39b`, correctly in the same commit, with a rationale that reads:

> "Registered because it was the element every slice was about to invent: a pipeline card, a party
> card, a deadline card, a draft card. Four near-identical divs with four slightly different border
> colours is exactly the divergence the registry exists to prevent."

`Card` is imported by exactly one file: `components/ui/index.ts`, which re-exports it. Zero
consumers. Meanwhile the same commit shipped **two** hand-rolled versions of it:

| | tokens |
|---|---|
| `ui/Card.module.css` `.card` | `--pad-compact` · `--surface-card` · `1px --border` · `--radius-md` |
| `features/transactions/TransactionCard.module.css` `.card` | `--s-2 --s-3` · `--surface-card` · `1px --border` · `--radius-md` |
| `features/transactions/TransactionOverview.module.css` `.panel` | `--pad-compact` · `--surface-card` · `1px --border` · `--radius-md` |

`.panel` is `Card` with the padding token identical. `.card` differs only in padding and in being
an anchor.

**Why it matters more than three CSS blocks.** The registry's promise is "if it's listed, use it —
you may not build your own". The very first slice registered a primitive and then built its own
twice, in the same commit. The next five agents read the registry, see `Card | exists`, and
inherit a primitive with no proven usage — while the codebase already contains two competing
precedents to copy. This is the divergence the file exists to prevent, arriving through the file
itself.

**There is a real constraint underneath**, and it is why this is a `warn` and not a blocker:
`TransactionCard` must be an `<a>` for keyboard activation and open-in-new-tab (asserted in
`slice-1-a11y.spec.ts`), and `Card` offers only `<div>` or `<button onClick>`. `Card` has no `href`
form. That is a gap in the primitive, not a licence to fork it.

**Fix, one of two, and it is a decision for Foundations:**
(a) give `Card` an `href` variant that renders `next/link`, and rebuild `TransactionCard` and
`.panel` on it; or
(b) if `Card` is genuinely not the right shape for either, say so — flip its registry row or
append a finding row arguing the pattern should change, per the registry's own instruction. What
must not stand is a canonical primitive with zero consumers and two live duplicates.

---

### 4. The dispatch says the allowed transitions render "as buttons". They render as text — WARN (contract-drift)

**What.** `nemi-slice-1-dispatch.md:80` and the launch brief both state: "`INVALID_STATUS_TRANSITION`
returns `details.allowedTransitions` and the UI renders them as buttons." It does not.
`StatusControl.tsx:144-154` renders them as a comma-joined `<strong>` inside a `<p>`. The clickable
buttons above the banner come from `transaction.allowedTransitions` — the STALE list — so after a
refusal the only pressable moves on screen are the ones that just failed.

**Where.** `StatusControl.tsx:118-133` (the buttons, stale) vs `:139-156` (the banner, fresh).

**Why it matters.** The gate clause says "visible reason", and a visible reason is what ships — the
gate is green on the clause as written. But the dispatch's stronger claim is the more useful
product: after a refusal the attorney is looking at three buttons that will all be refused, and a
sentence telling them about two moves they cannot click. Rendering the banner's list as buttons
would close finding 2 as a side effect, since the buttons would come from the server's list.

**Fix.** Either build it (banner list → buttons that call `commit()`), or correct the dispatch and
`docs/00-developer-guide.md` §7's expectation. Flagging rather than picking, per CLAUDE.md's
conflict rule.

---

### 5. The seed writes no `activity` rows, so the feed's success state is unreachable from fixtures — NOTE (missing-state)

**What.** `apps/api/src/database/seed.ts` seeds firms, users, transactions, parties, deadlines,
leads and holidays. It seeds no `activity` rows. Every seeded matter's activity feed is therefore
EMPTY, and the feed's populated state cannot be reached without first mutating something through
the UI.

**Where.** `seed.ts:143-330`. Found by `slice-1-states.spec.ts` failing on `manorRd` with "element
not found" for `transaction-activity-feed`.

**Why it matters.** The activity feed is the surface the whole product-thesis paragraph in
`ActivityFeed.tsx` is about — "a colleague picking up a matter cold can read what happened and
when" — and the demo fixtures show it empty on every matter. It is also a per-slice tax: every
later slice that wants to see a populated feed has to manufacture history first, as this one now
does.

**Fix.** Seed a handful of `activity` rows on `manorRd` and `clawsonRd` — status changes, a party
added — dated relative to `SEED_ANCHOR` like the deadlines are. `11-test-data.md` Part 3 should
name them. Foundations' file.

---

### 6. A file-based `storageState` cannot work against this API, and the trap is silent — WARN (other)

**Target: the operator / every later dispatch.**

**What.** The dispatch asks for "one state per role", which reads as Playwright's standard shape: a
setup project logs in once per role and writes `.auth/attorney.json`; every later test points at
the file. Against this API that produces a suite where the first test passes and the second lands
on `/auth/login`, with no error message connecting the two.

The cause is correct behaviour: **the refresh token rotates on use.**
`AuthService.refresh()` hands the presented token to Supabase; the fake Supabase at :54321 mirrors
real Supabase by DELETING it and issuing a successor; the API sets the successor as the cookie. The
access token lives in memory and nothing durable is stored on the origin, so the cookie is the
whole of the stored state — and it is a SINGLE-USE credential. The first test to load a protected
page consumes it. The file still holds the dead one.

**Where.** `apps/api/src/modules/auth/auth.service.ts:150-162`, `apps/api/test/fake-supabase-auth.ts:147-157`,
`apps/web/src/lib/api/client.ts:104-108`.

**Resolution, already applied.** `e2e/fixtures/auth.ts` mints a session per test through
`/v1/auth/login` and hands Playwright a `storageState` OBJECT. The rule that matters — no test
drives the login form — holds; slice 0 remains the only place that form is exercised. The file was
never the point.

**Why it is filed rather than just fixed.** Every later slice's dispatch will describe the same
"storageState per role" shape, and the next agent will reach for the file first and lose an hour
to what looks like flake. The dispatch template should say: **auth comes from the fixture in
`e2e/fixtures/auth.ts`; do not write a `.auth/*.json`.**

---

### 7. `seed.ts` cannot be imported by a Playwright spec, and its own header says it can — WARN (other)

**Target: Foundations.**

**What.** `seed.ts:10-15` promises: "Playwright imports these rather than hardcoding a UUID." It
cannot. `import { SEED_IDS } from '.../seed'` inside a spec dies at transpile:

```
SyntaxError: apps/api/src/database/database.module.ts: Decorators cannot be used to
decorate parameters. (87:14)
```

`seed.ts:4` imports `PG_CLIENT_OPTIONS` from `database.module.ts`, which is a NestJS module with
constructor parameter decorators. Playwright transpiles specs with its own Babel setup and does not
enable the legacy decorator transform, so reading one plain constant drags an entire NestJS module
through a parser that cannot handle it. tsx can, which is why `fake-supabase-auth.ts` imports the
same module without trouble — it is run with tsx.

**Where.** `apps/api/src/database/seed.ts:4` → `apps/api/src/database/database.module.ts:87`.

**Workaround, applied.** `e2e/fixtures/seed.ts` runs `print-seed-ids.ts` under tsx and parses the
output. The IDs still come from the seed and nowhere else, so the rule holds — but it costs a
subprocess per Node process and it is a surprise the next agent will re-derive.

**Fix.** `PG_CLIENT_OPTIONS` is a plain options object; move it to a file with no NestJS in it
(`database/pg-options.ts`), imported by both `database.module.ts` and `seed.ts`. Then the direct
import works and this fixture collapses to one `export {}` line.

---

### 8. The browser gate could not start on a clean tree — WARN (other)

**Target: Foundations / the operator.**

**What.** `packages/shared/dist/` is gitignored and nothing in the Playwright path built it. Both
servers therefore failed on a fresh checkout of this branch: the API with ~40 lines of
`TS2307: Cannot find module '@counselos/shared'`, and — had it got that far — the web server on its
first page compile. Playwright reported only `Error: Process from config.webServer was not able to
start. Exit code: 1`, so it reads as broken imports in `src/`.

`apps/api`'s `build` script is `nest build`; it does not build its workspace dependency. Nothing
else in the browser-gate path does either — `globalSetup` runs AFTER `webServer`, and putting the
build inside one webServer command races the other, which starts concurrently.

**Where.** `apps/api/package.json` `build`; `apps/web/playwright.config.ts` `webServer`.

**Resolution, applied at the only point that works.** `playwright.config.ts` builds
`@counselos/shared` at config module scope, before either server starts, skipped inside workers.
Documented in the file.

**Fix.** Upstream: `apps/api`'s and `apps/web`'s `build` should depend on `@counselos/shared`'s, or
the browser gate should run through turbo, which already knows the graph. Then the config prelude
comes out. Both files are outside this dispatch's boundary.

---

### 9. `Field` builds an error id and never uses it — NOTE (missing-testid / a11y)

**What.** `components/ui/Form.tsx:67` computes `const errorId = \`${htmlFor}-error\`` and puts it on
the error paragraph, but no control is ever given `aria-describedby={errorId}`. The message is
announced when it appears (`role="alert"`), so nothing is silently lost — but a screen-reader user
who tabs BACK to the offending field afterwards hears the label and no error.

**Where.** `apps/web/src/components/ui/Form.tsx:66-81`.

**Fix.** `Field` clones its child with `aria-describedby={error ? errorId : undefined}` and
`aria-invalid`, or exposes both through the render signature. `Select` already accepts `invalid`
and sets `aria-invalid`, so half the wiring exists. `components/ui/` is Foundations' file.

Related, same severity, no separate entry: `Skeleton` is `aria-hidden="true"` with no `aria-busy`
or live region, so a loading board announces only its column headings. Acceptable — the headings
are real content — but a deliberate `aria-busy` on the container would be better.

---

### 10. A code comment points at a findings file that is not in this branch — NOTE (contract-drift)

**What.** `apps/web/src/lib/api/client.ts:205` reads "See
`.team-5/findings/operator-slice-1-browser-findings.md`." That file does not exist anywhere in
`test/nemi-slice-1` or its history. Both fixes it describes ARE in the history (`983c919`,
`b50991a`); the finding that explains them is not — it is staged-but-uncommitted in the main
worktree.

**Why it is worth a line.** CLAUDE.md: "Never write a cross-reference to content that doesn't exist
yet. A doc pointing at a section that was never written has already caused two real bugs here." The
comment is the clearest explanation in the codebase of why `apiFetch` returns an envelope for
paginated routes, and it currently points at nothing.

**Fix.** Commit the findings file, or drop the reference.

**On the operator's OPEN finding 2 in that file, which the launch brief describes** — an illegal
transition to `CLOSED` returning `VALIDATION_ERROR` ("Record why this matter ended") from the Zod
pipe before the service can return `INVALID_STATUS_TRANSITION`. **What the browser adds: that
ordering is unreachable through the UI as built.** `StatusControl.start()` routes any terminal move
into the outcome dialog first, and `commit()` is only ever called with an `outcomeReason` attached
— so the pipe's `superRefine` never fires on a browser request, and an illegal terminal transition
reaches the service and returns `INVALID_STATUS_TRANSITION` correctly. Verified live: a stale tab
offering "Closed" on a matter that has since fallen through renders "There are no transitions
available from here."

That downgrades the urgency but does not close it. The defect is real for any non-browser client —
a curl, an integration, or another module calling `TransactionsService.updateStatus()` directly —
and it tells them to supply a field that cannot help. The fix is still to check the transition
before the outcome requirement.

---

## What the Pattern Registry audit found

**The same-commit rule: PASS, all three.** `Card`, `Tabs` and `Select` were registered in `77bc39b`,
the same commit that created `ui/Card.tsx`, `ui/Tabs.tsx` and `ui/Select.tsx` and added them to
`ui/index.ts`. Verified against the commit's file list, not against the claim.

**Genuinely new: yes, all three.** No prior row covered a bordered surface, a tab strip, or a
dropdown, and none of the twelve slice-0a primitives overlaps any of them.

**Entries match what shipped: two of three.**
- `Tabs` — accurate. "Links not buttons, so tabs deep-link; a tab with no `href` renders DISABLED,
  never hidden" is exactly what `Tabs.tsx` does and what `slice-1-states.spec.ts` and
  `slice-1-a11y.spec.ts` assert (ten tabs, one `aria-current="page"`, the rest `aria-disabled`).
- `Select` — accurate. Native `<select>`, `options` rather than children, `aria-invalid` on
  `invalid`. Keyboard and typeahead come from the platform, as claimed.
- `Card` — **inaccurate.** The row says "bordered surface; `accent` left rule pairs with a Badge,
  never colour alone". Nothing in the slice uses it, and its `accent` prop has never rendered.
  See finding 3.

**Nothing else in the slice duplicates an existing primitive.** Checked every recurring element the
slice shipped against the fifteen registry rows: `Dialog` (create + outcome), `Button`, `Select`,
`Badge`, `Skeleton`, `EmptyState`, `ErrorState`, `Toast`, `Tabs` and the `react-hook-form` +
`zodResolver` + shared-schema form are all consumed from `@/components/ui`. No second modal, no
second skeleton, no second form pattern, no hand-rolled listbox. The rejection banner in
`StatusControl` is slice-specific rather than a fork of `ErrorState` — it renders a server-supplied
list, which `ErrorState`'s code→copy mapping cannot express — and that is the right call.

**No `planned` primitive was used or reimplemented.** All fifteen rows read `exists`.

## What the divergence audit found

- **Duplicate query keys:** none. `keys.transactions()`, `transaction(id)` and `activity(id)` were
  already in `queryKeys.ts` before the slice; the slice added none and logged none, correctly.
- **Missing invalidation:** none. `updateTransactionStatus` invalidates `transaction`,
  `transactions`, `activity(id)` and `dashboard`; `createTransaction` invalidates `transactions`
  and `dashboard` (a new matter has no activity key to stale). Proven in the browser, not read off
  the source: `slice-1.spec.ts` asserts the activity feed reaches three entries after two status
  moves with no reload.
- **Unlogged contract drift:** none found. Six entries in `contract-drift.md`, and each one matches
  something real in the tree.
- **Boundary violations:** none by the transactions agent within this branch's history.
  `check-mounts.sh` PASSes on this dispatch.

## Accessibility verdict

**Pass, on this slice's surfaces, with finding 9 outstanding and no blocker.** Sixteen assertions in
`slice-1-a11y.spec.ts`, all green. What was actually proven:

- **Keyboard**, end to end: Tab reaches "New matter", Enter opens the dialog, focus lands INSIDE it,
  Escape closes it. Pipeline cards are real anchors with real hrefs — Enter navigates. Every status
  move is a real `<button>` with a non-empty accessible name, and `Button` disables genuinely rather
  than cosmetically.
- **The deliberate exception is pinned**: the outcome dialog REFUSES Escape (`dismissible={false}`),
  because `outcome_reason` cannot be captured later. That is a knowing deviation from "Escape always
  closes a modal", so it is asserted — otherwise someone reading a generic a11y checklist will
  "fix" it and silently reopen a `16 §2.3` gap. Cancel is still reachable, so nobody is trapped.
- **Labels**: all eleven controls in the create dialog resolve through `getByLabel` — real
  `<label for>`, not bolted-on `aria-label`. The dialog names itself via `aria-labelledby`. The tab
  strip is a `<nav aria-label="Matter sections">` with `aria-current="page"` on the active tab.
- **Contrast**: computed, not eyeballed — WCAG 2.1 relative luminance against the first OPAQUE
  ancestor background, at the real threshold for each element's own size and weight. Every status
  tone on the board, the matter title, the status badge, a status move, the active tab and the
  field-error text all clear AA. The walk-up to an opaque ancestor is the load-bearing part:
  comparing text against `rgba(0,0,0,0)` scores a perfect ratio and hides every real failure.
- **Colour removed, twice, because the failure modes differ.** A grayscale filter kills hue and
  keeps the author's layout; `forcedColors: active` discards the palette wholesale. Under both, the
  status ladder still reads — every `[data-tone]` badge carries mandatory text, and no two statuses
  share a label (that would be hue by the back door). Under forced-colors the refusal banner still
  explains itself in words, and "Fell Through" is distinguishable by its label rather than by being
  the red one.
- **Not covered, and named so it is not mistaken for covered**: no axe-core sweep (not a dependency
  of `@counselos/web`; adding one is outside this dispatch's boundary — **recommended**), no screen-
  reader transcript, no mobile viewport (slice 4's gate is the first to require one), no reduced-
  motion check, and no zoom/reflow check at 200%.
