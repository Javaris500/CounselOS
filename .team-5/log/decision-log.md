# Decision Log

**Written by:** the agent, on any consequential choice.
**Why:** a reasoning trail, not a changelog. Harvested into the Command Center's knowledge vault.

**The test:** would a future agent — or you in three months — ask *"why is it like this?"*
If yes, log it.

## Log

| # | date | agent | slice | decision | rationale | rejected |
|---|---|---|---|---|---|---|
| 3 | 2026-08-18 | operator | 0b | Verify JWTs with `jose` + JWKS, not passport-jwt + a shared secret | The live Supabase project signs **ES256**; 05 §L2's "Supabase JWT secret / passport-jwt strategy" describes the legacy HS256 model and cannot work. jose is one dependency against four, throws typed errors so TOKEN_EXPIRED stays distinguishable, and avoids resolving a strategy by string name — the indirection this codebase bans elsewhere. | passport-jwt + jwks-rsa; enabling Supabase's legacy HS256 secret |
| 4 | 2026-08-18 | operator | 0b | `JWT_SECRET` deleted rather than left unused | Under ES256 nothing can use it, and a shared secret in env is a forgery oracle — anyone holding it could mint a token for any user. Deleting it also makes the invalidated HS256 test helper fail to compile, so it cannot be quietly resurrected. | Leaving it declared "in case" |
| 5 | 2026-08-18 | operator | 0b | The E2E overrides the KEY SOURCE (`JWKS`), never the guard or verifier | `createLocalJWKSet` and the production `createRemoteJWKSet` return the same type, so `jwtVerify` runs identically in both — a test token signed by a second keyring still fails. Overriding the verifier would leave the signature check, the algorithm allowlist, and the issuer pin untested. | overrideProvider(TokenVerifier) with a fake |
| 6 | 2026-08-18 | operator | 0b | `auth_id` is linked on first login by verified email, and never relinked | `users.auth_id` starts null because a user is invited before they authenticate; without a linking step every login 401s. Refusing to relink an email already bound to a different `auth_id` is what stops someone creating a Supabase account with a firm member's address and inheriting their access. | Auto-creating a user row for any valid Supabase account |
| 7 | 2026-08-18 | operator | 0b | cookie-parser applied as module middleware, not in main.ts | main.ts does not run in an E2E, so bootstrap-time config is absent from the app under test — the refresh flow was untestable and silently broken. Same reasoning as registering globals via APP_* rather than app.useGlobal*(). | app.use(cookieParser()) at bootstrap |
| 1 | 2026-08-18 | operator | 0b | Attorney login proxies through the API; the browser never talks to Supabase | CLAUDE.md fixes the access token in memory, never localStorage, and the Supabase browser SDK persists to localStorage by default. A browser→Supabase path also bypasses the matter-access guard and access_log. Refresh token becomes an httpOnly cookie. Contradicts 05 §L2, which needs updating. | Direct browser→Supabase auth with @supabase/ssr (the vendor quickstart) |
| 2 | 2026-08-18 | operator | 0b | RLS enabled on all 27 tables now, deny-by-default, no policies | Distinct from the Phase 2 multi-tenancy work. Supabase serves `public` over PostgREST and the publishable key is public by design, so a table without RLS is readable with it. The API connects as table owner and bypasses RLS, so it costs nothing. | Deferring all RLS to Phase 2 as the docs describe |
| 8 | 2026-08-23 | operator | 1 | Keep the vertical cut: one agent owns one feature through every layer | AVEL's own rule — a boundary is worth its handoff cost only if it can be written as writable paths — selects it for this stack. NestJS colocates a feature's controller, service, repository, and DTO in one directory, so the feature boundary is a directory a mount can enforce and the layer boundary is a file-suffix pattern no mount can. AVEL's `SANDBOX.md` (in the AVEL repo, not carried here) framed this as an enforcement problem needing diff checking; it is a decomposition problem, and under the vertical cut it does not arise. | Converting to AVEL's horizontal roster (Leonora/Kel/Dunn/Gat/Ghost/Leon) |
| 9 | 2026-08-23 | operator | 1 | Foundations named as a role in all seven identity files; the operator holds it for slice 1 | The vertical cut opens a gap the horizontal one does not: each agent owns a slice of the schema and nobody owns consistency between them, which yields one timestamp convention and one error envelope per slice, discovered at integration. The surfaces were already off-limits to agents in every file — what was missing was an accountable owner, not a restriction. Assigned to the operator rather than a new agent because condition 1 exists to isolate one unknown (can an agent write a NestJS module), and a second never-run agent gives a bad result two candidate causes. The gap is latent in slice 1 regardless: stagger means one feature agent writes, and divergence needs two. It bites at queue order 3, the first parallel dispatch. | A new foundations agent; case-ops expanded — ruled out by the roster's own logic, since Nemi's rationale is that owning territory disqualifies you from judging a seam |
| 10 | 2026-08-23 | transactions | 1 | `ActivityLogService` lives in `modules/transactions/`, not `common/events/` | It needs a repository, and repositories live in modules — CLAUDE.md bans a services folder outside modules. `common/events/event-types.ts` holds only the typed constants, which is exactly what the dispatch said that file is. Other modules reach it the documented way: import the SERVICE, never the repository (Architecture Rule 2), which is what keeps Module 3 extractable in Phase 2. | Putting the service in `common/events/` beside the constants |
| 11 | 2026-08-23 | transactions | 1 | The detail payload carries `allowedTransitions`; the frontend holds NO transition map | The identity file requires the UI to render the server's verdict, never its own. A second copy of the ladder in the browser looks harmless and drifts the first time the map changes — the status control would then offer a transition the server refuses, which reads to an attorney as a broken product rather than a stale constant. The rejection path still renders `error.details.allowedTransitions`, so both paths come from the same map. | Duplicating `VALID_TRANSITIONS` in the web app; offering all seven statuses and letting every wrong one 422 |
| 12 | 2026-08-23 | transactions | 1 | The pipeline board fetches the BARE `keys.transactions()` key, with no query string, and ships no filters | `mutations.ts` is append-only and `createTransaction` already declares `mutate(keys.transactions())` — an exact-key match. A board reading `keys.transactions('limit=100')` would never be invalidated by a create, so a new matter would not appear until a manual refresh, and that reads as a backend bug. The board groups by status itself, so the columns ARE the filter. Cost: it shows one page and says so ("Showing the N most recent of M"). **Any agent adding a filtered list key must append its own mutation with matching invalidation.** | A filtered/paginated board key; calling `mutate` with a key-matching predicate at the call site (invalidation must be declared on the mutation) |
| 13 | 2026-08-23 | transactions | 1 | A terminal transition also sets `is_archived = true` | 05 §3A says archived matters must not pollute the active dashboard, and nobody remembers to archive a deal that fell through in March. Closing already captures five columns at the one moment the attorney is engaged; making archival a second manual step guarantees a permanently stale pipeline. Reversible — `PATCH /:id` can unset it — where the outcome columns are not. | Leaving archival manual, as a literal reading of §3E's separate archive endpoint |
| 14 | 2026-08-23 | transactions | 1 | Transaction-number allocation counts soft-deleted rows; the one `.from(transactions)` without `notDeleted` in the repository, annotated `commit-check-exempt` | The partial unique index only constrains live rows, so reusing a deleted matter's number would satisfy the database and put two different deals behind one identifier in correspondence that already went out. Allocation is allocate-then-retry on `23505` rather than a lock, so a collision costs one extra round trip instead of serialising every create in the firm. | Filtering deleted rows (would reissue numbers); locking the table per create |
| 15 | 2026-08-23 | transactions | 1 | `MatterAccessGuard` registers as `APP_GUARD` in `TransactionsModule`, and the 8G ladder lives in `MatterAccessService` | A guard built outside the DI container cannot inject the service (18 §3). Registration order is execution order and `AppModule` imports `AuthModule` first, so the sequence is authenticate → role → matter, which is the only order that works. Keeping the ladder in a service rather than the guard means the six rungs unit-test as a pure function and other modules can carry `@MatterAccess` without re-deriving 8G. | Resolving access inside the guard; a per-handler check in each service method |
| 16 | 2026-08-23 | transactions | 1 | An EXPIRED matter_access grant falls THROUGH rung 4 to rung 5, rather than denying outright | 13 §1 states rung 4 as "matter_access row exists **(not expired)**", so an expired row does not match it and evaluation continues. My first version short-circuited to DENIED, which quietly stripped an unassigned attorney of the read-only cover every attorney at the firm has — losing an EXTRA permission must never cost a baseline one. A paralegal still gets denied, and still with `ACCESS_EXPIRED` rather than `NOT_ASSIGNED`, because "ask for it again" and "you were never on this matter" are different offers in the UI. **Found by the exhaustive role×assignment grid in the unit spec, not by the E2E** — the E2E only walks paths a request happens to take, and no endpoint produced this combination. | Denying any expired grant regardless of role (stricter, but arbitrary and contrary to 13 §1) |

