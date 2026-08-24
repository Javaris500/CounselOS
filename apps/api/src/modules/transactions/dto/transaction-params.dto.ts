import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Path parameters, validated like any other input.
 *
 * WHY THIS EXISTS RATHER THAN `ParseUUIDPipe`
 *   Nest's built-in pipe throws a 400, and `GlobalExceptionFilter.codeForStatus`
 *   has no 400 case — a malformed id would come back as `INTERNAL_ERROR`, which
 *   tells the frontend the server broke when the client sent a bad path. Going
 *   through the Zod pipe gives the same 422 + field-level `details` shape as
 *   every other validation failure in the system.
 */
export const transactionParamsSchema = z.object({
  id: z.uuid('Not a valid transaction id.'),
});
export class TransactionParamsDto extends createZodDto(transactionParamsSchema) {}

export const partyParamsSchema = transactionParamsSchema.extend({
  partyId: z.uuid('Not a valid party id.'),
});
export class PartyParamsDto extends createZodDto(partyParamsSchema) {}

export const accessParamsSchema = transactionParamsSchema.extend({
  userId: z.uuid('Not a valid user id.'),
});
export class AccessParamsDto extends createZodDto(accessParamsSchema) {}
