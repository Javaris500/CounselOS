# SURPRISES

One line per surprise, written the moment it happens. Good or bad. Do not reconstruct
these afterward — the reconstruction is always tidier than what occurred.

Format: date · what happened · why it was a surprise · what it cost or saved.

---

## 001 — 2026-08-23 — A comment in the auth layer asserted the opposite of the behavior

`apps/api/src/modules/auth/supabase.provider.ts` builds both Supabase clients with
`{ auth: { persistSession: false, autoRefreshToken: false } }` under a comment reading:

> persistSession/autoRefreshToken off: this is a stateless server. A client that quietly
> retained a session would leak one user's tokens into another user's request — the single
> worst bug this file could have.

The client retains the session anyway. `persistSession: false` selects an in-memory storage
adapter; it does not stop supabase-js from writing the most recent session into it. The
singleton's notion of "current session" is therefore whichever login happened last, shared
across every caller. `refreshSession({ refresh_token })` does not operate on the token you
pass — it first loads the stored session and, if that session is inside the 90-second
`EXPIRY_MARGIN_MS`, refreshes it in the background, consuming **that** user's refresh token.

James refreshes; the client's stored session is Elena's; Elena's refresh token is rotated
away; Elena is logged out on her next reload with no request of her own involved.

**Why this is the surprise and not just a bug:** the file documents the exact failure mode it
has. The comment is specific, correct about the stakes, and wrong about whether the guard
works. Reading the code carefully and believing the comment both lead to the same wrong
conclusion. Nothing short of executing it finds this.

**Second surprise, nested:** the 90-second margin makes it nearly unreportable in production,
where access tokens live 3600s. It fires only when a refresh lands in the last 90 seconds of
the stored session's life, so users see intermittent logouts with no reproduction path. A bug
report would read "I got logged out randomly" and there would be nothing to chase.

**Cost:** none — caught by the Slice 0 browser gate before shipping. The gate found a
cross-user concurrency defect that no unit test asserts against and no bug report would have
described. This is the first concrete evidence that the two-layer E2E rule pays for itself.

**Caught by:** `apps/web/e2e/slice-0.spec.ts:73`, "an expired access token refreshes silently".

---

## 002 — 2026-08-23 — A status doc's own verification commands confirmed a false conclusion

"CounselOS: Where We Are" (2026-08-22) shipped four commands for the reader to check state
independently. All four addressed `apps/api/src/db/schema.ts`. The real path is
`apps/api/src/database/schema.ts`.

`grep -c "pgTable"` against a missing file errors and prints nothing — which reads exactly
like a count of zero. The doc concluded "schema.ts is empty, 0 tables, Leonora goes first,
nobody else can start." The repo had 27 tables, 4 migrations, RLS across all 27, and a
built Slice 0 at the time of writing.

**Why this is the surprise:** the failure mode was not the wrong path. It was that the
verification step returned an answer *shaped like agreement*. A command that errors loudly
would have been caught in seconds. This one was silently confirmatory, inside a document
whose subject is a system built to catch confident-looking output that is wrong.

**Cost:** roughly a day of assumed-blocked state on work that was already done.

**Lesson to encode:** a check command has to fail loudly when its target is missing. `grep -c
pattern file` does not. `test -f file && grep -c pattern file` does.

---

## 003 — 2026-08-23 — Server-side revocation on logout has never worked

Found while rewriting the Supabase Auth calls for 001, not by looking for it.

`AuthService.logout()` passes the **refresh token** to what was
`adminClient.auth.admin.signOut(refreshToken)`. That parameter is named `jwt` in auth-js and is
sent as `Authorization: Bearer` to `POST /auth/v1/logout?scope=global`, which expects an access
token. GoTrue rejects it. The call is wrapped in a `try/catch` that swallows the failure by
design — "a user who cannot sign out is worse than a stale session on our side" — so it has
failed silently on every logout since the module landed.

**Why it is a surprise:** the swallow is correct and well-reasoned, and it is the reason nobody
noticed. A deliberate best-effort catch is indistinguishable from a working call. Consequence:
signing out clears the cookie (so the device is signed out, which is the part users perceive)
but never revokes the session at Supabase, so the refresh token stays valid until it expires.

