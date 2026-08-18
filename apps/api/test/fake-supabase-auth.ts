import { createServer } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';

import { SEED_IDS } from '../src/database/seed';

/**
 * A local stand-in for Supabase Auth, for the Playwright gate.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS RATHER THAN MOCKING OUR OWN API
 *
 * CLAUDE.md: mock only the true externals; never mock our own services in an
 * E2E. Supabase Auth is a true external — but it sits BEHIND our API, not in
 * front of it, so faking it means faking at the API's boundary. Point
 * SUPABASE_URL here and the real supabase-js client makes real HTTP calls that
 * happen to land on localhost. Nothing in `src/` changes, and there is no
 * test-only branch anywhere in production code.
 *
 * Exactly the pattern already used for Postgres: we do not mock the database,
 * we run a real one locally.
 *
 * It mints REAL ES256 tokens against a keypair generated at startup and serves
 * the matching JWKS, so the API's guard performs genuine signature, algorithm,
 * issuer, audience, and expiry verification. The only thing faked is who is
 * handing out the tokens.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54321);
const ISSUER = `http://127.0.0.1:${PORT}/auth/v1`;

/** Matches the seed. The password is the same for every fixture — it is fake. */
export const FIXTURE_PASSWORD = 'test-password-not-a-secret';

const ACCOUNTS: Record<string, string> = {
  'elena@rodriguezlaw.test': SEED_IDS.authIds.owner,
  'james@rodriguezlaw.test': SEED_IDS.authIds.attorney,
  'sarah@rodriguezlaw.test': SEED_IDS.authIds.paralegal,
  'former@rodriguezlaw.test': SEED_IDS.authIds.inactive,
};

/** refresh_token → email, so refresh can identify the session it belongs to. */
const sessions = new Map<string, string>();

/**
 * Access-token lifetime, settable at runtime by the suite.
 *
 * The silent-refresh clause of the Slice 0 gate needs a token that expires
 * DURING a test. The alternatives were worse: a globally short TTL would make
 * every other test race the clock, and reaching into the Zustand store to plant
 * an expired token would test the store rather than the refresh path.
 */
let accessTokenTtlSeconds = 3600;

async function main(): Promise<void> {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk: JWK = {
    ...(await exportJWK(publicKey)),
    kid: 'fake-supabase',
    alg: 'ES256',
    use: 'sig',
  };

  const issue = async (email: string): Promise<Record<string, unknown>> => {
    const sub = ACCOUNTS[email];
    if (sub === undefined) throw new Error(`unknown fixture account: ${email}`);

    const now = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({ email, role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'fake-supabase' })
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setSubject(sub)
      .setIssuedAt(now)
      // Short, like Supabase's own, so the silent-refresh path is reachable.
      .setExpirationTime(now + accessTokenTtlSeconds)
      .sign(privateKey);

    const refreshToken = `refresh-${sub}-${String(now)}`;
    sessions.set(refreshToken, email);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: accessTokenTtlSeconds,
      user: { id: sub, email, aud: 'authenticated', role: 'authenticated' },
    };
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
    const send = (status: number, body: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    // Test-only control surface. Namespaced __control so it is obviously not
    // part of the Supabase API this file otherwise imitates.
    if (url.pathname === '/__control/access-token-ttl') {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        accessTokenTtlSeconds = Number(
          (JSON.parse(raw || '{}') as { seconds?: number }).seconds ?? 3600,
        );
        send(200, { accessTokenTtlSeconds });
      });
      return;
    }

    if (url.pathname === '/auth/v1/.well-known/jwks.json') {
      send(200, { keys: [jwk] });
      return;
    }

    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      void (async () => {
        const body: Record<string, string> = raw === '' ? {} : JSON.parse(raw);

        if (url.pathname === '/auth/v1/token') {
          const grant = url.searchParams.get('grant_type');

          if (grant === 'password') {
            const email = body.email ?? '';
            if (ACCOUNTS[email] === undefined || body.password !== FIXTURE_PASSWORD) {
              // Supabase's own shape for bad credentials.
              send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
              return;
            }
            send(200, await issue(email));
            return;
          }

          if (grant === 'refresh_token') {
            const email = sessions.get(body.refresh_token ?? '');
            if (email === undefined) {
              send(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
              return;
            }
            // Rotate: the old token stops working, which is what the API's
            // cookie rotation is meant to mirror.
            sessions.delete(body.refresh_token ?? '');
            send(200, await issue(email));
            return;
          }
        }

        if (url.pathname === '/auth/v1/logout') {
          send(204, {});
          return;
        }

        send(404, { error: 'not_found', path: url.pathname });
      })();
    });
  });

  server.listen(PORT, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.warn(`fake supabase auth listening on ${String(PORT)}`);
  });
}

void main();
