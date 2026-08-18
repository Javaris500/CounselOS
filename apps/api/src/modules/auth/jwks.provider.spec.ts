import { issuerFor, jwksUrl } from './jwks.provider';

/**
 * These two functions are the only place the Supabase auth paths are spelled,
 * and neither is exercised by the E2E — which overrides the key source and so
 * never builds the real URL. Without this spec a typo here would surface as a
 * total auth outage on first deploy and nowhere earlier.
 */
describe('jwks.provider paths', () => {
  const PROJECT = 'https://examplerefexampleref.supabase.co';

  it('builds the documented JWKS path', () => {
    expect(jwksUrl(PROJECT).href).toBe(`${PROJECT}/auth/v1/.well-known/jwks.json`);
  });

  it('builds the issuer with no trailing slash, matching Supabase’s iss claim', () => {
    // A trailing slash here would reject every token, since issuer comparison
    // is an exact string match.
    expect(issuerFor(PROJECT)).toBe(`${PROJECT}/auth/v1`);
  });

  it('ignores any path already on the configured URL', () => {
    // new URL('/auth/v1', base) is absolute-path resolution, so a stray
    // trailing path on SUPABASE_URL cannot corrupt either value.
    expect(jwksUrl(`${PROJECT}/`).href).toBe(`${PROJECT}/auth/v1/.well-known/jwks.json`);
    expect(issuerFor(`${PROJECT}/rest/v1`)).toBe(`${PROJECT}/auth/v1`);
  });
});
