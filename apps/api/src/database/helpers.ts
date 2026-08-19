import { isNull } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import {
  clientMessages,
  communications,
  deadlines,
  documentChecklistItems,
  documents,
  drafts,
  invoices,
  leads,
  matterNotes,
  tasks,
  timeEntries,
  transactions,
  verifiedWireInstructions,
} from './schema';

/**
 * Soft-delete predicates — one per table that carries `deleted_at`.
 *
 * Drizzle has no middleware layer, so there is no framework backstop the way
 * Prisma's global filter was. A list query that forgets this filter compiles,
 * passes lint, reads correctly in review, and silently returns deleted legal
 * records. That is the failure mode this map exists to make hard.
 *
 * Two rules follow from that:
 *   - Every list query on a table below includes its predicate.
 *   - A hand-written `isNull(x.deletedAt)` is a review item — use the map, so
 *     the pre-commit guard can see the filter and coverage stays greppable.
 *
 * Generated from the schema: exactly the tables carrying `deletedAt`, no more.
 * Adding `deleted_at` to a table without adding it here is an incomplete change.
 */
export const notDeleted = {
  transactions: isNull(transactions.deletedAt),
  documents: isNull(documents.deletedAt),
  deadlines: isNull(deadlines.deletedAt),
  drafts: isNull(drafts.deletedAt),
  leads: isNull(leads.deletedAt),
  matterNotes: isNull(matterNotes.deletedAt),
  communications: isNull(communications.deletedAt),
  documentChecklistItems: isNull(documentChecklistItems.deletedAt),
  tasks: isNull(tasks.deletedAt),
  timeEntries: isNull(timeEntries.deletedAt),
  invoices: isNull(invoices.deletedAt),
  verifiedWireInstructions: isNull(verifiedWireInstructions.deletedAt),
  clientMessages: isNull(clientMessages.deletedAt),
} as const satisfies Record<string, SQL>;

/** The tables that carry `deleted_at`. Useful for tests that assert coverage. */
export type SoftDeletableTable = keyof typeof notDeleted;
