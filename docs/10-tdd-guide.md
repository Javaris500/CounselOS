# CounselOS — Backend Testing Standards & TDD Guide
### For Engineers. No Fluff.

---

## The Rule

If it does not have a test, it does not exist.

Not "it works on my machine." Not "I tested it manually in Postman." Not "it looks right." If there is no automated test proving the behavior, the behavior is unverified and the feature is incomplete. This applies to every engineer on this project including the person who wrote this document.

This is not a suggestion. This is the engineering standard for CounselOS. We are building software that law firms use to manage real cases with real deadlines and real money on the line. Vibe-coded backends kill law firms. Untested billing logic loses clients' money. Unverified RLS bugs leak privileged legal data. We do not ship untested code.

---

## What TDD Actually Means Here

TDD does not mean writing tests after you build a feature and calling it done. It means writing the test first, watching it fail, writing the minimum code to make it pass, then refactoring. The cycle is Red → Green → Refactor. That cycle is enforced.

**Red** — Write a test that describes the behavior you want. Run it. It fails because the code does not exist yet. Good. That failing test is a specification.

**Green** — Write the minimum production code to make that test pass. Not the cleanest code. Not the most elegant code. The minimum code that turns red to green.

**Refactor** — Now clean it up. Extract logic. Remove duplication. Improve naming. The tests are your safety net. Refactor freely because if you break behavior, a test will catch it immediately.

If you find yourself writing code before you write a test, stop. Write the test first. If you cannot write a test for the thing you are building, that is a signal the design is wrong — too coupled, too side-effectful, too hard to isolate. Fix the design, then write the test.

---

## Testing Stack

```
Jest                  — test runner, assertion library, mocking
supertest             — HTTP integration testing against NestJS app
@nestjs/testing       — NestJS test module builder
testcontainers        — real Postgres + Redis in Docker for integration tests
Prisma + test DB      — isolated database per test suite
faker (via @faker-js) — deterministic test data generation
nock                  — HTTP request interceptor for external API calls
```

Installation:

```bash
npm install --save-dev \
  jest \
  @types/jest \
  ts-jest \
  supertest \
  @types/supertest \
  @nestjs/testing \
  testcontainers \
  @faker-js/faker \
  nock
```

Jest config in `jest.config.ts`:

```typescript
export default {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    // Scoring functions must be near-perfect — they drive billing
    './src/case-dna/scoring/**': {
      branches: 95,
      functions: 100,
      lines: 95,
      statements: 95,
    },
  },
  projects: [
    {
      displayName: 'unit',
      testMatch: ['**/*.unit.spec.ts'],
      testEnvironment: 'node',
    },
    {
      displayName: 'integration',
      testMatch: ['**/*.integration.spec.ts'],
      testEnvironment: 'node',
      globalSetup: '<rootDir>/../test/setup/global-setup.ts',
      globalTeardown: '<rootDir>/../test/setup/global-teardown.ts',
    },
    {
      displayName: 'e2e',
      testMatch: ['**/*.e2e.spec.ts'],
      testEnvironment: 'node',
      globalSetup: '<rootDir>/../test/setup/global-setup.ts',
      globalTeardown: '<rootDir>/../test/setup/global-teardown.ts',
    },
  ],
}
```

Scripts in `package.json`:

```json
{
  "scripts": {
    "test": "jest --selectProjects unit",
    "test:integration": "jest --selectProjects integration",
    "test:e2e": "jest --selectProjects e2e",
    "test:all": "jest",
    "test:watch": "jest --watch --selectProjects unit",
    "test:cov": "jest --coverage",
    "test:ci": "jest --ci --coverage --forceExit"
  }
}
```

---

## Three Kinds of Tests. Know the Difference.

### Unit Tests — Fast, Isolated, No I/O

A unit test tests one function or one class method in complete isolation. No database. No network. No file system. No external services. Every dependency is mocked or stubbed.

Unit tests run in milliseconds. You should be able to run your entire unit test suite in under 10 seconds. If a unit test is slow, it is not a unit test — it is doing I/O somewhere.

**What gets unit tested:**
- Scoring functions (liability score, injury severity score, settlement pressure index, trial risk score, platform fee calculator)
- Extraction parsers (deadline extractor, document classifier, medical record parser)
- Business rules (status transition validation, conflict check logic, invoice total calculation)
- Utility functions (date calculations, statute of limitations, chunk overlap logic)
- Guard and interceptor logic in isolation

**What does NOT get unit tested:**
- Database queries (those are integration tests)
- HTTP endpoints (those are integration or e2e tests)
- Queue processors (those are integration tests)
- Anything that requires a real service

