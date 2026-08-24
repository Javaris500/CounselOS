import { z } from 'zod';
import { REFERRAL_SOURCE_TYPES, TRANSACTION_TYPES } from '@counselos/shared';

/**
 * The create form's schema.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS SHOULD LIVE IN `packages/shared` AND BE ONE OBJECT WITH THE BACKEND DTO.
 *
 * 06 Part 11 is explicit: one Zod schema validates in the browser and in the
 * Zod pipe, so a client-side rule cannot disagree with the server. Two
 * definitions is precisely the thing that rule forbids — a form that looks
 * valid and then 422s.
 *
 * `packages/shared` belongs to Foundations and is outside this slice's file
 * boundary, so the schema cannot be put where it goes. It is duplicated here
 * DELIBERATELY AND VISIBLY rather than quietly relaxed, filed in
 * `.team-5/log/error-log.md` as a blocker, and this file is deleted — not
 * synced — when Foundations hoists it to
 * `packages/shared/src/schemas/transaction.schema.ts`.
 *
 * Until then the mitigation is that a disagreement still surfaces: the server
 * returns 422 with `error.details` keyed by field, and `applyServerErrors`
 * drops it onto the offending input. The form is the weaker gate, never the
 * only one.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Mirrors `money()` in the API's create DTO. Cents are optional, floats never. */
const money = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, `${label} must be an amount like 615000 or 615000.00`)
    .optional()
    .or(z.literal('').transform(() => undefined));

export const createTransactionFormSchema = z.object({
  transactionType: z.enum(TRANSACTION_TYPES),
  propertyAddress: z.string().trim().min(1, 'A property address is required.').max(300),
  propertyCity: z.string().trim().max(100).optional(),
  propertyZip: z.string().trim().max(10).optional(),

  /** Blank means "let the server name it" — the documented default. */
  title: z
    .string()
    .trim()
    .max(200)
    .optional()
    .or(z.literal('').transform(() => undefined)),

  buyerName: z.string().trim().max(200).optional(),
  sellerName: z.string().trim().max(200).optional(),

  effectiveDate: z.string().optional(),
  closingDate: z.string().optional(),

  purchasePrice: money('Purchase price'),
  earnestMoneyAmount: money('Earnest money'),

  // Referral attribution is unrecoverable after intake (16 §2.2), which is why
  // it is on the create form at all rather than in a settings screen nobody
  // opens.
  referralSourceType: z
    .enum(REFERRAL_SOURCE_TYPES)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  referralSourceName: z.string().trim().max(200).optional(),
});

export type CreateTransactionForm = z.infer<typeof createTransactionFormSchema>;

/** A `<input type="date">` value is a bare date; the API takes an instant. */
const atAustinMidnight = (date: string | undefined): string | undefined =>
  date === undefined || date === '' ? undefined : new Date(`${date}T00:00:00-05:00`).toISOString();

/** Form shape → the API's create body. Parties are built from the two names. */
export function toCreateBody(form: CreateTransactionForm): Record<string, unknown> {
  const parties: Record<string, string>[] = [];
  if (form.buyerName) parties.push({ role: 'BUYER', type: 'PERSON', name: form.buyerName });
  if (form.sellerName) parties.push({ role: 'SELLER', type: 'PERSON', name: form.sellerName });

  return {
    transactionType: form.transactionType,
    propertyAddress: form.propertyAddress,
    ...(form.propertyCity ? { propertyCity: form.propertyCity } : {}),
    ...(form.propertyZip ? { propertyZip: form.propertyZip } : {}),
    ...(form.title ? { title: form.title } : {}),
    ...(form.purchasePrice ? { purchasePrice: form.purchasePrice } : {}),
    ...(form.earnestMoneyAmount ? { earnestMoneyAmount: form.earnestMoneyAmount } : {}),
    ...(form.referralSourceType ? { referralSourceType: form.referralSourceType } : {}),
    ...(form.referralSourceName ? { referralSourceName: form.referralSourceName } : {}),
    ...(atAustinMidnight(form.effectiveDate) === undefined
      ? {}
      : { effectiveDate: atAustinMidnight(form.effectiveDate) }),
    ...(atAustinMidnight(form.closingDate) === undefined
      ? {}
      : { closingDate: atAustinMidnight(form.closingDate) }),
    ...(parties.length > 0 ? { parties } : {}),
  };
}
