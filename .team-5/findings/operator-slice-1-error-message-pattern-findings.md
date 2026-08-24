---
# WRITTEN BY: the operator, after two independent instances of the same defect.
# FILENAME:   operator-slice-1-error-message-pattern-findings.md

reviewer:                 operator
slice:                    1
target_agent:             foundations       # this is a pattern, not one agent's bug
branch:                   feat/transactions-slice-1
reviewed:                 2026-08-24
findings_count:           1
severity:                 [warn]
categories:               [competing-pattern, unhandled-error-code]
gate:                     pass
---

## Finding

### 1. Two surfaces independently produced an error message that is actionable and futile — WARN

**The pattern, stated first, because the instances are only evidence for it.**

An error path that cannot distinguish *"the server refused this"* from *"this never reached the
server"* will pick one and state it with full confidence. Whichever it picks, it is right half the
time — and when it is wrong it does not merely fail to help. It issues a specific, plausible
instruction that **cannot succeed**, so the user performs it, and performs it again. A bare
"something went wrong" wastes a moment. This wastes the loop.

It has now happened twice, in code written by different authors, days apart, with no shared
lineage. That is what makes it a pattern worth a finding rather than two bugs worth two fixes.

**Instance A — the terminal transition.** `PATCH /v1/transactions/:id/status` with an illegal
transition to `CLOSED` returns `VALIDATION_ERROR` — *"Record why this matter ended."* The user
supplies an `outcomeReason`, resubmits, and only then receives `INVALID_STATUS_TRANSITION`: the
move was never legal. The Zod pipe runs before the service, so a request wrong in two ways reports
the one that cannot be fixed. Filed as finding 2 of
`operator-slice-1-browser-findings.md`; still open.

**Instance B — the CORS block.** A login from `http://localhost:3000` against an API started with
`CORS_ORIGINS=http://127.0.0.1:3000` is refused at the preflight and never reaches the auth code.
The form reports **"That email and password combination was not recognised."** The credentials were
correct. They were never checked. Nothing the user types will change the outcome, and the message
is an instruction to keep typing. See SURPRISES.md 007.

**What the two have in common, precisely.** In both, the failing layer had strictly more
information than the message conveyed, and threw it away at the boundary:

| | what was known | what was said |
|---|---|---|
| A | the transition map had already rejected the move | "record why this matter ended" |
| B | the request never left the browser | "that combination was not recognised" |

In A the information was known *later* than the message was composed. In B it was known *outside*
the `catch` that composed it. Same defect, two mechanisms — which is why fixing either instance
alone leaves the pattern intact.

**Why this earns a standing rule rather than two patches.** The cost is not the wasted attempt. It
is that a confident wrong diagnosis **redirects whoever is debugging into the wrong subsystem**.
Instance B sent an operator into the API config, the seed data, and the request log before anyone
compared the `Origin` header — the one place the answer was. On a product where the same class of
message will eventually explain a refused draft approval or a missed deadline, that is not a
papercut.

**Fix — the rule, then the instances.**

1. **A catch block must distinguish transport failure from domain refusal.** A `TypeError:
   Failed to fetch`, a CORS rejection, an abort and a timeout are not `INVALID_CREDENTIALS`. They
   get their own message — "couldn't reach the server" — and they never get a message that
   instructs the user to change their input. `apiFetch` is where this belongs: it already owns the
   auth lifecycle and is the only place that can tell a non-response from a response.
2. **Where two validation layers can both reject one request, the layer that cannot be satisfied
   reports first, or the first message admits it may not be the only problem.** For instance A the
   cheap version is the transition check ahead of the terminal-outcome requirement; the honest
   version is a pipe message that does not promise resubmission will work.
3. **Never phrase a message as an instruction unless following it can succeed.** This is the
   generalisation and it is the part worth carrying into other slices. "Could not update" teaches
   nothing; "record why this matter ended", when the move is illegal, teaches something false.

**Whose.** Rule 1 is **foundation** — `lib/api/client.ts` and the login form, operator-owned. Rule
2's instance is the transactions module. Rule 3 belongs in `06-frontend-architecture.md` beside the
existing "switch on `error.code`, never on `message`" rule, which is adjacent and was not enough on
its own: both instances switched on a code correctly and still said the wrong thing.

**Not a blocker.** No data is at risk in either instance, and both surfaces refuse correctly. What
is wrong is what they say about the refusal.

## Verdict

`pass` — filed as a pattern for Foundations to fix once, rather than as two defects for two agents
to fix twice. The browser gate is green and neither instance fails a gate clause, which is itself
worth noting: this class is invisible to any assertion that only checks that the wrong thing was
refused.