## Superseding a decision

**Never edit an existing row.** This file is `may_append_only` and `check-mounts.sh` fails on a
removed line — and more importantly, a decision log that can be edited is a changelog, not a
reasoning trail. Append a new row that says which one it supersedes and why the reasoning changed.

Mission 002 produced the first real instance: decision-log row 9 set the trigger for making
Foundations a real agent at "two or more feature agents running concurrently". Slice 1 disproved it
with one agent — the gap was provisioning, not divergence. Row 9 stays exactly as written, because
what it got wrong and why is the useful part.

## Belongs here

- A pattern another agent will inherit
- A deviation from the documented approach, with justification
- A knowing tradeoff (optimistic vs pending, perf vs clarity)
- An interpretation of an ambiguous contract or doc

## Does not belong here

- Routine implementation — that's what the code says
- Anything already settled in `06-frontend-architecture.md`. Don't re-litigate; if you're
  deviating from it, *that* is the decision worth logging.

## Example

Illustration only — never copy these rows into the log above.

| # | date | agent | slice | decision | rationale | rejected |
|---|---|---|---|---|---|---|
| 4 | 2026-01-15 | drafts | draft-review | `sectionsReviewed` in component state, not Zustand | view-local; resetting on navigation is correct for an attestation — a stale "reviewed" set across navigations would be a compliance hazard | Zustand store (would persist across matters) |
| 5 | 2026-01-15 | drafts | draft-review | attestation modal as its own component | the gate logic gets one home and can't be partially duplicated | inline in ApproveBar |