**Not fixed here, deliberately.** The fix changes what revocation means and needs its own
decision — the controller has the access token available on `/logout` and could pass that
instead, or the endpoint could stop pretending to revoke. Behavior was preserved exactly through
the 001 rewrite so this stays one bug, not two. Logged for whoever owns Module 2 next.

**Also noted:** `@supabase/supabase-js` is now imported by nothing in `src/`. It stays in
`apps/api/package.json` because Storage will need it (CLAUDE.md:101 scopes the service key to
Auth and Storage), but until that module lands it is an unused dependency.

---

## 004 — 2026-08-23 — The correction to 002 did not take, and read as more trustworthy for it

"CounselOS: Where We Are" was revised after entry 002. The roster section was rewritten
correctly — it adopts the vertical cut, stops restating the roster, and points at `agents/`. The
state sections were not touched. The result asserts both answers in one document:

> **Database tables.** `apps/api/src/db/schema.ts` is empty… The 27-table schema is designed on
> paper. It has not been written into code or migrated into a database.

> **Slice 0 has shipped.** Slice 1 is the first run through the `agents/` roster.

Verified the same day: 18 commits, 28 `pgTable` calls, 4 migrations, and no `apps/api/src/db/`
directory at all. The four check commands still address the wrong path, so they still return the
silently-confirmatory zero that 002 was about.

Three more claims the vertical cut had already invalidated, left standing: "Leonora goes first and
nobody else can start" (no `leonora` in `agents/`), "Iyo and Nemi can only write test files" (no
`iyo` either), and "Compare `.team-5/` against the agent list above" — pointing at a list the same
revision had deliberately removed.

**Why this is the surprise and not a repeat of 002.** The document was revised where the *thinking*
had changed and not where the *facts* were. That is the failure mode: you patch the sections you
were actively reasoning about, and the untouched sections go on asserting the previous world with
undiminished confidence. Worse, the corrected roster section raises the credibility of everything
around it — a reader who checks the part that was fixed concludes the document is current.

**The lesson that generalizes:** a partial correction is more dangerous than no correction. When a
document's premises change, the sections you did not think about are the ones to re-read, precisely
because you did not think about them.

**Cost:** none yet — caught before the doc was circulated. Would have cost a second round of
assumed-blocked state on schema work that has been done since 2026-08-18.

---

## 005 — 2026-08-24 — A placeholder empty state is indistinguishable from a true one

Login lands on `/dashboard`. It rendered "No active transactions — add your first one and
CounselOS starts working immediately" against a database holding ten seeded matters. The
operator reasonably read this as slice 1 being broken, and the next twenty minutes went into
the API, the CORS config, the request log, and a scripted browser session.

The page is four lines and fetches nothing:

```tsx
export default function DashboardPage() {
  return <EmptyState title="No active transactions" description="Add your first one…" />;
}
```

A slice 0a placeholder, correctly labelled as one *in its own docstring*, rendering the exact
component a real aggregation would render on a genuinely empty firm.

**Why this is the surprise.** This codebase already holds the principle that would have
prevented it, and applies it rigorously one layer down. `not_configured` is a first-class
state for every external service; CLAUDE.md says never render a spinner for a service known to
be down, render a disabled state with a plain explanation. The rule exists because a fake
working state is worse than a visible broken one. Nobody extended it from *services* to
*surfaces* — so an unbuilt page is allowed to impersonate a built one, and does it in the
product's own confident voice.

The docstring is not a mitigation. It is visible to whoever opens the file and invisible to
everyone looking at the running app, which is exactly the population that gets misled.

**The lesson that generalizes:** a stub must announce itself in the medium where it will be
encountered. A placeholder that renders a plausible real state is a lie the whole team will
believe, including its author, three weeks later.

**Cost:** roughly twenty minutes of operator time and one wrong hypothesis chased into two
subsystems. Would have been zero with the word "Placeholder" on screen.

---

