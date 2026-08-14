# CounselOS — NestJS Conventions

### The framework decisions, made once, so nobody re-makes them per module

> NestJS offers three or four legitimate ways to do almost everything. This document picks one of each for CounselOS and says why. Everything here is a **rule**, not a suggestion — the alternatives aren't wrong in general, they're wrong *for this codebase*, usually because of the two-process model or the service-not-repository boundary.
>
> Read this before writing your first provider. It's the shortest doc in the set and it prevents the most expensive class of rework.
>
> Related: `02-repo-structure.md` (where files go) · `01-codebase.md` (the build process) · `14-module-notes.md` (what these terms mean).

---

## 1. Module encapsulation *is* the boundary enforcement

The rule "modules import services, never repositories" is not a review convention. It is enforced by the framework, and review is the backstop — not the other way around.

A module's `exports` array is an access-control list. Export the service. Never export the repository.

```ts
@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository],
  exports: [TransactionsService],          // ← repository deliberately absent
})
export class TransactionsModule {}
```

If `DocumentsService` tries to inject `TransactionsRepository`, NestJS throws at bootstrap:

```
Nest can't resolve dependencies of the DocumentsService (?).
Please make sure that the argument TransactionsRepository at index [0]
is available in the DocumentsModule context.
```

That converts the most expensive-to-retrofit rule in the project into a startup crash on the developer's machine, before CI, before review.

- [ ] **Never put a repository in an `exports` array.** No exceptions. If another module needs the data, the owning service grows a method.
- [ ] **Backstop it with lint** so the violation is caught even in a file that hasn't been wired up yet:

```js
// eslint.config.js — scoped to apps/api/src/modules/**
'no-restricted-imports': ['error', {
  patterns: [{
    group: ['../**/*.repository', '**/modules/*/*.repository'],
    message: 'Modules import services, never repositories. Add a method to the owning service.',
  }],
}],
```

A relative import inside your own module (`./transactions.repository`, `./chunks.repository`) still passes. Only crossing a module folder fails.

### Global modules are an allowlist of three

`@Global()` removes the boundary, so it is restricted to infrastructure that genuinely has no domain:

| Module | Why global |
|---|---|
| `ConfigModule` | Every module reads config. Registered with `isGlobal: true`. |
| `DatabaseModule` | Provides the Drizzle client token. Every repository needs it. |
| `RedisModule` | Cache, rate limits, SSE pub/sub, BullMQ connection. |

**No feature module is ever `@Global()`.** A codebase where everything is global has no boundaries, and the Phase 2 extraction path evaporates.

---

## 2. Zod is the only schema language

`packages/shared` holds the canonical Zod schema. Three things derive from it and nothing else does.

```
packages/shared/src/schemas/transaction.schema.ts
        │
        ├── TypeScript type      →  z.infer<typeof createTransactionSchema>
        ├── Runtime validation   →  ZodValidationPipe (422 on failure)
        └── OpenAPI              →  createZodDto() + patched @nestjs/swagger
```

```ts
// packages/shared — canonical, imported by both apps
export const createTransactionSchema = z.object({
  propertyAddress: z.string().min(1).max(255),
  transactionType: z.enum(TRANSACTION_TYPES),
  purchasePrice: z.number().int().positive().optional(),
});
export type CreateTransaction = z.infer<typeof createTransactionSchema>;
```

```ts
// apps/api — the DTO class exists only so Nest and Swagger have something to reference
import { createZodDto } from 'nestjs-zod';
import { createTransactionSchema } from '@counselos/shared';

export class CreateTransactionDto extends createZodDto(createTransactionSchema) {}
```

- [ ] **`class-validator` and `class-transformer` are never installed.** If you see a `@IsString()` decorator in a PR, it's a defect, not a style choice.
- [ ] **`nestjs-zod` is a thin bridge, not the source of truth.** Schemas live in `packages/shared` so the frontend imports the identical object. Confirm the installed version's Zod peer range at setup — a mismatch surfaces as confusing type errors, not a clean failure.
- [ ] **`patchNestJsSwagger()` runs once at bootstrap**, before any module loads, or generated OpenAPI silently omits every body schema.
- [ ] **The pipe throws our exception, not NestJS's.** `UnprocessableException` built from `error.flatten().fieldErrors`, producing the standard envelope with a typed code and field-level `details`. The default `ValidationPipe` throws **400**; our contract is **422**.
- [ ] **Validate params and query too**, not just bodies. A malformed UUID in a path should 422 at the pipe, never surface as a Postgres cast error in a repository.
- [ ] **Field limits live in the schema**, sourced from `packages/shared/src/constants/limits.ts`. Chat 4,000 · draft instructions 2,000 · matter notes 2,000 · communication summary 500. Enforced once, at the pipe, before any service runs.

