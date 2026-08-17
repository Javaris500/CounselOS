# Memory.md
### CounselOS — Running Memory Log

> This file is the brain. It gets updated continuously as I work with you. Seeded below with patterns observed across the full project history — not starting from empty.

---

## Preferences

- **Wants honest grading, not validation.** Repeatedly asked "grade this," "critique this," "are we solving real problems" — and pushes back if the answer is too soft. Give the real grade, including what's weak.
- **Prefers evidence-based recommendations over opinion.** Uses deep research before major scope decisions (features, TDPSA, AI substance). Wants sources cited and weak/vendor-sourced evidence flagged explicitly.
- **Format: structured Markdown, headers, tables for comparisons, bold for key terms.** Not dense prose paragraphs. Scans fast, wants to find the answer quickly.
- **Short questions get short answers.** Doesn't want a 3-paragraph response to a yes/no question ("Is this a good backend?" → direct answer first).
- **Wants concrete artifacts, not just advice.** Consistently asks to turn discussion into an actual .md file, schema change, or checklist update — not left as conversation.
- **Values internal consistency across docs** more than most clients would — has caught drift multiple times and wants it fixed immediately, not noted for later.
- **Prefers visual/interactive artifacts (HTML flowcharts) for stakeholder-facing content**, plain Markdown for engineering docs.
- **Asks for explanations in junior-developer terms when learning a new area** (2026-08-15, on the Redis eviction and Docker work). Explain the concept, then what I did, then why — not just the change.
- **Handles `git commit` and `git push` himself** as of 2026-08-15. Make the changes, summarize them, suggest a commit message; don't run commit or push unless asked in that message.

## Corrections

- Corrected me when I said "I have a strong understanding of the frontend" but the frontend data-flow layer was actually undefined — wants me to distinguish between "specified" and "architected," not conflate them.
- Corrected me when I claimed I'd read uploaded docs but hadn't actually opened them — always read files before summarizing them, don't infer from filenames or memory.
- Pushed back when I said "I gave you the docs already" was wrong — always verify against the actual uploaded files, don't assume conversation history is a substitute for reading.
- When I introduced a cross-reference to a doc/section that didn't exist yet (Codebase.md → DeveloperGuide slice order), this was caught and treated as a real bug, not a minor issue. **Never write a cross-reference to content that isn't there yet.**

## Patterns

- **Cuts scope aggressively once shown evidence, and doesn't get attached to prior work.** Examples: cut Socket.io/WebSocket entirely after SSE was shown sufficient; cut Google Calendar OAuth to .ics-only; cut draft generation from 7 types to 2-3 after AI evaluation showed it was the most commoditized, highest-liability feature; cut the AI document classifier entirely and replaced with deterministic keyword matching.
- **The recurring design principle: "is this genuinely intelligence, or pattern matching wearing an AI costume?"** Applied repeatedly — classifier, TREC date math, conflict checking, wire fraud detection logic all made deterministic. AI reserved for: deadline extraction (reading), document chat/RAG (reading), wire instruction extraction (reading), draft generation (limited, reviewed).
- **Consistently prioritizes case-management-first over AI-first**, even though this is an "AI platform." Will choose the boring operational feature (communication log, matter notes, morning dashboard) over a flashier AI feature when adoption research supports it.
- **Wants compliance built into the architecture, not bolted on.** Opinion 705 attestation, staged review, TDPSA applicability were all researched properly rather than assumed.
- **Runs a slice-by-slice, E2E-gated development process** (not layer-by-layer). Backend + frontend built together per feature, gated by Playwright tests. Uses Claude Code + Playwright for automated test-driven development.
- **Treats documentation as a first-class deliverable**, not an afterthought — maintains ~19 interconnected docs, cares about a docs index, numbering, what ships in the repo vs. what doesn't.
- **Asks "what am I missing" proactively** rather than assuming the plan is complete — repeatedly requests gap analysis, audits, and critiques of his own work.
- **Accepts a flagged risk and decides quickly rather than deliberating.** When given a finding with a recommendation (SSE fan-out, `volatile-lru`, the Dockerfile base image), the answer comes back as a decision in one line. Lead with the recommendation.

## Decisions

