import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { PAGINATION, TRANSACTION_STATUSES, TRANSACTION_TYPES } from '@counselos/shared';

/**
 * List query. Every value arrives as a string on a query string, so numbers and
 * booleans are coerced here rather than parsed in the controller.
 *
 * Sort defaults to `closingDate` ascending — soonest closing first (05 §3E).
 * That is the order an attorney actually wants at 8am, and it is why
 * `transactions_closing_date_idx` exists.
 *
 * Archived and soft-deleted rows are excluded by default. Deleted rows have no
 * opt-in at all: `notDeleted.transactions` is not conditional on a query
 * parameter, because "show me deleted matters" is not a feature.
 */
export const listTransactionsSchema = z.object({
  status: z.enum(TRANSACTION_STATUSES).optional(),
  transactionType: z.enum(TRANSACTION_TYPES).optional(),
  assignedAttorneyId: z.uuid().optional(),

  closingBefore: z.iso.datetime({ offset: true }).optional(),
  closingAfter: z.iso.datetime({ offset: true }).optional(),

  includeArchived: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),

  sort: z.enum(['closingDate', 'updatedAt', 'status']).optional(),

  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).optional(),
});

export class ListTransactionsDto extends createZodDto(listTransactionsSchema) {}
export type ListTransactionsQuery = z.infer<typeof listTransactionsSchema>;