---

## 3. Cross-cutting concerns register as providers, never via `app.useGlobal*()`

This is the single most common NestJS mistake and it will bite CounselOS specifically. Our global exception filter must format the error envelope **and** report to Sentry **and** attach the correlation ID — it needs injected dependencies.

`app.useGlobalFilters(new GlobalExceptionFilter())` constructs the instance outside the DI container. It cannot inject anything. Ever.

```ts
// app.module.ts — every global registered this way, in this order
providers: [
  { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
  { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  { provide: APP_GUARD,       useClass: JwtAuthGuard },
  { provide: APP_GUARD,       useClass: RolesGuard },
  { provide: APP_GUARD,       useClass: MatterAccessGuard },
  { provide: APP_PIPE,        useClass: ZodValidationPipe },
  { provide: APP_FILTER,      useClass: GlobalExceptionFilter },
],
```

- [ ] **Order is registration order, and it's load-bearing.** Guards run authenticate → role → matter access. A `MatterAccessGuard` that runs before `JwtAuthGuard` has no user to check.
- [ ] **Matter-level access is a guard, not a service check.** Putting it in services means adding it to every method and forgetting it in one. Reading the transaction ID off the route in a guard makes it structural. See `13-adoption-features.md`.
- [ ] **`@Public()` is the only auth escape hatch**, read by `JwtAuthGuard` via `Reflector`. Used by the lead intake form, the health check, and the client portal routes (which use `ClientTokenGuard` instead).
- [ ] **`app.useGlobalX()` appears nowhere in `main.ts`.** The only bootstrap-level calls are `enableShutdownHooks()`, `enableCors()`, Helmet, and the versioning prefix.

---

## 4. Every provider is a singleton — request scope is banned

`@Injectable({ scope: Scope.REQUEST })` forces NestJS to instantiate the provider *and its entire injection chain* per request. It also doesn't exist in the worker, where there is no request at all.

- [ ] **No `Scope.REQUEST` or `Scope.TRANSIENT` in `apps/api`.** If you think you need one, you need AsyncLocalStorage.
- [ ] **Per-request context uses `nestjs-cls`** (AsyncLocalStorage). One singleton, identical behavior in the HTTP process and in a BullMQ processor.

```ts
// CorrelationIdInterceptor — sets it once
this.cls.set('requestId', req.headers['x-request-id'] ?? randomUUID());

// The logger, any service, any repository — reads it without a parameter
this.cls.get('requestId');
```

This is why the correlation ID reaches log lines, Sentry scopes, queue job payloads, and SSE events without being threaded through every method signature. A hand-rolled `AsyncLocalStorage` wrapper is acceptable if we'd rather not take the dependency, but the pattern is not optional.

- [ ] **Jobs carry the correlation ID in their payload.** AsyncLocalStorage does not cross the Redis boundary — the enqueuing request reads it from CLS, writes it into the job data, and the processor seeds its own CLS context from it. That's what makes an upload traceable from HTTP request through to `document.ready`.

---

## 5. The Drizzle client is an injection token

Drizzle has no NestJS integration and doesn't need one.

```ts
// database/database.module.ts
export const DRIZZLE = Symbol('DRIZZLE');

@Global()
@Module({
  providers: [{
    provide: DRIZZLE,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
      drizzle(postgres(config.getOrThrow('DATABASE_URL')), { schema }),
  }],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
```

```ts
@Injectable()
export class TransactionsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}
}
```

- [ ] **Repositories inject `DRIZZLE`. Services never see the token.** A service that imports anything from `database/` other than inferred types is a layering violation.
- [ ] **Type the client once** — `export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>` — and import that type everywhere. Never re-derive it.
- [ ] **Transactions cross repository methods via an optional executor parameter**, not a request-scoped provider:

```ts
async create(input: NewTransaction, tx?: DrizzleTx) {
  return (tx ?? this.db).insert(transactions).values(input).returning();
}
```

The service owns the `db.transaction(...)` call and passes `tx` down. This keeps the boundary intact — the service still writes no SQL, it just decides the atomicity unit.

