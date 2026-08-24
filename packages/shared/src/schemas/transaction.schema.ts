import { z } from 'zod';

import { REFERRAL_SOURCE_TYPES, TRANSACTION_TYPES } from '../index.js';

/**
 * The create-transaction schema — ONE definition, validating in the browser and
 * at the Zod pipe.
 *
 * Hoisted from the web app by Foundations, 2026-08-23, closing error-log row 2.
 * 06 Part 11 requires exactly one schema for both sides, and the transactions
 * agent could not honour that from inside its boundary: `packages/shared` is
 * Foundations' file. It duplicated the schema visibly, filed the blocker, and
 * said the local copy should be deleted rather than synced. It is.
 *
 * Two definitions is the failure this rule prevents — a form that passes in the
 * browser and 422s at the server, where the two rules drifted apart and nobody
 * noticed because each looked correct alone.
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
