import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { partyInputSchema } from './create-transaction.dto';

/** Adding a party after intake. Same shape the create flow accepts inline. */
export class CreatePartyDto extends createZodDto(partyInputSchema) {}

export const updatePartySchema = partyInputSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

export class UpdatePartyDto extends createZodDto(updatePartySchema) {}
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;