- [ ] **Soft delete has no framework backstop in Drizzle.** Prisma and TypeORM have global filters; Drizzle does not. `notDeleted` is a helper someone will forget exactly once, in a list query, and privileged data will surface. Every repository extends a base class whose list methods apply it by default, and every hand-written `where` in a list query is a review item.

---

## 6. Two entrypoints, three module graphs

The tempting shortcut — `NestFactory.create(AppModule)` in `worker.ts` — instantiates every controller and binds an HTTP listener in a process that should have neither.

```
CoreModule      Config · Database · Redis · Logger · CLS · Sentry
    │                    imported by both
    ├── AppModule        Core + all feature modules + controllers   → main.ts
    └── WorkerModule     Core + only the modules processors need    → worker.ts
```

```ts
// worker.ts — no HTTP server, full DI container
import './instrument';
const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
```

- [ ] **`worker.ts` uses `createApplicationContext`, not `create`.** No port binding, no controllers instantiated.
- [ ] **`enableShutdownHooks()` is required or `OnApplicationShutdown` never fires.** Miss this one line and documents strand in `PROCESSING` on every Railway deploy — and it only reproduces under a real SIGTERM, never locally. This is the highest-consequence single-line omission in the codebase.
- [ ] **`BullModule.registerQueue()` (producer) is separate from the `@Processor()` class (consumer).** A feature module registers the queue so it can enqueue; the processor class is provided only by `WorkerModule`. Both processes must never run the same processor.
- [ ] **BullMQ's Redis connection needs `maxRetriesPerRequest: null`.** ioredis defaults to 20 and BullMQ's blocking commands exceed it, producing intermittent job failures that look like network flakiness.
- [ ] **`rediss://`, not `redis://`.** TLS. Applies to every connection: cache, BullMQ, and both SSE pub/sub connections.
- [ ] **Anything stateful is Redis-backed.** Rate limits, caches, the SSE event counter. In-memory state is wrong by construction with two processes — it isn't a scaling concern, it's a correctness bug on day one.

---

## 7. Cross-module communication: inject or emit, and the rule for choosing

| You need | Use |
|---|---|
| An answer right now (data, a validation result) | Inject the owning module's **service** |
| To announce something happened, and don't care who reacts | **Emit an event** |

Direct injection for queries. `EventEmitter2` for notifications-about-facts. `document.ready` is emitted by `DocumentsModule` and consumed by `ChecklistModule`, and neither imports the other — that's the seam where Phase 2 extraction becomes a broker swap rather than a rewrite.

- [ ] **`EventEmitter2` is in-process only.** A worker-emitted event does **not** reach a listener in the HTTP process. If a listener must run in the HTTP process in response to worker work, it goes over Redis (see §8) or the worker enqueues a job. This trap is easy to miss because it works perfectly in local dev when you run one process.
- [ ] **`forwardRef()` requires a comment justifying it** and gets flagged in review. It's a signal that two modules want to be one, or that a fact should be an event. Two `forwardRef`s in the same PR means stop and redesign.
- [ ] **Event names are constants**, alongside the SSE event types in `packages/shared`, never inline strings.

---

## 8. Real-time crosses a process boundary — `SseService` must be Redis-backed in Phase 1

**This corrects a Phase 2 marking in `05-backend-checklist.md` §11D.** Redis pub/sub for SSE was filed as a scaling concern for "multiple HTTP server instances." It isn't. It's a Phase 1 correctness requirement, and here's why:

The events that matter most — `document.ready`, `document.failed`, `draft.ready`, deadline alerts from the hourly scheduler — are produced by the **worker process**. The `EventSource` connections are held by the **HTTP process**. An in-memory `Subject` inside `SseService` means the worker emits into a void and the attorney's browser never updates.

```
worker           SseService.emit(firmId, type, payload)
                        │  INCR sse:eventid:{firmId}
                        │  PUBLISH sse:firm:{firmId}  {id, type, payload}
                        ▼
                    Redis
                        │
HTTP process     SseSubscriber (OnModuleInit) — SUBSCRIBE sse:firm:*
                        │  → per-firm Subject → @Sse() Observable → browser
```

- [ ] **`SseService.emit()` publishes to Redis.** Identical code path in both processes — the HTTP process publishes too and receives its own message back through the subscriber. One path, no branching on "am I the worker."
- [ ] **The subscriber needs its own Redis connection.** A connection in subscriber mode cannot issue other commands. Reusing the cache connection breaks the cache in a way that is genuinely confusing to debug.
- [ ] **Subscribe in `OnModuleInit`, unsubscribe in `OnModuleDestroy`.** The HTTP process only.
- [ ] **Heartbeat every 25s**, cleanup on `req.on('close')` — `clearInterval` then `subscriber.complete()`. Without cleanup, intervals leak proportional to connection churn.
- [ ] **Reconnect serves a snapshot, not a replay.** Per `05-backend-checklist.md` §11C.
- [ ] **Chat token streaming is the exception** — it's request-scoped and stays in-process, since the LLM call and the open connection are in the same HTTP handler.

