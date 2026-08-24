import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { OUTCOME_REASONS, TERMINAL_TRANSACTION_STATUSES, TRANSACTION_STATUSES } from '@counselos/shared';

/** Outcome notes cap. Not in FIELD_LIMITS yet — see the note in the schema. */
export const OUTCOME_NOTES_MAX = 500;

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
     * 500 chars, matching COMMUNICATION_SUMMARY's reasoning rather than its
     * constant: FIELD_LIMITS has no OUTCOME_NOTES entry and packages/shared is
     * Foundations' file. Filed in .team-5/log/error-log.md to be hoisted.
     */
    outcomeNotes: z.string().trim().max(OUTCOME_NOTES_MAX).optional(),
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
