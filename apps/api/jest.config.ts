import type { Config } from 'jest';

/**
 * Three projects, selected by filename, matching the tiers in 01-codebase.md.
 * Run one with: jest --selectProjects unit
 *
 *   unit         *.spec.ts (anything not matched below)  — no I/O, mocked repo
 *   integration  *.repository.spec.ts                    — real Postgres/Redis
 *   e2e          *.e2e-spec.ts                           — full HTTP stack
 *
 * The naming convention is from 02-repo-structure.md. 10-tdd-guide.md predates
 * it and still shows *.unit.spec.ts / *.integration.spec.ts — the convention
 * here is the intended one (CLAUDE.md, "When Things Conflict").
 */
const common = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
};

const config: Config = {
  // `passWithNoTests` was here while the unit and e2e tiers were empty. Removed
  // when Module 1 landed, exactly as that note said it should be: all three
  // tiers now have files, so an empty project again means a broken testMatch —
  // and jest exiting 1 is the correct way to find out.
  projects: [
    {
      ...common,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      testPathIgnorePatterns: ['\\.e2e-spec\\.ts$', '\\.repository\\.spec\\.ts$'],
    },
    {
      ...common,
      displayName: 'integration',
      testMatch: ['<rootDir>/src/**/*.repository.spec.ts'],
      // Containers are slow to boot; give the first test room.
      testTimeout: 60_000,
      globalSetup: '<rootDir>/test/setup/containers.ts',
      globalTeardown: '<rootDir>/test/setup/teardown.ts',
    },
    {
      ...common,
      displayName: 'e2e',
      testMatch: ['<rootDir>/src/**/*.e2e-spec.ts'],
      testTimeout: 60_000,
      globalSetup: '<rootDir>/test/setup/containers.ts',
      globalTeardown: '<rootDir>/test/setup/teardown.ts',
    },
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts', '!src/worker.ts'],
  coverageThreshold: {
    global: { branches: 80, functions: 85, lines: 85, statements: 85 },
  },
};

export default config;
