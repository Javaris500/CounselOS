# Drafts — Team-5
<!-- v1 · Team-5 · slice agent -->

You own the highest-stakes surface in the product. When an attorney approves a draft, they sign an attestation that they reviewed it — under Texas Opinion 705, with their license attached. If your gate can be bypassed, they signed for work they never read. That is not a UI bug. Build it, then try to break it.

## You own
Section-by-section draft review, the attestation modal, and approve/send gating. The compliance gate is the deliverable — the UI around it is in service of it.

## Slice hard stops
- **NEVER style-disable the Approve control.** It is disabled by `sectionsReviewed.size === sections.length` in real component state, read from the same render-time value as `sections`. A CSS class is not a gate.
- **NEVER add a bypass.** No dev flag, no query param, no "approve all," no test shortcut — for any reason, including testing convenience. If a test needs to reach the approved state, it reviews every section like a human would.
- **NEVER let a stale `sections` value drive the gate.** A revalidate mid-review must not open it. Derive both sides of the comparison from one read.
- **NEVER auto-send.** Nothing reaches a client or counterparty without an explicit human action after the attestation.
- **NEVER render a section without the AI-teal marker.** Every section is machine-generated.

## Triggers
- IF a section is marked reviewed → THEN update the set; recompute the gate from current state.
- IF all sections are marked → THEN enable Approve and require the attestation before the mutation fires.
- IF `draft.ready` revalidates mid-review → THEN re-read sections and keep the gate closed unless the count still holds.
- IF you finish building the gate → THEN attack it. Write the attestation record in `.team-5/compliance/` with your bypass attempts. Zero attempts is a failed verification.
- IF a Pattern Registry primitive you need does not exist → THEN the foundation gate has not passed. Stop and report. Do not build it yourself, and do not work around it.
- IF the value you need has no token in globals.css → THEN it is not yet a token. Stop and report. Never inline a hex, px, or ms — an invented value is invisible in review because one hex looks as reasonable as another.

## Shared discipline — identical in every Team-5 agent file

*This block is verbatim in all six files. If your copy differs from another agent's, yours is wrong.*

- **Server data lives in SWR and only SWR.** Keys come from `lib/api/queryKeys.ts` — the literal
  API path, never hand-built. Ephemeral UI state goes in component state or the two Zustand
  stores. Never both.
- **Invalidation is declared on the mutation**, in `lib/api/mutations.ts`, never at the call site.
- **Four states or it isn't done:** loading (content-shaped skeleton, never a bare spinner),
  empty (designed, brand voice), error (mapped per `error.code`), success. A surface that only
  works with populated happy-path data is unfinished.
- **Switch on `error.code`, never parse `message`.** Messages change freely; codes are the contract.
- **Check the Pattern Registry before building any recurring element.** If it's listed, use it —
  you may not build your own. If it's not listed, build it and register it in the same commit.
- **Tokens only.** Every color, space, radius, and duration comes from Design System v5 as a
  `var(--token)` in `apps/web/src/app/globals.css` — the machine-readable canon. Rationale,
  contrast ratios, and the density modes are in `docs/07-design-handoff.md`; the rendered
  reference is `docs/design-system-v5.html`. **No literal hex, px, or ms in a component, ever.**
  Urgency uses the ladder and **never hue alone** — pair it with weight, an icon, a label, or a
  rule, and test it with color removed. AI-generated content **always** carries the AI-teal marker.
- **`data-testid` in the same commit as the component** — `{domain}-{element}-{action?}`,
  kebab-case. The pre-commit hook enforces it; treat it as a habit, not a hook you're fighting.
- **Stay inside your file boundary.** `may_edit` is yours. `queryKeys.ts` and `mutations.ts` are
  append-only, following the existing pattern — never modify an existing entry, never change the
  pattern. `components/ui/`, `stores/`, and `lib/api/client.ts` are never yours.
- **Log every shared-file touch** in `.team-5/shared/shared-file-touches.md`, same commit.
- **Log every contract drift** in `.team-5/shared/contract-drift.md`. Never silently adapt your
  component to reality and move on — that fixes your branch and leaves the doc wrong for everyone.
- **Never invent a shape the contract doesn't define.** File the gap; don't unblock yourself locally.

## Done when
- Approve is driven by state, verified in the DOM, not the styling.
- You attempted at least five bypasses and documented that each failed.
- `bypass_found: false` in a compliance attestation, verified by someone other than you.
- Attestation is stored before approval completes.
- Every section carries the AI marker.
- Your slice's Playwright gate is green.

Every other agent here builds something that should work. You build something that must not fail. Treat your own gate as hostile — the only verification that counts is the one where you tried to defeat it and couldn't.
