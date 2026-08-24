import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  FIELD_LIMITS,
  OUTCOME_REASONS,
  TERMINAL_TRANSACTION_STATUSES,
  TRANSACTION_STATUSES,
} from '@counselos/shared';

/**
 * A status change, and the outcome capture that rides with a terminal one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A CLOSE WITHOUT AN `outcomeReason` IS REJECTED HERE, AT THE PIPE.
 *
 * `outcome_reason` is UNRECOVERABLE (16 §2.3). The attorney knows why the deal
 * died at the moment they move it to FALLEN_THROUGH and never again — six
 * months later nobody reconstructs it, and "what kills our deals?" has no
 * honest answer. So the dropdown is mandatory exactly when it is answerable.
 *
 * `superRefine` rather than a service check, because this is the shape of a
 * valid request: it comes back as a 422 keyed on `outcomeReason`, which
 * `applyServerErrors` drops straight onto that field in the form. The service
 * asserts it again — it is a business rule and another module may call the
 * service directly — but the field-level answer belongs here.
 *
 * NOT `INVALID_STATUS_TRANSITION`: the transition itself is legal. Returning
 * that code would make the UI render "here is where you may go instead", which
 * is the wrong instruction for a missing field.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const updateStatusSchema = z
  .object({
    status: z.enum(TRANSACTION_STATUSES),
    outcomeReason: z.enum(OUTCOME_REASONS).optional(),
    /**
     * The shared limit, so the character counter in the browser and the
     * validator here cannot disagree. Was a local constant while
     * `packages/shared` was outside this slice's boundary (error-log row 4);
     * Foundations hoisted it, so the local copy is gone rather than synced.
     */
    outcomeNotes: z.string().trim().max(FIELD_LIMITS.OUTCOME_NOTES).optional(),
  })
  .superRefine((value, ctx) => {
    const terminal = (TERMINAL_TRANSACTION_STATUSES as readonly string[]).includes(value.status);
    if (terminal && value.outcomeReason === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['outcomeReason'],
        message:
          'Record why this matter ended. It cannot be captured after the fact, and it is what makes closed-matter reporting possible.',
      });
    }
    if (!terminal && value.outcomeReason !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['outcomeReason'],
        message: 'An outcome is only recorded when a matter closes or falls through.',
      });
    }
  });

export class UpdateStatusDto extends createZodDto(updateStatusSchema) {}
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
