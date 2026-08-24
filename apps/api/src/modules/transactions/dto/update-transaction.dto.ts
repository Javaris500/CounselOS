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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEITHER IS `assignedAttorneyId` OR `assignedParalegalId` — added 2026-08-24.
 *
 * They were reachable here until review confirmed, against the real stack, that
 * an assigned PARALEGAL could `PATCH` a colleague into `assignedAttorneyId` and
 * demote the matter's own attorney to READ_ONLY cover. The two columns are not
 * ordinary fields: they are the INPUT to the 8G ladder, so a route that writes
 * them is an access-control route wearing the clothes of a details form. That
 * is the same door `status` got closed above, on the same reasoning, and it
 * looked just as reasonable in review.
 *
 * There is deliberately no replacement route in this slice. 13 §1 says grants
 * exist precisely so coverage does not require changing ownership — "vacation
 * coverage, second-chairing, paralegal reassignment — WITHOUT changing
 * ownership of the matter". `POST /:id/access` is the supported gesture. If
 * true reassignment is ever needed it wants its own route, its own activity
 * event, and MANAGE_ACCESS — not a key on a partial update.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const updateTransactionSchema = createTransactionSchema
  .omit({ parties: true, assignedAttorneyId: true, assignedParalegalId: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Nothing to update.',
  });

export class UpdateTransactionDto extends createZodDto(updateTransactionSchema) {}
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
