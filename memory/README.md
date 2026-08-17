# README — See Root

The primary `README.md` lives at the **repo root** (`../README.md`), not here. This folder (`memory/`) holds Claude's persistent context across sessions: how to work on the project, what patterns have emerged, what's been decided.

Link to the root README from anywhere: **[README.md](../README.md)**

---

## This folder: Layer 2 Memory System

- **`Instructions.md`** — How Claude should work on CounselOS: preferences, rules, what good outputs look like.
- **`Memory.md`** — A running log: preferences observed, corrections made, patterns that repeat, decisions logged. Changes every session.
- **`Context.md`** — The stable project facts: what it is, the stack, architecture rules, where things live, which doc to load for what task.

All three are read by Claude at the start of every conversation about this project. When contributing to the codebase: update `Memory.md` when you discover something worth remembering.
