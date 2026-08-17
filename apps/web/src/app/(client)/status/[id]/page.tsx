/**
 * Read-only client status page, reached by a signed HMAC URL.
 *
 * ANY ACCESS FAILURE RETURNS THE SAME GENERIC NOT-FOUND — never 401, never 403,
 * never "this matter exists but you can't see it". Revealing that a transaction
 * exists is itself a disclosure, so a bad token and a real-but-forbidden matter
 * must be indistinguishable from here.
 *
 * Server component: the token stays out of client JS entirely.
 */
export default function ClientStatusPage(): React.JSX.Element {
  return (
    <div>
      <h1>Your matter</h1>
      <p>This page is not available.</p>
    </div>
  );
}
