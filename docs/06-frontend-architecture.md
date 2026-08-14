# CounselOS — Frontend Architecture
### Data flow, state ownership, and the patterns every component inherits

> This doc resolves the architectural decisions that sit between "here are the screens" and "here's how to build them." Screens and visual design live in `07-design-handoff.md` + `design-system-v5.html`. The API contract lives in the backend docs. **This doc is how data moves.**
>
> Read Part 1 before writing any component. The three principles there resolve most decisions this doc doesn't explicitly cover.

---

# Part 1 — The Three Principles

Everything below follows from these. When you hit a decision this doc doesn't answer, apply these in order.

### 1. One source of truth per piece of data

Server data lives in **SWR and only SWR**. Ephemeral UI state lives in **Zustand or component state**. Never both. The moment the same data exists in two places, it will drift, and reconciling the drift produces bugs that are miserable to reproduce.

### 2. Cross-cutting concerns get exactly one home

Auth lives in `apiFetch`. SSE lives in one hook. Key construction lives in one module. Invalidation is declared on the mutation, not the caller. If a pattern appears in two places, it will drift.

### 3. Match the tool to the data's nature

| Data nature | Tool |
|---|---|
| Live, authenticated, interactive | Client component + SWR |
| Static, read-once, public | Server component |
| In-flight (streaming tokens) | Local component state |
| Ephemeral UI (toasts, connection status) | Zustand |

---

# Part 2 — State Ownership

## What lives where

**SWR — all server data.** Transactions, documents, deadlines, drafts, communications, notes, tasks, time entries, invoices, leads, dashboard aggregates. If it came from the API, it lives here.

**Zustand — two stores, ephemeral only.**

```
auth.store.ts
  accessToken        # in memory ONLY — never localStorage
  user               # id, role, firmId, fullName
  tokenVersion       # increments on refresh — SSE hooks depend on this
  isAuthenticated

realtime.store.ts
  connectionStatus   # 'connecting' | 'open' | 'closed'
  notificationQueue  # session-scoped, resets on reload — there is no
                     # persistent unread endpoint in Phase 1
  bellOpened
```

**Component state — in-flight and view-local.** The accumulating chat message during streaming. Which draft sections the attorney has marked reviewed. Open/closed drawers. Form state before submit.

## What does NOT live in Zustand

No transaction store. No document store. No cached server entities of any kind. If you find yourself adding server data to Zustand, you're violating Principle 1 — it belongs in SWR.

---

# Part 3 — SWR Keys & Invalidation

## The key IS the API path

```ts
// lib/api/queryKeys.ts — the single home for key construction
export const keys = {
  dashboard:        ()          => `/v1/dashboard`,
  transactions:     (q?: string)=> `/v1/transactions${q ? `?${q}` : ''}`,
  transaction:      (id: string)=> `/v1/transactions/${id}`,
  activity:         (id: string)=> `/v1/transactions/${id}/activity`,
  documents:        (id: string)=> `/v1/transactions/${id}/documents`,
  checklist:        (id: string)=> `/v1/transactions/${id}/checklist`,
  deadlines:        (id: string)=> `/v1/transactions/${id}/deadlines`,
  firmDeadlines:    ()          => `/v1/deadlines`,
  chatMessages:     (id: string, s: string) => `/v1/transactions/${id}/chat/${s}/messages`,
  drafts:           (id: string)=> `/v1/transactions/${id}/drafts`,
  draft:            (id: string, d: string) => `/v1/transactions/${id}/drafts/${d}`,
  notes:            (id: string)=> `/v1/transactions/${id}/notes`,
  communications:   (id: string)=> `/v1/transactions/${id}/communications`,
  tasks:            (id: string)=> `/v1/transactions/${id}/tasks`,
  timeEntries:      (id: string)=> `/v1/transactions/${id}/time-entries`,
  invoices:         (id: string)=> `/v1/transactions/${id}/invoices`,
  leads:            ()          => `/v1/leads`,
} as const
```

Using the literal path means two components fetching the same resource **cannot** use different keys. The duplicate-fetch problem solves itself.

