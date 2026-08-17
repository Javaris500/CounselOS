# CounselOS — Product Summary & Design Handoff
### Design System **v5** — "Paper & Ink, on a real foundation"

> **Authoritative design source:** `design-system-v5.html`.
> **v5 supersedes v4 and every earlier brand.** If an older doc shows beige `#EFE9DD`, DM Serif Display, or obsidian/electric-indigo, it is stale — use the tokens below.

---

## What CounselOS Is

An **AI-native case management platform for a real estate law firm in Austin, Texas.** Tagline: *"the OS your firm runs on."* Guiding principle: **case management first, AI second** — the operational modules are the foundation attorneys depend on daily; AI amplifies a system they already can't leave.

Phase 1 is single-firm. No multi-tenancy, plan selection, or onboarding flow in the UI — firm context is handled entirely by the backend.

---

## Two Surfaces, One Codebase

**Attorney dashboard** — OWNER / ATTORNEY / PARALEGAL. Dense, professional, information-rich. Users bill $300–500/hour; every extra click costs adoption. Home screen is the **morning dashboard** ("what needs my attention today"), not a pipeline view.

**Client status page** — separate, calm, minimal. Signed-token URL, no account, no password. One transaction: plain-English status, next milestone, attorney contact, shared documents, and (Phase 1.5) two-way messaging. Any access failure → generic not-found page.

---

## What Changed in v5

The concept is unchanged. The execution became buildable.

| | v4 | v5 |
|---|---|---|
| Paper | Beige `#EFE9DD` | **Bone `#F0EEE9`** — chroma cut ~70%, no longer reads amber in screenshots |
| Ink | Warm/brown cast | **Cool ink** — the print pairing; removes khaki from all metadata |
| Serif | DM Serif Display | **Newsreader** |
| AI accent | `#0A7A8A` | **`#0A5C69`** (light) / `#3FAAB8` (dark) |
| Spacing | Ad hoc | **4pt grid**, 11 steps |
| Type | ~16 unrelated sizes | **8-step scale** |
| Elevation | Loosely defined | **5-layer model**, light + dark |
| States | Implicit | **Defined state matrix** |
| Urgency | Hue-only | **One ladder**, never hue alone |

---

## Design Tokens — v5

### Surfaces

**Light (bone paper)**
```
#F0EEE9   shell / page background
#FAF9F6   card
#E6E3DC   inset / wash
#DAD6CE   border, rules
#C2BDB3   border strong
```

**Dark**
```
#0B0C0E   shell
#16181B   base
#1E2126   card              (elevation 2: + 1px line)
#272B31   raised            (elevation 3: + shadow-sm)
#2E333A   overlay           (elevation 4: + shadow-md)
```

### Text — contrast ratios documented

**On light**
```
#1B1D1E   primary      15.6:1   AAA
#494F53   secondary     8.3:1   AAA
#6E7479   tertiary      4.9:1 on card · 4.1:1 on paper   AA (large/UI only on paper)
#9C9A94   disabled      2.7:1   decorative only
```

**On dark**
```
#F1F3F4   primary      14.6:1   AAA
#A2A9AF   secondary     6.9:1   AA
#7B8288   tertiary      4.6:1   AA
#4C5258   disabled      2.2:1   decorative only
```

> `#6E7479` at 4.1:1 on bone paper is **UI/large text only** — not body copy on the shell. Use `#494F53` for extended reading.

### Slate — the structural ink scale (11 steps)

```
0D1116  141A21  1E2731  2A3542  374553  455565
5A6B7D  78899A  A3B2BF  CDD8E1  EAEFF3
```
(plus `--sl-350` as a documented intermediate)

### Sage — completed / positive only (10 steps)

```
1B2916  22331E  3A5334  4B6A44  5E8156
7A9B70  9DB995  C2D6BC  DFEADB  EEF3EC
```

Sage is **not** a general-purpose brand color. It marks what's been filed, received, completed, or resolved.

### The urgency ladder — each step measurably hotter

| Tier | Light | Dark |
|---|---|---|
| INFO | `#5A6B7D` slate | `#78899A` |
| WARNING | `#8A5E12` amber | `#D19A3C` |
| URGENT | `#B14A22` terracotta | `#E2794E` |
| CRITICAL | `#A62230` crimson | `#E4636F` |

**Never hue alone.** Every tier pairs color with a second signal — weight, an icon, a label, or a rule. This is both an accessibility requirement and how the ladder stays legible in a dense list.

**Each tier is a family, not one color.** The value above is the foreground. A badge needs three: a tint background, a border, and a text color that reads on the tint. These are the applied values in `design-system-v5.html`:

| Tier | Background | Border | Text on tint |
|---|---|---|---|
| INFO | `#EAEFF3` (sl-50) | `#CDD8E1` (sl-100) | `#1E2731` (sl-800) |
| WARNING | `#FAF1E4` | `#E0CBA6` | `#6B460B` |
| URGENT | `#FBEEE8` | `#E7C3B0` | `#8A3818` |
| CRITICAL | `#FAEDEE` | `#E3BEC3` | `#7C1622` |

