import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * @counselos/shared ships compiled JS, but transpiling it here keeps source
   * maps pointing at the real .ts files — so a stack trace in a shared enum
   * lands on the line you wrote, not on build output.
   */
  transpilePackages: ['@counselos/shared'],

  typescript: {
    // Never ship a build that doesn't typecheck. `pnpm typecheck` runs in CI
    // too; this is the second net.
    ignoreBuildErrors: false,
  },
  // No `eslint` key — Next 16 removed it from NextConfig. Linting runs as its
  // own turbo task (`pnpm lint`) rather than inside the build.
};

export default nextConfig;
