import tseslint from 'typescript-eslint';
import { base } from './base.js';

/**
 * Backend rules. Every entry here is an architecture rule from
 * 18-nestjs-conventions.md made mechanical, so it fails at lint rather than in
 * review — or worse, in production.
 */
export const nest = tseslint.config(
  ...base,

  {
    files: ['src/modules/**/*.ts'],
    rules: {
      /* 18 §1 — THE boundary rule.
         A module may import another module's service, never its repository.
         `./x.repository` (your own module) still passes; anything reached
         through `../` does not. The @Module exports array catches this at
         bootstrap too — this catches it in files not yet wired up. */
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**/*.repository', '**/modules/*/*.repository'],
              message:
                'Modules import services, never repositories (18-nestjs-conventions.md §1). Add a method to the owning module\'s service instead.',
            },
            {
              group: ['**/database/db', '**/database/db.js'],
              message:
                'Only repositories touch the Drizzle client, and they inject the DRIZZLE token (18 §5). Services go through their repository.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // 18 §4 — request scope rebuilds the injection chain per request and
          // does not exist in the worker process at all.
          selector: "Property[key.name='scope'][value.property.name=/^(REQUEST|TRANSIENT)$/]",
          message:
            'No request-scoped providers (18 §4). Use nestjs-cls (AsyncLocalStorage) for per-request context — it works identically in the worker.',
        },
        {
          // 18 §3 — a global built outside the DI container cannot inject
          // Sentry, the logger, or the correlation ID.
          selector:
            "CallExpression[callee.property.name=/^useGlobal(Filters|Pipes|Guards|Interceptors)$/]",
          message:
            'Register globals as APP_FILTER / APP_PIPE / APP_GUARD / APP_INTERCEPTOR providers (18 §3), or they cannot inject dependencies.',
        },
        {
          // 18 §9 — one validated boundary, so a missing var fails at boot.
          selector: "MemberExpression[object.object.name='process'][object.property.name='env']",
          message:
            'Read config through ConfigService.getOrThrow() (18 §9). process.env is allowed only in instrument.ts and config/env.validation.ts.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Inject a clock instead of calling new Date() directly. Deadline urgency and TREC date math must be testable at a pinned time.',
        },
      ],
    },
  },

  {
    /* The files that legitimately read process.env:
         instrument.ts      — runs before the DI container exists
         env.validation.ts  — *is* the environment boundary
         drizzle.config.ts  — drizzle-kit runs outside Nest entirely
         seed.ts / reset.ts — standalone CLI scripts, no container to inject from
       Nothing else. Adding to this list is a deliberate decision, not a
       convenience. */
    files: [
      'src/instrument.ts',
      'src/config/env.validation.ts',
      'src/database/seed.ts',
      'src/database/reset.ts',
      'drizzle.config.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },

  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/__tests__/**', '**/test/**'],
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
  },
);

export default nest;