Solid crimson buttons take `#FAF3F4` text and a `#75141F` focus ring. INFO's triple comes straight from the slate scale; the completed/sage badge does the same — `#EEF3EC` / `#C2D6BC` / `#22331E`.

### AI marker

```
#0A5C69   light      AI-generated content
#3FAAB8   dark
```

Same family rule as the urgency ladder — the marker's badge triple is `#E6F2F4` background, `#A9D5DB` border, `#084B55` text.

Used wherever the machine produced something — draft sections, extracted deadlines, chat answers. Attorneys must always be able to tell. This is a trust feature and an Opinion 705 compliance surface.

### Typography

```
Newsreader        400 / 500          headings, editorial voice, legal gravity
Inter             400/500/600/700    all UI
JetBrains Mono    400/500/700        data, IDs, dates, amounts — tabular-nums
```

Eight-step size scale. Mono uses `font-variant-numeric: tabular-nums` so columns of figures align.

### Spacing — 4pt grid

```
s-0.5  2      s-3   12     s-6   24
s-1    4      s-4   16     s-8   32
s-1.5  6      s-5   20     s-10  40
s-2    8                   s-14  56
```

### Radius

```
xs   2px      md   6px      full  999px
sm   4px      lg   8px
```

### Elevation — 5 layers

| Level | Light | Dark |
|---|---|---|
| 0 | no border, no shadow | flat on base |
| 1 | 1px line, no shadow | `#1E2126` + 1px line |
| 2 | line strong + `shadow-sm` | `#272B31` + `shadow-sm` |
| 3 | `shadow-md` | `#2E333A` + `shadow-md` |
| 4 | `shadow-lg` + backdrop | `shadow-lg` + hairline top |

### Motion

```
80ms   ease-out      micro (hover, press)
140ms  ease-out      standard (state change)
240ms  decelerate    entrance (drawer, modal)
320ms  settle        large surface
```

`prefers-reduced-motion` is honored — animations collapse to 0.01ms.

### Density modes

```
compact       row 32px · pad s-3     dense tables, pipeline
comfortable   row 48px · pad s-5     forms, detail views, client page
```

The attorney dashboard defaults to **compact**. The client status page uses **comfortable**.

---

## Core Screens

### Attorney
- **Morning dashboard** — home. Deadlines next 7 days, tasks due, overdue, stale transactions, suggested time entries.
- **Transaction pipeline** — kanban across Intake → Under Contract → Due Diligence → Title Review → Closing Prep → Closed / Fallen Through. Cards show property, parties, next deadline with urgency, checklist progress ("7/10").
- **Transaction detail** — tabs: overview, documents, checklist, deadlines, chat, drafts, notes, communications, tasks, time.
- **Firm-wide deadline dashboard** — sorted by urgency.
- **Document chat** — streaming answer, citations after completion, AI-teal marked.
- **Draft review** — section-by-section with required attestation. Deliberate, not skippable.
- **Communication quick-add** — one-click drawer, under ten seconds, **must work one-handed on mobile**.
- **Leads** — intake list with conflict-check status.
- **Command palette (⌘K)** — keyboard-first navigation and quick actions from anywhere. Overlay at elevation 4.
- **Service status banner** — honest, plain-language degraded/offline state. Never a spinner for a service known to be down.

### Client
- **Status page** — calm, comfortable density, read-only + messaging.

---

## Interaction Requirements

- **Real-time is SSE.** Document processing status, chat token streaming, global event feed. Design needs live states: progressing pipeline indicators, a notification bell fed by an event queue, streaming text with a caret.
- **AI-generated content is always marked** in AI teal.
- **Urgency uses the ladder** — color plus a second signal, never hue alone.
- **Optimistic updates** on the four high-frequency creates (communication, note, task, time entry). Everything else shows a pending state.
- **Permission denials explain themselves** — *"This matter is assigned to James Okafor. Ask them for access,"* never a bare 403.
- **Deadlines always show their calculation** — *"7 calendar days from effective date (June 2) = June 9."* A bare date doesn't earn trust.
- **`data-testid` on every interactive element**, added in the same commit as the component. Convention: `{domain}-{element}-{action?}` kebab-case. Playwright tests depend on it; text/CSS selectors shatter on redesign.

---

## Voice

Sharp, calm, confident. No filler.

> **Not:** "You don't have any cases yet!"
> **Yes:** "No active transactions. Add your first one and CounselOS starts working immediately."

> **Not:** "Warning: deadline approaching"
> **Yes:** "Option period expires in 3 days — Martinez / Chen."

---

## The One-Sentence Brief

*A calm, editorial, bone-and-cool-ink case management interface for real estate attorneys — dense and professional on the attorney side, comfortable and reassuring on the client side — where Newsreader gives it legal gravity, sage marks what's done, teal marks what the AI touched, the urgency ladder never relies on hue alone, and every measurement comes off a 4pt grid.*
