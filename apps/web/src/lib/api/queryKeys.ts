/**
 * The single home for SWR key construction (06 Part 3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE KEY IS THE LITERAL API PATH.
 *
 * Not a tuple, not a symbol, not a hand-built string at the call site. Because
 * the key and the URL are the same value, two components fetching the same
 * resource *cannot* choose different keys — the duplicate-fetch and
 * stale-after-mutation problems solve themselves rather than being remembered.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * APPEND-ONLY FOR SLICE AGENTS. Add your entries at the end of the object,
 * following the existing shape. Never modify an existing entry and never change
 * the pattern — a key that changes silently invalidates nothing, and the stale
 * data that results looks like a backend bug. If you believe the pattern is
 * wrong, that is a finding, not an edit.
 *
 * Log every addition in `.team-5/shared/shared-file-touches.md` in the SAME
 * commit. Five agents appending here in parallel worktrees is the single
 * biggest structural risk on this team; that log is what makes a duplicate
 * visible in one file instead of five branches at merge time.
 */
export const keys = {
  dashboard: () => `/v1/dashboard`,
  transactions: (q?: string) => `/v1/transactions${q ? `?${q}` : ''}`,
  transaction: (id: string) => `/v1/transactions/${id}`,
  activity: (id: string) => `/v1/transactions/${id}/activity`,
  documents: (id: string) => `/v1/transactions/${id}/documents`,
  checklist: (id: string) => `/v1/transactions/${id}/checklist`,
  deadlines: (id: string) => `/v1/transactions/${id}/deadlines`,
  firmDeadlines: () => `/v1/deadlines`,
  chatMessages: (id: string, s: string) => `/v1/transactions/${id}/chat/${s}/messages`,
  drafts: (id: string) => `/v1/transactions/${id}/drafts`,
  draft: (id: string, d: string) => `/v1/transactions/${id}/drafts/${d}`,
  notes: (id: string) => `/v1/transactions/${id}/notes`,
  communications: (id: string) => `/v1/transactions/${id}/communications`,
  tasks: (id: string) => `/v1/transactions/${id}/tasks`,
  timeEntries: (id: string) => `/v1/transactions/${id}/time-entries`,
  invoices: (id: string) => `/v1/transactions/${id}/invoices`,
  leads: () => `/v1/leads`,

  /** Dependency state for the service-honesty banner (05 §8L, 06 Part 13). */
  healthServices: () => `/v1/health/services`,
} as const;

/**
 * Global SWR configuration (06 Part 3).
 *
 * `revalidateOnFocus: false` is not a performance tweak — attorneys switch tabs
 * constantly, and a refetch that reorders a list or clears a half-filled form
 * mid-workflow is actively disruptive.
 *
 * `shouldRetryOnError: false` because apiFetch already handles the one retry
 * that matters (refresh-and-retry on TOKEN_EXPIRED). Retrying on top of that
 * multiplies a failing request instead of surfacing it.
 */
export const swrConfig = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  shouldRetryOnError: false,
  dedupingInterval: 2000,
} as const;