## 006 — 2026-08-24 — A liveness probe confirmed a restart that had not happened

The API was rebuilt and restarted so the operator could see two fixes in the browser. The new
process died immediately — `EADDRINUSE` on 3001, because the `kill` of the previous one had
not taken. `curl /v1/health` then returned `{"status":"ok"}`, and the stack was reported to the
operator as restarted and carrying the fixes.

It was answering from the *old* process, which had been started hours earlier from a different
environment. The health check was truthful and the conclusion drawn from it was false.

**Why this is the surprise.** The failure was fully recorded — the crash was in the log file
the restart had been redirected into, unread, because the health probe had already produced an
answer shaped like success. Same structure as 002: the verification step returned agreement,
so nobody looked at the louder evidence sitting one command away.

**The lesson that generalizes:** a liveness probe proves *something* is listening on a port. It
never proves *your* process is. When restarting a service, verify the thing you actually
changed — the pid, the startup log, a value that only the new build could return — not that
the port responds. "Is it up?" and "is it mine?" are different questions and only one of them
was asked.

**Cost:** the operator was told to look at fixes the running binary did not contain. Compounded
006 → 007, because the stale process also carried the CORS config that caused the next failure.

---

## 007 — 2026-08-24 — A CORS block was reported to the user as a wrong password

`localhost:3000` and `127.0.0.1:3000` are different origins to a browser. The running API had
been started with `CORS_ORIGINS=http://127.0.0.1:3000` only, so a login from `localhost:3000`
was refused at the preflight and never reached the auth code.

The login form reported: **"That email and password combination was not recognised."**

The credentials were correct. They were never checked. Identical requests differing only in
the `Origin` header: `127.0.0.1` gets an `Access-Control-Allow-Origin` back, `localhost` gets
nothing.

**Why this is the surprise.** The frontend maps every failed login to the credential message,
because from inside the `catch` the two cases look the same. But they are not the same for the
person reading the screen: one means *try again*, the other means *nothing you type will ever
work*. The message chosen is the one that guarantees the user does the useless thing, and does
it repeatedly. This is the same defect the slice 1 review already found in the status control —
a message that is *actionable and futile* — arriving independently on a second surface, which
suggests the pattern rather than the instance is what needs fixing.

**The lesson that generalizes:** an error path must distinguish "the server said no" from "the
request never arrived". Collapsing transport failure into a domain error produces confident,
specific, wrong guidance — and sends whoever is debugging into the wrong subsystem, which is
where the real cost lands.

**Cost:** one failed login round, plus operator time in the API and the seed data before the
`Origin` header was compared.

---

## 008 — 2026-08-24 — A security fix shipped with tests that could not fail if it were deleted

The 8G matter-access floor refuses a non-staff account before any assignment check — without
it, a `CLIENT` id written into `assigned_attorney_id`, or a `matter_access` grant row, yields
FULL access to a portal client. Unit suite: **55/55 green**.

Comment out the floor entirely: still 55/55 green.

Every `CLIENT` case in the spec was a *stranger* case — no assignment, no grant — which the
fall-through already refused before the floor existed. The tests sat directly beside the code
they did not test, under a file header explaining that this suite walks the ladder rung by
rung precisely to catch combinations no endpoint currently produces.

The same shape appeared again the same day, one layer up: the browser test for the explaining
denial asserted the word `"attorney"`, which passed only because the *generic* copy said "ask
the assigned attorney". When the component was fixed to render the server's message naming
James Okafor, the test went red — it had been pinned to the defect.

**Why this is the surprise.** Both suites were written by someone reasoning carefully about the
rule, with comments articulating exactly what the test was for. Coverage was not the problem
and neither was care. The assertions were simply satisfiable by the broken code, and nothing in
a green run can tell you that.

**The lesson that generalizes:** for any check whose failure mode is silent — an authorization
floor, a denial message, a redaction — a passing test is not evidence. Break the code
deliberately and confirm the test goes red. It takes a minute and it is the only thing that
distinguishes a test from a comment that runs. Four rung-0 tests were added and mutation-tested
this way; all four fail with the floor removed.