## Invalidation is declared on the mutation

Not in the component that calls it. Declared once, can't be forgotten at a new call site.

```ts
// lib/api/mutations.ts
export async function logCommunication(txId: string, body: NewCommunication) {
  const res = await apiFetch(keys.communications(txId), { method: 'POST', body })
  await Promise.all([
    mutate(keys.communications(txId)),
    mutate(keys.activity(txId)),
  ])
  return res
}
```

## The invalidation map

| Mutation | Invalidates |
|---|---|
| Create / update transaction | `transactions`, `transaction(id)`, `dashboard` |
| Change transaction status | `transaction(id)`, `transactions`, `activity(id)`, `dashboard` |
| Upload document | `documents(id)`, `checklist(id)`, `activity(id)` |
| Document reaches READY *(via SSE)* | `documents(id)`, `checklist(id)`, `activity(id)` |
| Confirm / complete / dismiss deadline | `deadlines(id)`, `firmDeadlines`, `activity(id)`, `dashboard` |
| Log communication | `communications(id)`, `activity(id)` |
| Add matter note | `notes(id)`, `activity(id)` |
| Create / complete task | `tasks(id)`, `activity(id)`, `dashboard` |
| Create / edit time entry | `timeEntries(id)` |
| Create invoice | `invoices(id)`, `timeEntries(id)` — entries become locked |
| Approve draft | `draft(id, dId)`, `drafts(id)`, `activity(id)` |
| Update checklist item | `checklist(id)`, `activity(id)` |
| Convert lead | `leads`, `transactions`, `dashboard` |

**Rule of thumb:** any mutation on a transaction invalidates `activity(id)` — the activity feed reflects everything. Anything with a deadline, task, or status dimension also invalidates `dashboard`.

## SWR global config

```ts
{
  revalidateOnFocus: false,   // attorneys switch tabs constantly — surprise
                              // refetches mid-workflow are disruptive
  revalidateOnReconnect: true,
  shouldRetryOnError: false,  // apiFetch handles auth retry; don't double-retry
  dedupingInterval: 2000,
}
```

---

# Part 4 — SSE → Cache Reconciliation

**The rule: SSE events do not update state. They invalidate SWR keys.** Zustand only receives what has no server representation.

The tempting alternative — having events carry payloads that patch local state directly — creates two sources of truth that drift. Invalidate-and-refetch costs one round trip and guarantees the UI matches the server.

## Per-event reconciliation table

| Event | SWR invalidation | Zustand | Notes |
|---|---|---|---|
| `document.status` | `documents(txId)` — patch, no revalidate | — | High frequency. Use `mutate(key, updater, {revalidate:false})` to patch the one document's status. |
| `document.ready` | `documents(txId)`, `checklist(txId)`, `activity(txId)` | push notification | Full revalidate — the checklist may have auto-checked. |
| `document.failed` | `documents(txId)`, `activity(txId)` | push notification | |
| `deadline.alert` | `deadlines(txId)`, `firmDeadlines`, `dashboard` | push notification | |
| `draft.ready` | `drafts(txId)`, `draft(txId,draftId)`, `activity(txId)` | push notification | |
| `lead.new` | `leads`, `dashboard` | push notification | |
| `task.assigned` | `tasks(txId)`, `dashboard` | push notification (if assigned to me) | |
| `wire.flagged` | `activity(txId)` | push **CRITICAL** notification | Moat feature. Must be visually distinct. |
| `snapshot` | revalidate all currently-mounted keys | set `connectionStatus: 'open'` | Sent on reconnect — see below. |
| `ping` | — | — | Heartbeat. Ignore entirely. |

## The two patch-vs-revalidate cases

**Patch (no revalidate)** — only `document.status`. It fires many times per document as the pipeline advances, and a full refetch on each is wasteful. Patch the single document's status field in place.

**Revalidate (default for everything else)** — the event tells you *something changed*; SWR fetches what it actually is. Never trust the event payload as truth.

## Reconnection

