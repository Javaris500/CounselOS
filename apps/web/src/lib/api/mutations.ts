import { mutate } from 'swr';

import { apiFetch } from './client';
import { keys } from './queryKeys';

/**
 * Every mutation, with its invalidation declared here rather than at the call
 * site (06 Part 3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY INVALIDATION LIVES ON THE MUTATION
 *
 * Declared once, it cannot be forgotten at a new call site. Declared in the
 * component, the third place someone logs a communication is the place the
 * activity feed silently stops updating — and that bug looks like a backend
 * problem for a day before anyone finds it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE RULE OF THUMB: any mutation on a transaction invalidates `activity(id)`.
 * Anything with a deadline, task, or status dimension also invalidates
 * `dashboard`. Nemi audits for exactly this.
 *
 * APPEND-ONLY FOR SLICE AGENTS — same discipline as queryKeys.ts. Add yours at
 * the end, follow the shape, log the touch in
 * `.team-5/shared/shared-file-touches.md` in the same commit.
 *
 * OPTIMISM IS THE EXCEPTION, NOT THE DEFAULT (06 Part 7). Only the four
 * high-frequency creates below use it — communication, note, task, time entry —
 * each a create on a list the user is watching, where the row appearing
 * instantly is the whole adoption argument. Status transitions, deadline
 * confirms, draft approvals, and invoicing use a pending state and then
 * revalidate: showing a legal state change that may not have happened is worse
 * than showing a spinner.
 */

// ── Transactions ─────────────────────────────────────────────────────────────

export async function createTransaction<T>(body: unknown): Promise<T> {
  const result = await apiFetch<T>(keys.transactions(), { method: 'POST', body });
  await Promise.all([mutate(keys.transactions()), mutate(keys.dashboard())]);
  return result;
}

export async function updateTransactionStatus<T>(txId: string, body: unknown): Promise<T> {
  // Not optimistic, deliberately. A status is a legal state; rendering a
  // transition the server may reject is worse than a moment of pending.
  const result = await apiFetch<T>(`${keys.transaction(txId)}/status`, { method: 'PATCH', body });
  await Promise.all([
    mutate(keys.transaction(txId)),
    mutate(keys.transactions()),
    mutate(keys.activity(txId)),
    mutate(keys.dashboard()),
  ]);
  return result;
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function uploadDocument<T>(txId: string, form: FormData): Promise<T> {
  const result = await apiFetch<T>(keys.documents(txId), { method: 'POST', body: form });
  await Promise.all([
    mutate(keys.documents(txId)),
    // The checklist may have auto-checked off this upload.
    mutate(keys.checklist(txId)),
    mutate(keys.activity(txId)),
  ]);
  return result;
}

export async function updateChecklistItem<T>(
  txId: string,
  itemId: string,
  body: unknown,
): Promise<T> {
  const result = await apiFetch<T>(`${keys.checklist(txId)}/${itemId}`, {
    method: 'PATCH',
    body,
  });
  await Promise.all([mutate(keys.checklist(txId)), mutate(keys.activity(txId))]);
  return result;
}

// ── Deadlines ────────────────────────────────────────────────────────────────

/** Confirm, complete, or dismiss. Never optimistic — see the header note. */
export async function updateDeadline<T>(
  txId: string,
  deadlineId: string,
  body: unknown,
): Promise<T> {
  const result = await apiFetch<T>(`${keys.deadlines(txId)}/${deadlineId}`, {
    method: 'PATCH',
    body,
  });
  await Promise.all([
    mutate(keys.deadlines(txId)),
    mutate(keys.firmDeadlines()),
    mutate(keys.activity(txId)),
    mutate(keys.dashboard()),
  ]);
  return result;
}

// ── Drafts — the Opinion 705 surface ─────────────────────────────────────────

export async function approveDraft<T>(txId: string, draftId: string, body: unknown): Promise<T> {
  // Never optimistic. Approval is an attestation with an attorney's licence
  // attached; the UI must not show it as done until the server says it is.
  const result = await apiFetch<T>(`${keys.draft(txId, draftId)}/approve`, {
    method: 'POST',
    body,
  });
  await Promise.all([
    mutate(keys.draft(txId, draftId)),
    mutate(keys.drafts(txId)),
    mutate(keys.activity(txId)),
  ]);
  return result;
}

// ── The four optimistic creates ──────────────────────────────────────────────

/**
 * The four high-frequency creates, optimistically applied.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ROLLBACK IS SWR'S, NOT HAND-ROLLED.
 *
 * `optimisticData` puts the row on screen immediately; `rollbackOnError` takes
 * it back off if the request fails. Hand-rolling that pair is how phantom rows
 * appear — a create that shows up and then silently vanishes is worse than one
 * that took a second, because the attorney believes the call was logged.
 *
 * The caller MUST pair this with a failure toast. Rollback alone is invisible.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function optimisticCreate<T>(
  key: string,
  body: unknown,
  extraKeys: string[],
  /** Provisional row, rendered until the server responds. */
  optimisticRow: unknown,
): Promise<T> {
  const result = await mutate(key, apiFetch<T>(key, { method: 'POST', body }), {
    optimisticData: (current: unknown) =>
      Array.isArray(current) ? [optimisticRow, ...current] : [optimisticRow],
    rollbackOnError: true,
    // The server's row replaces the provisional one — ids, timestamps, and
    // any computed field only it knows.
    revalidate: true,
    populateCache: false,
  });

  await Promise.all(extraKeys.map((k) => mutate(k)));
  return result as T;
}

/**
 * A provisional row carries a temporary id so React can key it, and a flag so a
 * component can render it at reduced emphasis while it is in flight.
 */
const provisional = (body: unknown): Record<string, unknown> => ({
  ...(body as Record<string, unknown>),
  id: `optimistic-${String(Date.now())}`,
  isPending: true,
});

export const logCommunication = <T>(txId: string, body: unknown): Promise<T> =>
  optimisticCreate<T>(keys.communications(txId), body, [keys.activity(txId)], provisional(body));

export const addMatterNote = <T>(txId: string, body: unknown): Promise<T> =>
  optimisticCreate<T>(keys.notes(txId), body, [keys.activity(txId)], provisional(body));

export const createTask = <T>(txId: string, body: unknown): Promise<T> =>
  optimisticCreate<T>(
    keys.tasks(txId),
    body,
    [keys.activity(txId), keys.dashboard()],
    provisional(body),
  );

export const createTimeEntry = <T>(txId: string, body: unknown): Promise<T> =>
  optimisticCreate<T>(keys.timeEntries(txId), body, [keys.activity(txId)], provisional(body));

// ── Business operations ──────────────────────────────────────────────────────

export async function createInvoice<T>(txId: string, body: unknown): Promise<T> {
  const result = await apiFetch<T>(keys.invoices(txId), { method: 'POST', body });
  // Time entries become locked once invoiced — refetch so the UI shows them
  // read-only rather than offering an edit that will be refused.
  await Promise.all([mutate(keys.invoices(txId)), mutate(keys.timeEntries(txId))]);
  return result;
}

// ── Leads ────────────────────────────────────────────────────────────────────

export async function convertLead<T>(leadId: string, body: unknown): Promise<T> {
  const result = await apiFetch<T>(`${keys.leads()}/${leadId}/convert`, { method: 'POST', body });
  await Promise.all([mutate(keys.leads()), mutate(keys.transactions()), mutate(keys.dashboard())]);
  return result;
}