**Cost:** none in production — caught during verification. But it shipped through a full green
gate, which is the part worth sitting with.

---

## 009 — 2026-08-24 — An agent session killed by a 529 was indistinguishable from one that had finished

The transactions agent's session stopped mid-task at 05:01 on an `API Error: 529 Overloaded`,
two turns after the operator typed `continue`. From outside it presented as `idle` — the same
state a session shows when it has completed its work and is waiting. The worktree was left with
uncommitted, unverified changes to two files in the matter-access layer.

Forty minutes later the operator sent it a status-check message. It was never processed; the
session had no turn left to run. The reply the operator was waiting for was never coming, and
nothing in the session list said so.

**Why this is the surprise.** Supervision assumed "idle" meant "between tasks". It also covers
"dead", "crashed mid-edit", and "holding work nobody has verified". The distinguishing evidence
existed — the last line of the transcript is the error — but it lives in a file nobody reads
while a session still looks alive in the roster.

**The lesson that generalizes:** an orchestration layer must separate *finished* from *stopped*.
Any supervisor that treats them alike will eventually wait indefinitely on a corpse, and — worse
— will leave half-finished work in a shared tree while believing an agent is still tending it.
Before messaging an idle agent, check whether its last turn ended in output or in an error.

**Cost:** ~40 minutes of assumed-in-progress state, and an uncommitted security change that sat
unverified in a worktree the operator believed was being actively worked.

---

## 008 — 2026-08-24 — The thorough access-control suite could not have caught the bug

Module 3's 8G coverage is the most careful in the repo. A twelve-route enumeration hits every
matter-scoped endpoint with an unassigned paralegal. A unit spec walks the ladder rung by rung,
including an exhaustive grid over "no combination grants more than its rung" and the exact-instant
expiry boundary. Every one passed, and post-merge review still found three privilege escalations.

**Every test asked the same question.** *Is the wrong person denied?* Not one asked *is the right
person limited?* All three attackers — an assigned paralegal, an assigned paralegal again, and a
live grantee — were legitimately on the matter and passed every denial test by design.

**Why this is the surprise and not just a gap.** More tests of the kind already written would not
have found it, and neither would a more careful reading of the ones that exist. The suite is not
thin; it is aimed. `role === 'ATTORNEY'` where the rule is assignment is the bug the whole module
was built to avoid, and it is documented at length in `matter-access.service.ts` — but the
*converse* has no name and no test: a permission LEVEL standing in for a NAMED population. FULL is
held by five populations; 13 §1 grants to two of them.

**The lesson that generalizes:** a negative-case suite tests outsiders. Insider overreach is a
separate axis, and a checklist that says "test the wrong role → 403" reads as covering it while
covering none of it. Compare the named population to the admitted population as *sets*, in writing.

**Cost:** the three escalations shipped to `main` and lived there for one day. Found by review
rather than by any gate. Fixing them took under an hour; finding them took a deliberate,
adversarial pass that no gate would have triggered.

---

## 009 — 2026-08-24 — `FULL TURBO` is indistinguishable from a pass

Verifying that slices 0 and 1 were genuinely green started with `pnpm lint && pnpm typecheck`.
Both returned `Tasks: 4 successful, 4 total · FULL TURBO` in 60ms.

The replayed logs named their origin: `/home/jt0629/projects/counselOS-worktrees/transactions-slice-1/apps/api`.
The cache entries were produced in a **worktree**, so neither command had ever executed against
`main`'s merged tree. Forced, both did pass — but the first run proved nothing and looked identical
to the run that did.

**Why this is the surprise.** Turbo prints the origin path in the replayed log, so the evidence was
on screen and read past. A cache hit is *supposed* to be indistinguishable from a pass; that is the
feature. It stops being a feature the moment the output is being used as proof that a merge is
sound.

**The lesson that generalizes:** when a command's output is evidence rather than feedback, force
it. `--force` costs ten seconds. Trusting a cross-tree cache costs the entire claim built on it.

**Cost:** near zero, caught immediately — but only because the origin path happened to be read.
Worth recording precisely because it nearly wasn't.