The backend sends a `snapshot` event on reconnect, not an event replay. On receiving it: revalidate every currently-mounted SWR key rather than trying to diff. The user has been disconnected; a full refresh of what's on screen is correct and cheap.

## The hook

One hook owns the global stream. Mounted once, in the `(attorney)` layout.

```ts
// lib/sse/useGlobalEvents.ts
export function useGlobalEvents() {
  const tokenVersion = useAuthStore(s => s.tokenVersion)  // reconnect on refresh
  const { push, setStatus } = useRealtimeStore()

  useEffect(() => {
    const es = new EventSource(`${API}/v1/events?token=${getToken()}`)
    es.onopen = () => setStatus('open')
    es.onerror = () => setStatus('connecting')  // browser auto-reconnects

    es.addEventListener('document.ready', (e) => {
      const { transactionId } = JSON.parse(e.data)
      mutate(keys.documents(transactionId))
      mutate(keys.checklist(transactionId))
      mutate(keys.activity(transactionId))
      push({ type: 'document.ready', ... })
    })
    // ...one listener per event type, per the table above

    return () => es.close()
  }, [tokenVersion])   // token refresh tears down and re-establishes
}
```

**The `tokenVersion` dependency is load-bearing.** EventSource can't set headers, so the token travels in the URL. When the token refreshes, the open connection is authenticated with a dead token — depending on `tokenVersion` makes the reconnect automatic.

---

# Part 5 — Server vs Client Components

**Default to client components.** This app is fundamentally live — SSE, SWR, optimistic updates, Zustand. Server-rendering data surfaces and hydrating them into SWR creates a hydration seam and a caching mismatch for essentially zero benefit in an authenticated internal tool where nobody measures LCP.

| Surface | Rendering | Why |
|---|---|---|
| `app/layout.tsx`, nav shell, static chrome | **Server** | No data, no interactivity |
| `(attorney)` layout | **Client** | Mounts SSE, reads auth store |
| Every attorney data surface | **Client** | SWR + interactivity |
| `(client)/status/[id]` | **Server** | Read-only, non-interactive, and the token never touches client JS |

The client status page is the deliberate exception. Validate the token and fetch server-side; render static HTML. It's the one surface where server rendering is genuinely correct.

---

# Part 6 — Auth Lifecycle

**`apiFetch` owns the entire token lifecycle. Components never think about auth.**

```ts
// lib/api/client.ts
let refreshPromise: Promise<string> | null = null   // single-flight

async function refreshToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  let res = await fetch(`${API}${path}`, withAuth(opts))

  if (res.status === 401) {
    const { error } = await res.clone().json()

    if (error.code === 'USER_INACTIVE') {
      router.push('/auth/deactivated')      // NOT login
      throw new ApiError(error)
    }
    if (error.code === 'TOKEN_EXPIRED') {
      await refreshToken()                  // all callers await the same refresh
      useAuthStore.getState().bumpTokenVersion()   // triggers SSE reconnect
      res = await fetch(`${API}${path}`, withAuth(opts))  // retry once
    }
  }

  const body = await res.json()
  if (!body.success) throw new ApiError(body.error)
  return body.data
}
```

Three things that matter here:

**Single-flight refresh.** If five requests 401 simultaneously you fire one refresh and the others await it. Without this you get a refresh storm and possible token invalidation.

**`USER_INACTIVE` goes to `/auth/deactivated`, not login.** The user's credentials are fine; their account was disabled. Sending them to login produces a confusing loop.

**`bumpTokenVersion()` after refresh** — this is what makes the SSE connection re-establish with the new token.

---

# Part 7 — Optimistic Updates

**Optimistic only for creates on a list the user is currently looking at.** Everywhere else: pending state, then revalidate.

| Optimistic | Not optimistic |
|---|---|
| Log a communication | Status transitions |
| Add a matter note | Deadline confirm / dismiss |
| Create a task | Draft approval |
| Add a time entry | Document upload (has its own pipeline UI) |
| | Invoice creation |
| | Lead conversion |

