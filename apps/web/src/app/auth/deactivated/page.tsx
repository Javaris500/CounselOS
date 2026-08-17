/**
 * Where USER_INACTIVE lands — deliberately NOT the login page.
 *
 * The user's credentials are fine; their account was disabled. Sending them to
 * login produces a loop: they sign in successfully, the next request 401s
 * again, and they are back here without ever learning why.
 */
export default function DeactivatedPage(): React.JSX.Element {
  return (
    <main style={{ maxWidth: '52ch', margin: '0 auto', padding: '2.5rem 1.5rem' }}>
      <h1>Your account is no longer active</h1>
      <p>
        Access to CounselOS has been turned off for this account. Your firm&apos;s administrator can
        restore it — nothing has been deleted.
      </p>
    </main>
  );
}
