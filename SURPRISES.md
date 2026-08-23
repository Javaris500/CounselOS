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
