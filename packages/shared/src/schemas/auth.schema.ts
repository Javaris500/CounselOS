import { z } from 'zod';

/**
 * Canonical login schema — validated in the browser by react-hook-form and on
 * the server by the Zod pipe, from this one definition (06 Part 11).
 *
 * A client-side rule that disagrees with the server produces a form that looks
 * valid and then 422s on submit.
 */
export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  // Deliberately no complexity rules here. Password policy belongs to Supabase
  // Auth, which owns credentials; duplicating it would mean two sources of
  // truth that drift, and a rule here cannot strengthen what Supabase accepts.
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
