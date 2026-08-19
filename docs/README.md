# CounselOS — Documentation Index
### What ships in the repo, what doesn't, and which doc answers which question

> This is the map. Nobody reads 20 documents — they read this, then the two or three their task needs.

---

## Repo Layout for Docs

```
counselos/
├── CLAUDE.md                    ← repo ROOT (Claude Code reads it automatically)
├── README.md                    ← derived from DeveloperGuide, see note below
└── docs/
    ├── README.md                ← this file
    ├── design-system-v5.html    ← the authoritative design source
    ├── 00-developer-guide.md
    ├── 01-codebase.md
    ├── 02-repo-structure.md
    ├── 03-schema.md
    ├── 04-data-contracts.md
    ├── 05-backend-checklist.md
    ├── 06-frontend-architecture.md
    ├── 07-design-handoff.md
    ├── 08-prompts.md
    ├── 09-legal-compliance.md
    ├── 10-tdd-guide.md
    ├── 11-test-data.md
    ├── 12-moat-features.md
    ├── 13-adoption-features.md
    ├── 14-module-notes.md
    ├── 15-project-context.md
    ├── 16-compliance-gaps.md
    ├── 17-ai-principles.md
    ├── 18-nestjs-conventions.md
    └── 19-commit-and-merge.md
```

Numbering is deliberate — it gives the folder a reading order instead of alphabetical noise.

---

## SHIPS IN THE REPO (18 files)

These are needed while writing code. Every one answers a question an engineer will have mid-task.

| # | File | Source doc | What it answers |
|---|---|---|---|
| — | `CLAUDE.md` **(root)** | `CLAUDE.md` | Standing rules for Claude Code — architecture, conventions, what not to do |
| — | `README.md` **(root)** | from `CounselOS_DeveloperGuide.md` | Clone → configure → run. Day one. |
| 00 | `00-developer-guide.md` | `CounselOS_DeveloperGuide.md` | Setup, env vars, commands, **slice order with Playwright gates**, git workflow, definition of done |
| 01 | `01-codebase.md` | `CounselOS_Codebase.md` | How we develop: module loop, the two E2E layers, vertical slices, PR checklist |
| 02 | `02-repo-structure.md` | `CounselOS_RepoStructure.md` | Where a file goes. Module shape. The service-not-repository rule. |
| 03 | `03-schema.md` | `CounselOS_Schema.md` | **Source of truth for data.** Full Drizzle schema + migrations. |
| 04 | `04-data-contracts.md` | `CounselOS_DataContracts.md` | Why each entity/field exists, relationships, API response shapes |
| 05 | `05-backend-checklist.md` | `CounselOS_Backend_Checklist.md` | **The task list.** Every layer, every checkbox. |
| 06 | `06-frontend-architecture.md` | `CounselOS_FrontendArchitecture.md` | SWR keys, SSE→cache reconciliation, state ownership, optimistic updates |
| 07 | `07-design-handoff.md` | `CounselOS_DesignHandoff.md` | Design System v5 tokens, screens, voice |
| — | `design-system-v5.html` | `CounselOS_Design_System_v5_dc.html` | The authoritative design source |
| 08 | `08-prompts.md` | `CounselOS_Prompts.md` | Canonical versioned AI prompts + the deterministic classifier |
| 09 | `09-legal-compliance.md` | `CounselOS_LegalCompliance.md` | Opinion 705 rules that constrain code. Read before any AI path. |
| 10 | `10-tdd-guide.md` | `CounselOS_TDD_Guide.md` | Testing standards, four tiers, Playwright rules |
| 11 | `11-test-data.md` | `CounselOS_TestData.md` | Fixtures, seed IDs, Playwright data, demo mode |
| 12 | `12-moat-features.md` | `CounselOS_MoatFeatures.md` | Wire-fraud verification + TREC deadline engine specs |
| 13 | `13-adoption-features.md` | `CounselOS_AdoptionFeatures.md` | Matter access, passive time capture, search, client messaging, import |
| 14 | `14-module-notes.md` | `CounselOS_DevModuleNotes.md` | Why each module exists + NestJS vocabulary appendix |
| 15 | `15-project-context.md` | `CounselOS_ProjectPrompt.md` | Product context for a fresh conversation or new hire |
| 16 | `16-compliance-gaps.md` | — | TDPSA reality + the columns that must exist before the first migration |
| 17 | `17-ai-principles.md` | — | Why the AI guardrails are shaped the way they are |
| 18 | `18-nestjs-conventions.md` | — | **Framework decisions made once.** DI, validation stack, globals, scope, two-entrypoint wiring, test seams. Read before writing the first provider. |
| 19 | `19-commit-and-merge.md` | — | **Who commits, who pushes, what the guard blocks.** The three silent failures no tool catches. Read before your first commit. |

