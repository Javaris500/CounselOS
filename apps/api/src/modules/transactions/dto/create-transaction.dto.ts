import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  PARTY_ROLES,
  PARTY_TYPES,
  REFERRAL_SOURCE_TYPES,
  TRANSACTION_TYPES,
} from '@counselos/shared';

/**
 * Creating a matter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `transactionNumber` IS ABSENT ON PURPOSE, AND SO IS `status`.
 *
 * The number is generated server-side and unique per firm among live rows — a
 * client-side guess collides with a concurrent create, and the partial unique
 * index turns that into a 500 at the worst possible moment. `status` always
 * starts at INTAKE; letting a create set it would be a way around the
 * transition map, which is the one thing the map exists to prevent.
 *
 * Zod strips unknown keys by default, so a client that sends either is not
 * rejected — it is ignored, which is the correct answer for a field it has no
 * business setting.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `title` is optional because the server generates one
 * ("Martinez / Chen — 2847 Manor Rd"). Supplying it is the documented override.
 */

/** Money arrives as a string and stays one — `numeric` columns are strings in
 *  Drizzle, and routing a price through a JS float is how cents disappear. */
const money = (max: number, label: string): z.ZodType<string> =>
  z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, `${label} must be a positive amount, e.g. 615000.00`)
    .refine((v) => Number(v) < max, `${label} is implausibly large — check the figure.`);

export const partyInputSchema = z.object({
  role: z.enum(PARTY_ROLES),
  type: z.enum(PARTY_TYPES),
  name: z.string().trim().min(1, 'A party needs a name.').max(200),
  email: z.email('Enter a valid email address.').max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  companyName: z.string().trim().max(200).optional(),
  licenseNumber: z.string().trim().max(60).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2_000).optional(),
});

export const createTransactionSchema = z.object({
  transactionType: z.enum(TRANSACTION_TYPES),

  propertyAddress: z.string().trim().min(1, 'A property address is required.').max(300),
  propertyCity: z.string().trim().max(100).optional(),
  propertyState: z.string().trim().length(2, 'Use the two-letter state code.').optional(),
  propertyZip: z.string().trim().max(10).optional(),

  /** Override for the generated title. Omit it and the server writes one. */
  title: z.string().trim().min(1).max(200).optional(),

  /** Defaults to the caller. Set it to open a matter on a colleague's behalf. */
  assignedAttorneyId: z.uuid().optional(),
  assignedParalegalId: z.uuid().optional(),

  // THE anchor date — every deadline calculation originates here (05 §3A).
  effectiveDate: z.iso.datetime({ offset: true }).optional(),
  contractDate: z.iso.datetime({ offset: true }).optional(),
  closingDate: z.iso.datetime({ offset: true }).optional(),
  possessionDate: z.iso.datetime({ offset: true }).optional(),

  purchasePrice: money(1_000_000_000, 'Purchase price').optional(),
  earnestMoneyAmount: money(10_000_000, 'Earnest money').optional(),
  optionFee: money(1_000_000, 'Option fee').optional(),

  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),

  // Referral attribution is UNRECOVERABLE after intake (16 §2.2) — nobody
  // remembers the referrer eighteen months later, so it is captured here or
  // never.
  referralSourceType: z.enum(REFERRAL_SOURCE_TYPES).optional(),
  referralSourceName: z.string().trim().max(200).optional(),

  /** Parties may be supplied at intake; they are also addable afterwards. */
  parties: z.array(partyInputSchema).max(20).optional(),
});

export class CreateTransactionDto extends createZodDto(createTransactionSchema) {}
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type PartyInput = z.infer<typeof partyInputSchema>;