Optimism has a real cost — every instance needs a rollback path and a failure UI. Applying it to the four high-frequency creates gets nearly all the perceived speed at a fraction of the complexity.

Use SWR's built-ins rather than hand-rolling; they handle race conditions you'd otherwise get wrong.

```ts
await mutate(
  keys.communications(txId),
  postCommunication(txId, draft),
  {
    optimisticData: (current) => [optimisticEntry(draft), ...(current ?? [])],
    rollbackOnError: true,
    populateCache: true,
    revalidate: true,
  }
)
```

On failure: roll back (automatic) and show a toast. Never leave a phantom row.

---

# Part 8 — The Streaming Chat Component

Chat has mechanics nothing else in the app has. The governing rule:

**The in-progress message lives in component state. It enters SWR only when complete.**

Putting accumulating tokens in the SWR cache means fighting the cache on every token. Keep it local; commit on completion.

```
User sends message
  → POST .../messages                    (message persisted server-side)
  → open EventSource .../chat/:sid/stream
  → 'token' events   → append to local `streamingText`
  → 'citations' event→ local `citations`
  → 'done' event     → mutate(keys.chatMessages(txId, sid))   // commit
                     → clear local streaming state
```

**Render:** the committed messages come from SWR; the in-progress one renders from local state beneath them. One message component handles both — it doesn't care where its text came from.

**Reconnect recovery.** If the stream drops mid-generation, poll:

```
GET /v1/transactions/:id/chat/:sid/messages?since={lastMessageId}
```

If the latest assistant message returns `is_complete: false`, render its `partial_content` and resume polling (or reopen the stream). If `is_complete: true`, commit it and clear local state. **The live path and the recovery path converge on the same render** — that's what keeps this component manageable.

---

# Part 9 — Transaction Detail Shell

**The shell fetches the transaction once. Tabs fetch their own collections.**

```
(attorney)/transactions/[id]/layout.tsx     ← fetches transaction, provides context
  ├── page.tsx              overview   (uses context, no extra fetch)
  ├── documents/page.tsx    → keys.documents(id)
  ├── checklist/page.tsx    → keys.checklist(id)
  ├── deadlines/page.tsx    → keys.deadlines(id)
  ├── chat/page.tsx         → keys.chatMessages(id, sid)
  ├── drafts/page.tsx       → keys.drafts(id)
  ├── notes/page.tsx        → keys.notes(id)
  ├── communications/page.tsx → keys.communications(id)
  ├── tasks/page.tsx        → keys.tasks(id)
  └── time/page.tsx         → keys.timeEntries(id)
```

The transaction record (status, parties, address, dates) is needed by every tab — fetch once in the layout, provide via context. Each tab's collection fetches independently, so opening one tab doesn't load nine collections.

**Cross-tab freshness is free.** Because invalidation is declared on mutations (Part 3), logging a communication already invalidates `activity(id)`. When the user switches to that tab, SWR revalidates. No explicit cross-tab coordination needed.

---

# Part 10 — Loading & Error States

| Situation | Pattern |
|---|---|
| Initial page load (dashboard, lists) | Skeleton matching final layout |
| In-place action (button click) | Inline spinner on the control, disabled |
| Document processing | Dedicated pipeline state with stage label — genuinely long-running |
| Draft generating | Dedicated state; `draft.ready` SSE resolves it |
| Chat streaming | Cursor / typing indicator on the in-progress message |
| Mutation failure | Toast + rollback |
| Field validation (422) | Inline, mapped from `error.details` by field name |
| Auth failure | Full-page redirect (login / deactivated) |
| Not found (404) | Full-page — and on the client portal, generic, never revealing existence |

**Empty states follow the brand voice** — no "You don't have any cases yet!" Instead: *"No active transactions. Add your first one and CounselOS starts working immediately."*

---

# Part 11 — Forms

**Zod schemas live in `packages/shared` and are imported by both the frontend forms and the backend DTOs.**

This is the highest-leverage decision in this doc. The chat 4,000-character limit, draft instructions 2,000, matter notes 2,000, communication summary 500 — defined once, enforced identically on both sides. They cannot drift.

