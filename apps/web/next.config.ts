import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * @counselos/shared ships compiled JS, but transpiling it here keeps source
   * maps pointing at the real .ts files — so a stack trace in a shared enum
   * lands on the line you wrote, not on build output.
   */
  transpilePackages: ['@counselos/shared'],

  /**
   * Next 16 blocks requests for dev bundles whose Host is not allowlisted, so
   * a phone on your LAN cannot pull your unminified source. It treats
   * `127.0.0.1` and `localhost` as different origins, and Playwright drives
   * `127.0.0.1` — without this, every /_next/static chunk 403s, the page never
   * hydrates, and the login form falls back to a NATIVE GET submit that puts
   * the password in the query string. Six green-looking failures, one cause.
   *
   * Loopback only: this is exactly as tight as the `localhost` default, and it
   * has no effect on a production build.
   */
  allowedDevOrigins: ['127.0.0.1'],

  typescript: {
    // Never ship a build that doesn't typecheck. `pnpm typecheck` runs in CI
    // too; this is the second net.
    ignoreBuildErrors: false,
  },
  // No `eslint` key — Next 16 removed it from NextConfig. Linting runs as its
  // own turbo task (`pnpm lint`) rather than inside the build.
};

export default nextConfig;
