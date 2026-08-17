---
description: Find broken cross-references across docs/ before they cause the drift bugs we've already hit twice
---

Scan `docs/` and `memory/` for cross-reference drift. This project has already shipped two real bugs from this exact pattern — a doc pointing at a section/file that didn't exist (`01-codebase.md` pointing at a slice order that was never written into `00-developer-guide.md`, and `FullBackend.md` referencing content that had gone stale). Take this seriously.

## What to check

**1. File references.** Every mention of a `docs/NN-name.md` filename, a `memory/Name.md` filename, or `CLAUDE.md` — confirm the file actually exists at that path. List every dangling reference with the file and line it appears in.

**2. Section references.** Every mention like *"see the Slice Order in 00-developer-guide.md"* or *"the invalidation map in 06-frontend-architecture.md"* — open the target file and confirm a section by that description actually exists there, not just that the file exists. A file existing with the wrong content is the same bug as a missing file.

**3. Renamed/moved content.** If a doc says "full spec in X" — open X and confirm the spec is actually there, not stubbed, not TODO, not moved elsewhere without the reference being updated.

**4. Enum and type cross-references.** If a doc mentions an enum value, table name, or endpoint that should exist in `03-schema.md` or `05-backend-checklist.md`, verify it's actually there with a matching name. Flag anything that looks like it was renamed in one doc but not the other (e.g. `outcome_reason` vs `outcomeReason` vs a doc still calling it something else).

**5. The precedence rule itself.** Per `docs/README.md`: schema wins for data shape, checklist wins for behavior. If you find a place where they actually disagree — not just where one has detail the other lacks, but where they contradict — flag it explicitly rather than assuming which one is right.

**6. Non-shipping docs bleeding through.** `docs/README.md` names `CounselOS_FullBackend.md`, `GlobalSummary.md`, `Brand.md`, `AdvancedFeatures.md`, `StudentNotes.md`, `SyncReport.md`, `BackendUpdatePrompt.md`, and `AttorneyFlow.html` as explicitly NOT shipping in the repo. If any other doc references one of these as if it's available to read, that's a dangling pointer to a file that was never meant to be here — flag it as high priority, since it means someone will go looking for a doc that doesn't exist in this repo.

## Output format

Group findings by severity:

**BROKEN** — reference to a file or section that does not exist at all. These are bugs, fix immediately.

**SUSPICIOUS** — reference exists but the content doesn't obviously match the description (e.g. "see the E2E gate for Slice 3" but that file has no content clearly describing a gate for Slice 3).

**STALE NAMING** — same concept referenced with different names/casing across docs, likely to confuse a reader or a future grep.

For each finding: the file and line where the bad reference lives, what it's pointing at, and why it doesn't resolve. Do not just say "some references may be broken" — check every one you find and report definitively.

If everything resolves cleanly, say so plainly and don't manufacture findings to seem thorough.