```ts
// packages/shared/src/schemas/communication.schema.ts
export const createCommunicationSchema = z.object({
  type:        z.enum(COMMUNICATION_TYPES),
  direction:   z.enum(['INBOUND','OUTBOUND']),
  contactName: z.string().min(1).max(100),
  summary:     z.string().min(1).max(500),
  occurredAt:  z.string().datetime(),
})
```

Frontend: `useForm({ resolver: zodResolver(createCommunicationSchema) })`.
Backend: the same schema in the `ZodValidationPipe`.

**Server error mapping:** a 422 returns `error.details` keyed by field name. Map it onto the form with `setError(field, { message })` so server-side failures surface exactly where client-side ones do.

---

# Part 12 — File Structure

```
apps/web/src/
├── app/
│   ├── (attorney)/          # client-rendered, SSE mounted in layout
│   └── (client)/            # server-rendered status page
├── components/
│   ├── ui/                  # primitives
│   ├── transactions/ documents/ chat/ drafts/ communications/ dashboard/
├── lib/
│   ├── api/
│   │   ├── client.ts        # apiFetch — owns auth lifecycle
│   │   ├── queryKeys.ts     # the ONLY place keys are built
│   │   └── mutations.ts     # mutations + their invalidation sets
│   ├── hooks/               # useTransactions, useDeadlines, ...
│   └── sse/
│       ├── useGlobalEvents.ts
│       ├── useDocumentStream.ts
│       └── useChatStream.ts
├── stores/
│   ├── auth.store.ts
│   └── realtime.store.ts
└── styles/globals.css       # Design System v5 tokens
```

---

# Part 13 — Command Palette & Service Honesty

Two cross-cutting patterns that don't belong to a single screen.

## Command palette (⌘K)

Keyboard-first navigation. The single strongest answer to "too many clicks."

- Mounted once in the `(attorney)` layout, opened by ⌘K / Ctrl+K from anywhere
- Queries `GET /v1/search/quick?q=` — SWR with a short `dedupingInterval`, debounced ~150ms
- **Not cached across sessions** — palette results are ephemeral; use `revalidateOnMount`
- Empty query shows recent transactions from local state, no fetch
- Results grouped by type (transactions, deadlines, communications), arrow-key navigable, Enter to jump
- Quick actions inline: "Log a call on {transaction}" opens the quick-add drawer pre-scoped
- `data-testid="command-palette"`, `data-testid="command-palette-input"`

## Service honesty

**Never fake a working integration, and never spin forever on a service known to be down.**

- `GET /v1/health/services` polled every 60s from the `(attorney)` layout, stored in the **realtime store** (it's ephemeral status, not server data — Principle 1)
- Status values: `ok` | `degraded` | `down` | `not_configured`
- When a dependency is `down` or `not_configured`, the features that depend on it render a **disabled state with a plain explanation**, not a spinner:
  - *"Document chat is unavailable — the AI service is not responding. Your documents are safe and searchable."*
- A persistent, dismissible banner shows degraded state — visible, not buried
- Never block the whole app for a partial outage. Uploads still work when embeddings are down; the deadline dashboard still works when email is down.

This is the same discipline as the chat no-hallucination fallback: when the system doesn't know, it says so.

---

## Quick Reference

| Question | Answer |
|---|---|
| Where does server data live? | SWR, only SWR |
| Where does the token live? | Zustand auth store, in memory, never localStorage |
| What's the SWR key? | The literal API path, built in `queryKeys.ts` |
| What does an SSE event do? | Invalidates SWR keys (patch only for `document.status`) |
| Who handles 401? | `apiFetch`, with single-flight refresh |
| Server or client component? | Client, except static chrome and the client status page |
| When optimistic? | Creates on a list the user is watching — nothing else |
| Where do in-flight chat tokens live? | Component state, committed to SWR on completion |
| Where do validation schemas live? | `packages/shared`, imported by both sides |

---

*One source of truth per piece of data. One home per cross-cutting concern. Match the tool to the data's nature.*
