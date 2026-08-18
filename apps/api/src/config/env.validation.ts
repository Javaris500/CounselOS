import { z } from 'zod';

/**
 * The environment boundary. This is the second and last file allowed to read
 * process.env directly (18 §9) — everything else goes through ConfigService.
 *
 * Two rules shape this file:
 *
 *  1. FAIL FAST, AND FAIL COMPLETELY. A missing variable must never surface as
 *     a runtime error three requests deep. And when several are missing, report
 *     all of them at once — fixing env vars one boot at a time is a bad
 *     afternoon (05 §1A).
 *
 *  2. TLS IS NON-NEGOTIABLE OUTSIDE DEVELOPMENT. Production must use rediss://
 *     and sslmode=require. Local development runs plain Postgres and Redis in
 *     docker-compose, so the plain forms are permitted there and nowhere else
 *     (00 §3).
 */

const isDev = (env: string) => env === 'development' || env === 'test';

/**
 * Optional variable that treats blank as absent.
 *
 * A .env file yields `RESEND_FROM_EMAIL=""`, not undefined — so a bare
 * `.email().optional()` rejects the blank line that .env.example tells people
 * to leave in place. That would turn "not configured" into "invalid config",
 * which is precisely the confusion the not_configured state exists to prevent
 * (17-ai-principles.md). Blank means the feature is off, not broken.
 */
const blankAsUnset = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  // --- Supabase: database, auth, and storage on one platform ---
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  /** Scoped to AuthService and StorageService only. Never imported elsewhere. */
  SUPABASE_SERVICE_KEY: z.string().min(1),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('documents'),

  // --- Redis (Upstash in deployed environments) ---
  REDIS_URL: z.string().min(1),

  // --- Security ---
  // No JWT_SECRET. Supabase signs access tokens with ES256 and we verify against
  // the public key from its JWKS endpoint, so this service holds nothing capable
  // of MINTING a token — only of verifying one. A shared secret here would be a
  // forgery oracle: anyone holding it could mint a token for any user.
  /** Signs client-portal tokens. Only the SHA-256 hash is ever stored. */
  HMAC_SECRET: z.string().min(32, 'Generate with: openssl rand -base64 32'),

  // --- App ---
  FRONTEND_URL: z.string().url(),
  CLIENT_PORTAL_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
  /** The single Phase-1 firm. Handled server-side; never accepted from a client. */
  FIRM_ID: z.string().uuid(),

  // --- Optional externals ---
  // Absent is a legitimate state, not an error. The service reports
  // `not_configured` through /v1/health/services and its feature renders a
  // disabled state with a plain explanation — never a spinner that never
  // resolves (17-ai-principles.md).
  ANTHROPIC_API_KEY: blankAsUnset(z.string().min(1)),
  VOYAGE_API_KEY: blankAsUnset(z.string().min(1)),
  RESEND_API_KEY: blankAsUnset(z.string().min(1)),
  RESEND_FROM_EMAIL: blankAsUnset(z.string().email()),
  SENTRY_DSN: blankAsUnset(z.string().url()),
});

const envSchema = baseSchema.superRefine((env, ctx) => {
  if (isDev(env.NODE_ENV)) return;

  if (!env.REDIS_URL.startsWith('rediss://')) {
    ctx.addIssue({
      code: 'custom',
      path: ['REDIS_URL'],
      message:
        'Must use rediss:// (TLS) outside development. Cached user records and chat history travel over this connection.',
    });
  }

  if (!env.DATABASE_URL.includes('sslmode=require')) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'Must include ?sslmode=require outside development.',
    });
  }

  /**
   * The JWT verification keys are fetched from this origin, and the expected
   * `iss` claim is DERIVED from it — so issuer checking alone does not defend
   * against an environment swap, because both move together. Pinning the origin
   * is what closes it: anyone who can point this at another host could otherwise
   * mint sessions we would accept as valid.
   *
   * There is deliberately no SUPABASE_JWKS_URL variable, for the same reason.
   * A custom Supabase auth domain would mean editing this pattern — a deliberate
   * decision rather than a silent config change.
   */
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(env.SUPABASE_URL)) {
    ctx.addIssue({
      code: 'custom',
      path: ['SUPABASE_URL'],
      message:
        'Must be https://<project-ref>.supabase.co outside development — JWT signing keys and the expected issuer are both derived from this origin.',
    });
  }
});

export type Env = z.infer<typeof baseSchema>;

/**
 * Pre-DI environment flag.
 *
 * ConfigModule.forRoot() options are evaluated while the module graph is being
 * constructed, before ConfigService exists — so module wiring cannot use
 * getOrThrow(). Rather than sprinkle process.env through core.module.ts, the
 * one read lives here, in the file that already owns the environment boundary.
 */
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Passed to ConfigModule.forRoot({ validate }). Throws before NestJS finishes
 * bootstrapping, so the process never reaches a state where a handler could run
 * with a missing variable.
 */
export function validateEnvVars(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  throw new Error(
    `Environment validation failed — ${result.error.issues.length} problem(s):\n${problems}\n\n` +
      `See apps/api/.env.example and 00-developer-guide.md §4.`,
  );
}
