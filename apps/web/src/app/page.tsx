import { redirect } from 'next/navigation';

/**
 * The root just forwards into the attorney product.
 *
 * `(attorney)` and `(client)` are route groups, so neither contributes a path
 * segment — the dashboard lives at /dashboard, not /attorney/dashboard. The
 * client portal is reached only by its signed URL and is never linked from
 * here.
 */
export default function Home(): never {
  redirect('/dashboard');
}