---

## 9. Config is validated once, at boot, and read through `ConfigService`

- [ ] **`ConfigModule.forRoot({ isGlobal: true, validate })`** where `validate` runs the Zod env schema from `config/env.validation.ts`.
- [ ] **`process.env` appears in exactly two files** — `instrument.ts` (which runs before DI exists) and `env.validation.ts`. Everywhere else it's `ConfigService`.
- [ ] **`getOrThrow()` over `get()`** for anything required. A silent `undefined` that becomes a connection string is a runtime failure three requests deep instead of a boot failure.
- [ ] **Boot fails loudly on a missing var**, listing every missing key at once — not the first one. An engineer fixing env vars one boot at a time is a bad afternoon.
- [ ] **`not_configured` is a first-class state for optional externals** (Anthropic, Voyage, Resend, storage). Validation distinguishes *required to boot* from *feature degrades honestly*. Never disguise an unconfigured service as an error or as working — see `17-ai-principles.md`.

---

## 10. Test seams follow from the layering

| Tier | How it's wired | Why |
|---|---|---|
| Unit | `new TransactionsService(mockRepo)` | Plain constructor. Microseconds. No container to configure. |
| Integration | `Test.createTestingModule` + real Postgres/Redis via testcontainers | Proves the Drizzle queries and the soft-delete filters. |
| E2E | Full `AppModule` + `overrideProvider` for externals only | Proves the real request lifecycle: guards, pipe, filter, envelope. |

- [ ] **Don't use `Test.createTestingModule` for service unit tests.** The service takes a repository in its constructor — that's the seam. Spinning a DI container to inject one mock is pure overhead.
- [ ] **In E2E, override only the true externals**: Anthropic, Voyage AI, Resend, Supabase Auth. Never mock our own database, queue, services, or repositories. An E2E test with a mocked repository proves nothing about the request lifecycle.
- [ ] **Guards are overridden by class, not disabled.** `overrideGuard(JwtAuthGuard)` when a test needs a specific identity — but the module's own E2E gate uses a real JWT, per `01-codebase.md`.
- [ ] **Close the app in `afterAll`.** `await app.close()` — otherwise Jest hangs on open Redis and Postgres handles, and the failure looks like a flaky test.

---

## The Banned List

Quick reference. Each of these has a specific replacement above.

| Banned | Use instead | § |
|---|---|---|
| Repository in a module's `exports` | Add a method to the owning service | 1 |
| `class-validator` / `class-transformer` | Zod in `packages/shared` + `createZodDto` | 2 |
| `app.useGlobalFilters()` / `useGlobalPipes()` | `APP_FILTER` / `APP_PIPE` providers | 3 |
| `Scope.REQUEST` / `Scope.TRANSIENT` | `nestjs-cls` (AsyncLocalStorage) | 4 |
| Drizzle client injected into a service | Repository injects `DRIZZLE`; service injects the repository | 5 |
| `NestFactory.create(AppModule)` in `worker.ts` | `createApplicationContext(WorkerModule)` | 6 |
| `redis://` | `rediss://` | 6 |
| In-memory cache, rate limit, or SSE subject | Redis-backed | 6, 8 |
| Unexplained `forwardRef()` | An event, or a redesign | 7 |
| `process.env` outside `instrument.ts` / `env.validation.ts` | `ConfigService.getOrThrow()` | 9 |
| Mocked repository in an E2E test | Real DB; mock only true externals | 10 |
| `@Global()` on a feature module | Explicit `imports` | 1 |

---

## The Two That Cost the Most If Missed

Everything above is worth doing. These two fail *silently in local development* and only surface in production:

1. **`app.enableShutdownHooks()` in `worker.ts`.** Without it, `OnApplicationShutdown` never fires, and every deploy strands whatever document was mid-pipeline in `PROCESSING`. The attorney watches a spinner that never resolves.
2. **Redis-backed `SseService`.** Without it, every worker-produced event — document ready, draft ready, deadline alert — reaches nobody. Works perfectly when you run one process locally. Fails completely on Railway.

Wire both on day one, in Slice 0.