---

## DOES NOT SHIP (7 files)

Keep these in a separate `/planning` folder, a Notion space, or a private repo. They're strategy, sales, teaching, or historical — none of them help someone write code, and putting them in `docs/` dilutes the signal.

| File | Why it stays out |
|---|---|
| `CounselOS_FullBackend.md` | **Build artifact.** 400KB compiled from docs 03/04/05/08/09/10/11/15. Goes stale the moment any source changes. Generate it with a script if you want it; don't commit it. |
| `CounselOS_GlobalSummary.md` | Overview that overlaps 00 + 15. Useful for onboarding a stakeholder, redundant for an engineer. |
| `CounselOS_Brand.md` | Superseded by 07 for anything design-related. Voice guidance only. |
| `CounselOS_AdvancedFeatures.md` | Phase 2/3 roadmap. Aspirational — in the repo it invites scope creep. |
| `CounselOS_StudentNotes.md` | Teaching material. Different audience entirely. |
| `CounselOS_SyncReport.md` | Historical artifact from one backend↔frontend review. Already resolved. |
| `CounselOS_BackendUpdatePrompt.md` | One-time migration prompt. Its changes are already in 03 and 05. |
| `CounselOS_AttorneyFlow.html` | Pitch/explainer artifact. Sales asset, not a dev doc. |

---

## Which Doc for Which Task

Don't load everything. Load what the task needs.

**Starting on day one** → root `README.md`, then `00`, then `14`, then `18`

**Wiring anything framework-level** (a module, a guard, a pipe, a provider, the worker) → `18`

**Building a backend module** → `05` (that module's section) + `03` (its tables)
**...and it's an AI module** → also `08` + `09`
**...and it's a moat module** → also `12`
**...and it's access/time/search/messaging/import** → also `13`

**Building a frontend component** → `06` + `07` + `design-system-v5.html`

**Writing tests** → `10` + `11`

**"Where does this file go?"** → `02`
**"Why does this module exist?"** → `14`
**"What does this NestJS term mean?"** → `14`, appendix
**"How do I wire this in NestJS?"** → `18`
**"What's the slice order / when am I done?"** → `00` (gates) + `01` (process)

---

## The Rules That Prevent Drift

**Source of truth precedence.** Schema (`03`) wins for data shape. Checklist (`05`) wins for behavior. When they disagree, flag it — don't silently pick one.

**`CLAUDE.md` lives at the repo root**, not in `docs/`. Claude Code reads it automatically from there.

**The root `README.md` is derived from `00`.** Keep it short — what this is, prerequisites, the eight setup commands, and a link here. Don't duplicate the full guide.

**Docs change in the same PR as the code they describe.** A schema change without a `03` update is an incomplete PR. This is on the review checklist in `01`.

**Never commit a generated doc.** If you want the single-file `FullBackend` reference, add a `pnpm docs:build` script that concatenates the sources and gitignore the output. A committed build artifact silently goes stale and someone eventually trusts it.

---

## Suggested CI Check

Cheap and it catches the exact drift that bit this project twice:

```bash
# Fail if a doc references a file or section that doesn't exist
grep -rhoE '`[0-9]{2}-[a-z-]+\.md`' docs/ | tr -d '`' | sort -u | \
  while read f; do [ -f "docs/$f" ] || { echo "MISSING: $f"; exit 1; }; done
```

Both times a doc drifted here, it was a cross-reference to content that was never written. This catches that class in about a second.
