import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Granting a colleague access to a matter (8G).
 *
 * `expiresAt` is the vacation-coverage case: cover for two weeks, and the grant
 * lapses on its own. An access grant nobody remembers to revoke is how
 * "everyone sees everything" comes back through the side door.
 */
export const grantAccessSchema = z.object({
  userId: z.uuid('Choose a colleague to grant access to.'),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export class GrantAccessDto extends createZodDto(grantAccessSchema) {}
export type GrantAccessInput = z.infer<typeof grantAccessSchema>;