- **Tech stack locked:** NestJS (modular monolith, 2 processes: HTTP + BullMQ worker) · Drizzle ORM · Postgres + pgvector via Supabase · Next.js App Router · Anthropic Claude via Vercel AI SDK · Voyage AI `voyage-law-2` embeddings · Resend · Upstash Redis.
- **Architecture rule that must never be violated:** modules import each other's services, never their repositories. This is what keeps modules extractable in Phase 2. As of 2026-08-15 it is enforced mechanically — absent from every `@Module.exports` (bootstrap crash) and by an ESLint `no-restricted-imports` rule, both verified firing.
- **Design system: v5 "Paper & Ink"** — bone paper light / neutral dark shell, cool ink, sage for completed states, AI-teal marks AI-generated content, urgency ladder never relies on hue alone. Newsreader / Inter / JetBrains Mono. Supersedes all earlier brand versions (v4, obsidian/electric-indigo).
- **Client auth: signed HMAC token, not Supabase accounts.** No CLIENT role active in Phase 1. Any access failure returns 404, never 401/403 — never reveal a transaction exists.
- **Real-time: SSE only.** No WebSocket, no Socket.io. Snapshot-on-reconnect, not event replay. **SSE fan-out goes through Redis pub/sub in Phase 1** (decided 2026-08-13) — the worker produces most events while the HTTP process holds the connections, so an in-memory Subject delivers nothing on Railway while working perfectly in local dev.
- **AI feature count locked at four:** deadline extraction, document chat (RAG), wire instruction extraction, draft generation (reduced scope). Every AI output stages for human review — nothing auto-sends or auto-confirms (Opinion 705).
- **TDPSA: both the firm and CounselOS qualify for the SBA small-business exemption today.** Rule 1.05 confidentiality is the actual binding constraint, not TDPSA. Build export/deletion/access-log capability now anyway — cheap now, required at Phase 2 scale.
- **Three data captures marked unrecoverable-if-skipped:** source-linked extraction (source_text, source_page on deadlines), referral source tracking (on leads/transactions), outcome capture (why a deal closed or fell through). All added to schema before first migration.
- **Moat features split, decided 2026-08-14.** The **TREC deadline engine (M1) ships in slice 3** with deadlines — slice 3's Playwright gate requires the earnest-money vs option-fee weekend divergence to render, so the slice cannot close without it. **Wire-fraud verification (M2) is the one that waits** until Phase 1 core is E2E-green.
- **Repo structure: one monorepo**, not two repos — `packages/shared` is load-bearing for keeping enums/error codes/Zod schemas in sync between frontend and backend.
- **Documentation ships as 19 numbered docs (00–18) in `docs/`** + root `CLAUDE.md` + root `README.md`. FullBackend, GlobalSummary, Brand, AdvancedFeatures, StudentNotes, SyncReport, BackendUpdatePrompt, and the AttorneyFlow HTML explicitly do NOT ship in the repo — planning/sales artifacts only.
- **Validation stack (2026-08-13):** Zod is the only schema language. Canonical schemas in `packages/shared`, wrapped by `createZodDto()` from `nestjs-zod` so controllers and OpenAPI read the same object. `class-validator` and `class-transformer` are never installed. Verified compatible: nestjs-zod 5.5 supports Zod 4 + NestJS 11.
- **Node 24 LTS, not 20** (2026-08-15). Node 20 reached EOL; 24 ("Krypton") and 22 are the active LTS lines. `@types/node` tracks the 24 line deliberately rather than npm's `latest`, which follows Node current.
- **TypeScript held at 5.9.3, not 7.x** (2026-08-15). TS 7 is the native Go rewrite; NestJS DI depends entirely on `experimentalDecorators` + `emitDecoratorMetadata`. Revisit when NestJS declares support.
- **Redis eviction policy: `volatile-lru`, not `allkeys-lru`** (2026-08-15). Every key we can afford to lose carries a TTL; the ones we can't, don't. `allkeys-lru` was free to evict `sse:eventid:{firmId}`, which is TTL-less by design and whose loss silently resets event IDs and breaks `Last-Event-ID` reconnect handling. Verified empirically: under a 3mb cap, 1,078 TTL-bearing keys evicted, the counter survived.
- **Production base image: Debian (`bookworm-slim`), not Alpine** (2026-08-14). musl is a recurring source of LibreOffice and native-module breakage. `libreoffice-writer` only, not the full metapackage (~1GB of formats we never convert).
- **API path: `/v1` from `setGlobalPrefix` alone; never also call `enableVersioning()`** (2026-08-15). Both add a `v1` segment, silently serving everything at `/v1/v1/...` while Nest logs the route as correct.

---

## Open Questions / Watch For

- Has the Austin pilot firm actually signed a written commitment? This has been flagged multiple times as the highest-risk unknown — more important than any remaining spec work. Update this line the moment it's resolved either way.
- The analytics/insights layer (closing rate, cycle time, referral ROI, matter profitability) was identified as the biggest capability gap and is not yet built — watch for when this gets prioritized.
- ~~Repo scaffold did not exist as of the last working session~~ **Resolved 2026-08-15.** The workspace is scaffolded and verified: pnpm catalog, turbo, `packages/config`, `packages/shared` (9 enum files transcribed verbatim from `03-schema.md`), `apps/api` (CoreModule/AppModule/WorkerModule, both entrypoints, DRIZZLE token, env validation, health module, jest 3-project config), `apps/web` (Next 16 shell). `install`/`lint`/`typecheck`/`build` all pass; `GET /v1/health` verified against a live boot.
- **`schema.ts` currently contains enums only — no tables.** Deliberate: tables are a single pass reading `03-schema.md` alongside `16-compliance-gaps.md`, because the columns that can't be honestly backfilled must exist in the first migration. Do not add tables piecemeal as modules need them. This is the next task before any module work.
- **Supabase project not yet created.** `apps/api/.env` has real generated secrets and working local Postgres/Redis, but placeholder `SUPABASE_*` values. Nothing in Module 1 needs them; Module 2 (Auth) does.
