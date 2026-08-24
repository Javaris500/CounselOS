import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { createTransactionSchema } from './create-transaction.dto';

/**
 * Partial update.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `status` IS NOT REACHABLE FROM HERE.
 *
 * It is absent from `createTransactionSchema`, so it is absent from this
 * partial too — and that is the point. Status moves through
 * `PATCH /:id/status`, which runs the transition map. A `status` key accepted
 * on the general PATCH would be a second, unguarded door to a legal state, and
 * it would look completely reasonable in review.
 *
 * `parties` is dropped as well: adding one is `POST /:id/parties`, which logs
 * `party.added`. Letting a PATCH replace the array wholesale would erase that
 * history silently.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const updateTransactionSchema = createTransactionSchema
  .omit({ parties: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Nothing to update.',
  });

export class UpdateTransactionDto extends createZodDto(updateTransactionSchema) {}
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