File naming: `*.unit.spec.ts`

### Integration Tests — Real Database, Real Queue, Controlled Network

An integration test tests how multiple pieces of your system work together against real infrastructure. Real Postgres. Real Redis. No mocks for your own code — only mocks for third-party APIs (Anthropic, Stripe, Voyage AI, CourtListener) because you do not want to hit those in CI.

Integration tests use testcontainers to spin up a fresh Postgres and Redis instance for each test suite. Every test suite runs against a clean, migrated database with seed data specific to that suite. No shared state between test suites.

**What gets integration tested:**
- Repository methods (does the query return what we expect from a real database?)
- Service methods that coordinate multiple repositories
- Queue processors (enqueue a job, run the processor, assert the database state changed correctly)
- Auth and RLS (does a firm A token return firm B data? It must not.)
- Document pipeline stages end-to-end with fixture files

File naming: `*.integration.spec.ts`

### E2E Tests — Full HTTP Stack, Real Auth, Real Everything

An E2E test hits the actual NestJS HTTP server with a real HTTP request and asserts the full response shape, status code, and database side effects. It goes through guards, pipes, interceptors, services, repositories — the full stack.

E2E tests use a real JWT issued by the test auth helper. They hit real endpoints. They check both the response body and the resulting database state.

**What gets E2E tested:**
- Complete user flows (create case → upload document → get document list → delete document)
- Auth flows (valid token, expired token, wrong firm token, missing token)
- Permission flows (paralegal cannot approve a draft, client cannot see another client's case)
- Error responses (what does a 404 look like, what does a validation error look like)
- Webhook handlers (Stripe webhook with valid signature, with invalid signature)

File naming: `*.e2e.spec.ts`

---

## The Fourth Tier — Browser E2E (Playwright)

The three tiers above are backend tiers. There is a fourth that gates a **slice**, not a module.

| Tier | Tool | Location | Proves | Gates |
|---|---|---|---|---|
| Unit | Vitest/Jest | `apps/api/**/__tests__` | Deterministic logic, mocked repo | — |
| Integration | + testcontainers | `apps/api/**/__tests__` | DB + queue paths | — |
| **API E2E** | supertest | `apps/api/**/*.e2e-spec.ts` | Backend module through the real request lifecycle | A **module** |
| **Browser E2E** | **Playwright** | `apps/web/e2e/*.spec.ts` | The feature works for a human, front to back | A **slice** |

API E2E catches a broken status transition. Browser E2E catches a button that never fires it. Both required.

### Playwright rules

- **`data-testid` is the selector contract.** Convention `{domain}-{element}-{action?}` kebab-case (`deadline-confirm-btn`). Added in the **same commit as the component**, never retrofitted. Never select on text content or CSS classes — they shatter on every design change.
- **Import seeded IDs** from `apps/api/src/database/seed/ids.ts`. Never hardcode a UUID, never click through the UI to find a fixture.
- **Never log in inside a test.** Auth comes from `storageState` per role, set up once. The login flow itself is tested explicitly, once, in slice 0.
- **AI is mocked in CI** (`E2E_MOCK_AI=true`). Never assert on live model output — it flakes and costs money. One manually-run live suite before releases.
- **Pin the clock** with `page.clock.setFixedTime()` in any test asserting on deadline urgency. Seed dates are relative to `SEED_TODAY`, not `new Date()`.
- **Reset between runs** — `pnpm --filter api db:reset` before the suite in CI.

Full fixture and seed detail is in `11-test-data.md` Part 6.

---

## Test Infrastructure Setup

### Global Test Setup

> **STALE — read the code, not this block.** The real file is
> `apps/api/test/setup/containers.ts`, with `apps/api/test/setup/teardown.ts`
> alongside it, both wired in `apps/api/jest.config.ts`. The example below
> predates the Drizzle decision and still runs `prisma migrate deploy`; the
> current version uses `@testcontainers/postgresql`, creates the `vector` /
> `pgcrypto` / `pg_trgm` extensions, and migrates with
> `drizzle-orm/postgres-js/migrator`. Kept here only until this doc is rewritten.

`test/setup/global-setup.ts`:

```typescript
import { GenericContainer, StartedTestContainer } from 'testcontainers'
import { execSync } from 'child_process'

let postgresContainer: StartedTestContainer
let redisContainer: StartedTestContainer

export default async function globalSetup() {
  // Start Postgres with pgvector
  postgresContainer = await new GenericContainer('pgvector/pgvector:pg16')
    .withEnvironment({
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'counselos_test',
    })
    .withExposedPorts(5432)
    .start()

  // Start Redis
  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start()

  const dbUrl = `postgresql://test:test@${postgresContainer.getHost()}:${postgresContainer.getMappedPort(5432)}/counselos_test`
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`

  process.env.DATABASE_URL = dbUrl
  process.env.REDIS_URL = redisUrl
  process.env.NODE_ENV = 'test'

  // Run migrations
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: dbUrl },
  })

  // Store references for teardown
  global.__POSTGRES_CONTAINER__ = postgresContainer
  global.__REDIS_CONTAINER__ = redisContainer
}
```

`test/setup/global-teardown.ts`:

```typescript
export default async function globalTeardown() {
  await global.__POSTGRES_CONTAINER__?.stop()
  await global.__REDIS_CONTAINER__?.stop()
}
```

### Test Database Helper

`test/helpers/db.helper.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient

export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    })
  }
  return prisma
}

export async function cleanDatabase(): Promise<void> {
  const db = getTestPrisma()
  // Order matters — delete children before parents
  await db.$transaction([
    db.documentChunk.deleteMany(),
    db.document.deleteMany(),
    db.chatMessage.deleteMany(),
    db.chatSession.deleteMany(),
    db.deadline.deleteMany(),
    db.caseActivity.deleteMany(),
    db.caseDNA.deleteMany(),
    db.arbitragePrediction.deleteMany(),
    db.caseOutcome.deleteMany(),
    db.timeEntry.deleteMany(),
    db.invoiceLineItem.deleteMany(),
    db.invoice.deleteMany(),
    db.draft.deleteMany(),
    db.party.deleteMany(),
    db.leadConversation.deleteMany(),
    db.lead.deleteMany(),
    db.playbookStep.deleteMany(),
    db.playbook.deleteMany(),
    db.case.deleteMany(),
    db.user.deleteMany(),
    db.firm.deleteMany(),
  ])
}

export async function disconnectTestPrisma(): Promise<void> {
  await prisma?.$disconnect()
}
```

### Test Factory — Build Realistic Test Data

`test/factories/index.ts`:

```typescript
import { faker } from '@faker-js/faker'
import { PrismaClient, FirmPlan, UserRole, PracticeArea, CaseStatus } from '@prisma/client'

export class TestFactory {
  constructor(private readonly db: PrismaClient) {}

  async createFirm(overrides: Partial<FirmInput> = {}) {
    return this.db.firm.create({
      data: {
        name: overrides.name ?? 'Rodriguez & Associates',
        slug: overrides.slug ?? faker.helpers.slugify('rodriguez-associates'),
        plan: overrides.plan ?? FirmPlan.GROWTH,
        state: overrides.state ?? 'TX',
        city: overrides.city ?? 'Austin',
        timezone: overrides.timezone ?? 'America/Chicago',
        settings: {
          defaultBillingRate: 350,
          autoSuggestTimeEntries: true,
          intakeEnabled: true,
          clientPortalEnabled: true,
          arbitrageEnabled: true,
          alertEmailEnabled: true,
          alertSmsEnabled: false,
        },
        ...overrides,
      },
    })
  }

  async createAttorney(firmId: string, overrides = {}) {
    return this.db.user.create({
      data: {
        firmId,
        email: faker.internet.email(),
        fullName: faker.person.fullName(),
        role: UserRole.ATTORNEY,
        barNumber: `TX-${faker.string.numeric(6)}`,
        billingRate: 350,
        isActive: true,
        ...overrides,
      },
    })
  }

  async createCase(firmId: string, attorneyId: string, overrides = {}) {
    return this.db.case.create({
      data: {
        firmId,
        assignedAttorneyId: attorneyId,
        caseNumber: `PI-2025-${faker.string.numeric(4)}`,
        title: 'Rodriguez v. State Farm',
        practiceArea: PracticeArea.PERSONAL_INJURY,
        status: CaseStatus.ACTIVE,
        incidentDate: new Date('2024-10-14'),
        retainerDate: new Date('2024-10-20'),
        statuteOfLimitationsDate: new Date('2026-10-14'),
        tags: [],
        isArchived: false,
        ...overrides,
      },
    })
  }

  // Creates a complete firm with attorneys and one test case
  async createFirmWithCase() {
    const firm = await this.createFirm()
    const owner = await this.createAttorney(firm.id, { role: UserRole.OWNER })
    const attorney = await this.createAttorney(firm.id)
    const testCase = await this.createCase(firm.id, attorney.id)
    return { firm, owner, attorney, testCase }
  }

  // Creates two completely separate firms — used for RLS tests
  async createTwoIsolatedFirms() {
    const firmA = await this.createFirm({ name: 'Rodriguez & Associates', slug: 'rodriguez' })
    const firmB = await this.createFirm({ name: 'Blackwell Family Law', slug: 'blackwell' })
    const attorneyA = await this.createAttorney(firmA.id)
    const attorneyB = await this.createAttorney(firmB.id)
    const caseA = await this.createCase(firmA.id, attorneyA.id)
    const caseB = await this.createCase(firmB.id, attorneyB.id)
    return { firmA, firmB, attorneyA, attorneyB, caseA, caseB }
  }
}
```

> **INVALID — read `apps/api/test/helpers/auth.helper.ts` instead.** This helper
> signs **HS256** with a shared `JWT_SECRET`. Supabase signs access tokens with
> **ES256**, verified against a public key from its JWKS endpoint, so there is
> no secret to sign with — and `JWT_SECRET` has been deleted, which means this
> code will not even compile.
>
> The working replacement is `createTestKeyring()`: it generates an ES256
> keypair in the test process and exposes a `createLocalJWKSet` that a suite
> swaps in for the `JWKS` provider. Because `createLocalJWKSet` and the
> production `createRemoteJWKSet` return the same type, `jwtVerify` runs
> identically in tests and production — signature, algorithm allowlist, issuer,
> audience, and expiry are all really checked. Sign with `expiresIn: -60` for
> the expired case; do not pin the app clock, which would desync it from
> Postgres `now()` and Redis TTLs.

### Auth Helper — Issue Real JWTs for Tests

`test/helpers/auth.helper.ts`:

```typescript
import * as jwt from 'jsonwebtoken'

interface TestUserClaims {
  sub: string        // userId
  firmId: string
  role: string
  email: string
}

export function issueTestJwt(claims: TestUserClaims): string {
  return jwt.sign(claims, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: 'counselos-test',
  })
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

// Convenience: issue a token for a given user from the database
export function tokenForUser(user: { id: string; firmId: string; role: string; email: string }): string {
  return issueTestJwt({
    sub: user.id,
    firmId: user.firmId,
    role: user.role,
    email: user.email,
  })
}
```

---

## How to Write Each Test Type

### Writing a Unit Test

The scoring functions are the most important unit tests in the entire codebase. These drive the arbitrage engine and the billing model. They must be tested exhaustively.

Example — `liability-score.unit.spec.ts`:

```typescript
import { calculateLiabilityScore } from '../scoring/liability-score'

describe('calculateLiabilityScore', () => {
  // Describe the happy path first
  describe('clear liability — no complicating factors', () => {
    it('returns a high score when liability is clear and evidence is strong', () => {
      const result = calculateLiabilityScore({
        evidenceStrength: 'STRONG',
        contributoryNegligence: 0,
        liabilityFlags: [],
        hasPoliceReport: true,
        hasWitnesses: true,
      })
      expect(result).toBeGreaterThanOrEqual(80)
      expect(result).toBeLessThanOrEqual(100)
    })
  })

  // Test each flag independently — know its exact effect
  describe('gap in treatment flag', () => {
    it('reduces liability score by documented amount when gap exists', () => {
      const withoutGap = calculateLiabilityScore({
        evidenceStrength: 'STRONG',
        contributoryNegligence: 0,
        liabilityFlags: [],
        hasPoliceReport: true,
        hasWitnesses: true,
      })

      const withGap = calculateLiabilityScore({
        evidenceStrength: 'STRONG',
        contributoryNegligence: 0,
        liabilityFlags: ['gap_in_treatment'],
        hasPoliceReport: true,
        hasWitnesses: true,
      })

      // Gap in treatment must reduce the score — test the direction and minimum effect
      expect(withGap).toBeLessThan(withoutGap)
      expect(withoutGap - withGap).toBeGreaterThanOrEqual(10)
    })
  })

  describe('Texas 51% bar rule', () => {
    it('returns 0 when contributory negligence is exactly 50 percent', () => {
      const result = calculateLiabilityScore({
        evidenceStrength: 'MODERATE',
        contributoryNegligence: 50,
        liabilityFlags: [],
        hasPoliceReport: true,
        hasWitnesses: false,
      })
      // At 50% contributory negligence under Texas law, recovery is 0
      expect(result).toBe(0)
    })

    it('returns 0 when contributory negligence exceeds 50 percent', () => {
      const result = calculateLiabilityScore({
        evidenceStrength: 'MODERATE',
        contributoryNegligence: 75,
        liabilityFlags: [],
        hasPoliceReport: false,
        hasWitnesses: false,
      })
      expect(result).toBe(0)
    })

    it('proportionally reduces score when contributory negligence is below 50 percent', () => {
      const at0 = calculateLiabilityScore({ evidenceStrength: 'STRONG', contributoryNegligence: 0, liabilityFlags: [], hasPoliceReport: true, hasWitnesses: true })
      const at25 = calculateLiabilityScore({ evidenceStrength: 'STRONG', contributoryNegligence: 25, liabilityFlags: [], hasPoliceReport: true, hasWitnesses: true })
      const at49 = calculateLiabilityScore({ evidenceStrength: 'STRONG', contributoryNegligence: 49, liabilityFlags: [], hasPoliceReport: true, hasWitnesses: true })

      expect(at25).toBeLessThan(at0)
      expect(at49).toBeLessThan(at25)
    })
  })

  describe('disputed liability', () => {
    it('significantly reduces score when liability is disputed with no police report', () => {
      const result = calculateLiabilityScore({
        evidenceStrength: 'WEAK',
        contributoryNegligence: 25,
        liabilityFlags: ['disputed_liability', 'no_police_report'],
        hasPoliceReport: false,
        hasWitnesses: false,
      })
      // This is the Williams v. Allstate scenario — should score low
      expect(result).toBeLessThanOrEqual(40)
    })
  })

  describe('input validation', () => {
    it('throws when contributory negligence is out of range', () => {
      expect(() => calculateLiabilityScore({
        evidenceStrength: 'STRONG',
        contributoryNegligence: 101, // invalid
        liabilityFlags: [],
        hasPoliceReport: true,
        hasWitnesses: true,
      })).toThrow('contributoryNegligence must be between 0 and 100')
    })
  })
})
```

Notice what this test does NOT do:
- It does not test implementation details — only observable outputs
- It does not use `toBe(73)` — magic numbers are fragile, test ranges and relationships
- It does not mock anything — a scoring function has no dependencies to mock
- It does not test private methods — only the public API of the function

### Writing an Integration Test

Integration tests test services and repositories against a real database. Use the factory to set up state. Assert database changes, not just return values.

Example — `cases.service.integration.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from '../../database/prisma.service'
import { CasesService } from '../cases.service'
import { TestFactory } from '../../../test/factories'
import { cleanDatabase, disconnectTestPrisma } from '../../../test/helpers/db.helper'
import { CaseStatus } from '@prisma/client'
import { ForbiddenException, NotFoundException } from '@nestjs/common'

describe('CasesService (integration)', () => {
  let module: TestingModule
  let casesService: CasesService
  let factory: TestFactory
  let prisma: PrismaService

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [CasesService, PrismaService],
    }).compile()

    casesService = module.get(CasesService)
    prisma = module.get(PrismaService)
    factory = new TestFactory(prisma)
  })

  beforeEach(async () => {
    await cleanDatabase()
  })

  afterAll(async () => {
    await module.close()
    await disconnectTestPrisma()
  })

  describe('findAll', () => {
    it('returns only cases belonging to the requesting firm', async () => {
      const { firmA, attorneyA, caseA, firmB, caseB } =
        await factory.createTwoIsolatedFirms()

      const result = await casesService.findAll({
        firmId: firmA.id,
        requestingUserId: attorneyA.id,
      })

      const returnedIds = result.data.map((c) => c.id)
      expect(returnedIds).toContain(caseA.id)
      expect(returnedIds).not.toContain(caseB.id)
    })

    it('filters by status when status param is provided', async () => {
      const { firm, attorney } = await factory.createFirmWithCase()

      await factory.createCase(firm.id, attorney.id, { status: CaseStatus.ACTIVE })
      await factory.createCase(firm.id, attorney.id, { status: CaseStatus.CLOSED_SETTLED })
      await factory.createCase(firm.id, attorney.id, { status: CaseStatus.DISCOVERY })

      const result = await casesService.findAll({
        firmId: firm.id,
        requestingUserId: attorney.id,
        status: CaseStatus.ACTIVE,
      })

      expect(result.data.every((c) => c.status === CaseStatus.ACTIVE)).toBe(true)
    })
  })

  describe('updateStatus', () => {
    it('records a status change in the case activity log', async () => {
      const { firm, attorney, testCase } = await factory.createFirmWithCase()

      await casesService.updateStatus({
        caseId: testCase.id,
        firmId: firm.id,
        requestingUserId: attorney.id,
        newStatus: CaseStatus.DISCOVERY,
      })

      // Assert the side effect — activity was logged
      const activity = await prisma.caseActivity.findFirst({
        where: { caseId: testCase.id },
        orderBy: { createdAt: 'desc' },
      })

      expect(activity).not.toBeNull()
      expect(activity!.eventType).toBe('case.status_changed')
      expect(activity!.metadata).toMatchObject({
        from: CaseStatus.ACTIVE,
        to: CaseStatus.DISCOVERY,
      })
    })

    it('throws NotFoundException when case does not exist', async () => {
      const { firm, attorney } = await factory.createFirmWithCase()

      await expect(
        casesService.updateStatus({
          caseId: 'non-existent-id',
          firmId: firm.id,
          requestingUserId: attorney.id,
          newStatus: CaseStatus.DISCOVERY,
        })
      ).rejects.toThrow(NotFoundException)
    })

    it('throws ForbiddenException when case belongs to a different firm', async () => {
      const { firmA, attorneyA, firmB, caseB } =
        await factory.createTwoIsolatedFirms()

      // Attorney from firm A tries to update a case from firm B
      await expect(
        casesService.updateStatus({
          caseId: caseB.id,
          firmId: firmA.id,      // firm A token
          requestingUserId: attorneyA.id,
          newStatus: CaseStatus.DISCOVERY,
        })
      ).rejects.toThrow(ForbiddenException)
    })
  })
})
```

Notice the pattern:
- `beforeEach(cleanDatabase)` — every test starts with a clean slate
- Factory creates the exact state needed — no copy-paste setup
- Tests assert database side effects, not just return values
- Error cases are always tested alongside happy paths
- The two-firm test is not optional — it is the most important test in the codebase

### Writing an E2E Test

E2E tests hit the real HTTP server. They test the full stack including guards, pipes, and middleware.

Example — `cases.e2e.spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { createTestApp } from '../../../test/helpers/app.helper'
import { TestFactory } from '../../../test/factories'
import { getTestPrisma, cleanDatabase, disconnectTestPrisma } from '../../../test/helpers/db.helper'
import { tokenForUser } from '../../../test/helpers/auth.helper'

describe('Cases API (e2e)', () => {
  let app: INestApplication
  let factory: TestFactory

  beforeAll(async () => {
    app = await createTestApp()
    factory = new TestFactory(getTestPrisma())
  })

  beforeEach(async () => {
    await cleanDatabase()
  })

  afterAll(async () => {
    await app.close()
    await disconnectTestPrisma()
  })

  describe('GET /cases', () => {
    it('returns 401 when no token is provided', async () => {
      await request(app.getHttpServer())
        .get('/cases')
        .expect(401)
    })

    it('returns 401 when token is expired', async () => {
      const { firm, attorney } = await factory.createFirmWithCase()
      const expiredToken = tokenForUser({ ...attorney, firmId: firm.id, expiresIn: '-1s' })

      await request(app.getHttpServer())
        .get('/cases')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401)
    })

    it('returns paginated cases for the authenticated firm', async () => {
      const { firm, attorney } = await factory.createFirmWithCase()
      const token = tokenForUser({ ...attorney, firmId: firm.id })

      const response = await request(app.getHttpServer())
        .get('/cases')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(Array.isArray(response.body.data)).toBe(true)
      expect(response.body.meta).toMatchObject({
        page: expect.any(Number),
        limit: expect.any(Number),
        total: expect.any(Number),
        hasMore: expect.any(Boolean),
      })
    })

    it('never returns cases from another firm in the response', async () => {
      const { firmA, attorneyA, caseA, caseB } =
        await factory.createTwoIsolatedFirms()
      const token = tokenForUser({ ...attorneyA, firmId: firmA.id })

      const response = await request(app.getHttpServer())
        .get('/cases')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      const returnedIds = response.body.data.map((c: any) => c.id)
      expect(returnedIds).toContain(caseA.id)
      expect(returnedIds).not.toContain(caseB.id)
    })
  })

  describe('POST /cases', () => {
    it('returns 422 when required fields are missing', async () => {
      const { firm, attorney } = await factory.createFirmWithCase()
      const token = tokenForUser({ ...attorney, firmId: firm.id })

      const response = await request(app.getHttpServer())
        .post('/cases')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: '' }) // missing practiceArea, assignedAttorneyId
        .expect(422)

      expect(response.body.success).toBe(false)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
      expect(response.body.error.details).toBeDefined()
    })

    it('creates a case and logs a creation activity', async () => {
      const { firm, attorney } = await factory.createFirmWithCase()
      const token = tokenForUser({ ...attorney, firmId: firm.id })

      const response = await request(app.getHttpServer())
        .post('/cases')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Martinez v. Progressive',
          practiceArea: 'PERSONAL_INJURY',
          assignedAttorneyId: attorney.id,
          incidentDate: '2025-01-15',
        })
        .expect(201)

      expect(response.body.success).toBe(true)
      expect(response.body.data.id).toBeDefined()
      expect(response.body.data.firmId).toBe(firm.id)

      // Assert the side effect
      const activity = await getTestPrisma().caseActivity.findFirst({
        where: { caseId: response.body.data.id },
      })
      expect(activity?.eventType).toBe('case.created')
    })

    it('returns 403 when paralegal tries to create a case', async () => {
      const { firm } = await factory.createFirmWithCase()
      const paralegal = await factory.createAttorney(firm.id, { role: 'PARALEGAL' })
      const token = tokenForUser({ ...paralegal, firmId: firm.id })

      await request(app.getHttpServer())
        .post('/cases')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Test Case',
          practiceArea: 'PERSONAL_INJURY',
          assignedAttorneyId: paralegal.id,
        })
        .expect(403)
    })
  })
})
```

---

## Non-Negotiable Tests

These tests must exist before the corresponding feature ships. No exceptions. No deferral. If these are not passing, the feature is not done.

### The Two-Firm Test

Every resource endpoint must have this test. It is the most important test in the codebase.

```typescript
it('cannot access resources belonging to another firm', async () => {
  // Setup two isolated firms
  // Authenticate as firm A
  // Attempt to GET/PATCH/DELETE a resource that belongs to firm B
  // Expect 403 or 404 — never 200
})
```

This test must exist for: cases, documents, deadlines, chats, DNA, predictions, leads, drafts, time entries, invoices.

### The Role Tests

Every sensitive operation must have these:

```typescript
it('returns 403 when CLIENT role attempts to access internal endpoint')
it('returns 403 when PARALEGAL role attempts to perform attorney-only action')
it('returns 403 when ATTORNEY role attempts to perform owner-only action')
```

### The Validation Tests

Every POST and PATCH endpoint must have:

```typescript
it('returns 422 with structured error when required field is missing')
it('returns 422 with field-level error details when field fails validation')
it('returns 422 when numeric field receives a string')
it('does not create the resource when validation fails')
```

### The Scoring Function Tests

Each scoring function must have:

```typescript
it('returns a value in the expected range [min, max]')
it('handles the maximum input values without overflowing')
it('handles the minimum input values without going negative')
it('each flag affects the output in the documented direction')
it('matches the expected output for all 5 named test cases')
it('throws a descriptive error on invalid input')
```

### The Platform Fee Tests

The fee calculator is billing logic. It must be tested down to the cent.

```typescript
it('returns 0 fee when delta is 0')
it('returns 0 fee when actual settlement is below predicted mid')
it('applies 2% rate on firm benefit below $10k')
it('applies 1.5% rate on firm benefit between $10k and $50k')
it('applies 1% rate on firm benefit above $50k')
it('rounds to nearest cent')
it('stores correct fee in CaseOutcome record')
it('generates correct Stripe invoice amount')
```

### The Document Pipeline Tests

Test each stage with fixture files from your test data library:

```typescript
it('transitions document from PENDING to PROCESSING when job is picked up')
it('converts DOCX fixture to PDF without error')
it('extracts text from the Austin PD police report fixture')
it('classifies a police report fixture as POLICE_REPORT type')
it('chunks extracted text into overlapping segments of correct size')
it('stores embeddings in pgvector without error')
it('transitions document to READY when all stages complete')
it('transitions document to FAILED and stores error message when LibreOffice fails')
it('emits a WebSocket event when document status changes')
it('does not delete document from R2 when soft-deleted')
```

### The RLS Tests

Test directly against the database, bypassing the application layer:

```typescript
it('Postgres RLS prevents SELECT on another firm case when using firm A role')
it('Postgres RLS prevents INSERT with a different firm_id than the session role')
it('Postgres RLS prevents UPDATE on another firm document')
it('Postgres RLS prevents DELETE on another firm lead')
```

---

## What We Do Not Do

### No Magic Numbers in Assertions

```typescript
// Wrong — where did 73 come from? What breaks it?
expect(score).toBe(73)

// Right — test the relationship and boundaries
expect(score).toBeGreaterThan(70)
expect(score).toBeLessThanOrEqual(80)
```

### No Testing Implementation Details

```typescript
// Wrong — tests that the service called a specific internal method
expect(caseDnaService.extractLiabilityFlags).toHaveBeenCalled()

// Right — tests the observable output and side effects
expect(result.liabilityFlags).toContain('gap_in_treatment')
expect(dnaRecord.version).toBe(2) // new version was created
```

### No Shared Mutable State Between Tests

```typescript
// Wrong — test B depends on test A having run first
let createdCaseId: string

it('test A creates a case', async () => {
  const result = await casesService.create(...)
  createdCaseId = result.id // pollutes shared state
})

it('test B uses the created case', async () => {
  await casesService.findOne(createdCaseId) // depends on test A
})

// Right — each test is completely self-contained
it('test B uses a freshly created case', async () => {
  const { testCase } = await factory.createFirmWithCase()
  await casesService.findOne(testCase.id)
})
```

### No Skipped Tests

```typescript
// Wrong — skipped tests are lies about test coverage
it.skip('the platform fee is calculated correctly', async () => {})
xit('the RLS blocks cross-firm access', async () => {})

// Right — either fix the test or delete it
// A skipped test gives false confidence that a scenario is covered
```

### No Console.log in Tests

If you need to debug a test, use a debugger or Jest's `--verbose` flag. Remove all `console.log` statements before committing. Log statements in tests are noise that obscures real failures.

### No AI-Generated Tests Without Review

AI tools will generate tests that pass trivially, test nothing real, or assert against implementation details. Every test added to this codebase must be read and understood by the engineer who commits it. If you cannot explain what a test is proving and why it matters, it should not be committed.

---

## Code Review Checklist for Tests

When reviewing a PR, check:

- [ ] New features have unit tests for all business logic
- [ ] New endpoints have E2E tests for happy path, validation, auth, and permission
- [ ] New service methods have integration tests that verify database side effects
- [ ] The two-firm test exists for any endpoint that returns data
- [ ] Role tests exist for any endpoint with permission requirements
- [ ] No magic numbers in assertions
- [ ] No shared state between tests
- [ ] No skipped tests
- [ ] No console.log statements
- [ ] Test names describe behavior, not implementation (`'returns 403 when CLIENT accesses internal endpoint'` not `'test auth'`)
- [ ] Coverage thresholds are still passing after the PR
- [ ] Factory is used for test data — no hardcoded IDs or manual Prisma creates in test bodies

---

## CI Pipeline Test Gates

Tests run in this order on every pull request. All must pass before merge is allowed.

```
1. Type check        — tsc --noEmit, must pass with zero errors
2. Lint              — ESLint, must pass with zero warnings or errors
3. Unit tests        — jest --selectProjects unit, must pass 100%
4. Coverage check    — coverage thresholds from jest.config.ts must be met
5. Integration tests — jest --selectProjects integration, must pass 100%
6. E2E tests         — jest --selectProjects e2e, must pass 100%
```

If any step fails, the PR cannot be merged. No exceptions. No "it fails in CI but works locally." Fix it.

Coverage threshold failures are treated the same as test failures. If you add a new service and the branch coverage drops below 80%, the CI fails. Write the tests.

---

## Test File Location Convention

Tests live next to the code they test:

```
src/
  cases/
    cases.controller.ts
    cases.controller.e2e.spec.ts     ← E2E tests for the controller
    cases.service.ts
    cases.service.integration.spec.ts ← Integration tests for the service
  case-dna/
    scoring/
      liability-score.ts
      liability-score.unit.spec.ts    ← Unit tests for this function
      damages-score.ts
      damages-score.unit.spec.ts
      platform-fee.ts
      platform-fee.unit.spec.ts
  documents/
    pipeline/
      document-classifier.ts
      document-classifier.unit.spec.ts
      chunk-extractor.ts
      chunk-extractor.unit.spec.ts
    documents.service.integration.spec.ts
    documents.controller.e2e.spec.ts
```

Tests that test cross-module flows live in `test/`:

```
test/
  factories/
    index.ts
  helpers/
    auth.helper.ts
    db.helper.ts
    app.helper.ts
  setup/
    global-setup.ts
    global-teardown.ts
  flows/
    intake-to-case.e2e.spec.ts       ← cross-module flow tests
    document-to-dna.e2e.spec.ts
    outcome-to-feedback-loop.e2e.spec.ts
```

---

## Running Tests Day-to-Day

```bash
# During development — run unit tests in watch mode
npm run test:watch

# Before pushing — run unit and integration
npm test && npm run test:integration

# Before opening a PR — run everything
npm run test:all

# Check coverage
npm run test:cov

# Run tests for a specific module
npx jest cases --watch

# Run a specific test file
npx jest src/cases/cases.service.integration.spec.ts

# Run tests matching a name pattern
npx jest -t "returns 403 when CLIENT"
```

---

*This document is the engineering contract for CounselOS backend quality. It does not change based on timeline pressure. It does not have exceptions for "quick features." The test suite is the product. Ship the tests, ship the product.*
