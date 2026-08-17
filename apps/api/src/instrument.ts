/**
 * Sentry initialisation.
 *
 * THIS MUST BE THE FIRST IMPORT IN main.ts AND worker.ts — before @nestjs/core,
 * before anything. Sentry patches the modules it instruments as they load, so
 * anything imported earlier is invisible to it, and errors thrown during
 * bootstrap are lost entirely (02-repo-structure.md).
 *
 * This file runs before the DI container exists, which is why it is one of the
 * only three places allowed to read process.env directly (18 §9).
 *
 * Init alone is not enough: SentryModule.forRoot() must also be imported by
 * AppModule and WorkerModule, and SentryGlobalFilter registered as APP_FILTER,
 * or exceptions are logged by Nest and never reach Sentry. See app.module.ts.
 *
 * COMPLIANCE: Sentry is a subprocessor under Rule 1.05 — it receives stack
 * traces and error messages from a system holding privileged matter content.
 * A DPA is required, the org's data region must be US, and event retention
 * should be the shortest the plan allows (09-legal-compliance.md, Vendor Chain).
 */
import * as Sentry from '@sentry/nestjs';

/**
 * ConfigModule loads .env, but that happens while the module graph is being
 * built — long after this file has already run. Without this, SENTRY_DSN is
 * always undefined in local development no matter what apps/api/.env says, and
 * Sentry silently stays off in the one environment where you'd notice.
 *
 * process.loadEnvFile is native in Node 24 (.nvmrc), so this costs no
 * dependency. Deployed environments inject real variables and must never be
 * shadowed by a stray file, so it is skipped in production — the same rule
 * ConfigModule follows with ignoreEnvFile.
 */
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile();
  } catch {
    // No .env is a normal state (CI, a fresh clone). Env vars may still come
    // from the real environment, and validateEnvVars() is what decides whether
    // what we ended up with is sufficient.
  }
}

const dsn = process.env.SENTRY_DSN;

/**
 * Redact the PII that survives `sendDefaultPii: false`.
 *
 * That flag governs request bodies, headers, and user identifiers — not the
 * text of an error. Messages are where privileged data actually leaks:
 * a Postgres unique-violation quotes the conflicting value, a Zod error echoes
 * the input that failed (chat messages run to 4,000 characters of client
 * content), and a not-found error can interpolate a party name or property
 * address.
 *
 * Names cannot be pattern-matched and are handled by never interpolating them
 * into exception messages in the first place. What is matchable is matched
 * here — including account and routing numbers, since wire instructions are
 * extracted from documents and a wire-verification failure is exactly the kind
 * of error that reports upstream.
 */
const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[REDACTED_EMAIL]'],
  // Lookbehind rather than a leading \b: \b cannot match before "(", which
  // leaves the opening paren of "(512) 555-0142" stranded outside the redaction.
  [/(?<![\d-])(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g, '[REDACTED_PHONE]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]'],
  // 8+ consecutive digits: bank account and ABA routing numbers (05 §8F).
  [/\b\d{8,}\b/g, '[REDACTED_NUMBER]'],
];

function redact<T>(value: T): T {
  if (typeof value !== 'string') return value;
  let out: string = value;
  for (const [pattern, replacement] of REDACTIONS) out = out.replace(pattern, replacement);
  return out as unknown as T;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Sampled, not exhaustive — full tracing on every request is expensive and
    // rarely more informative than a representative sample.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Never let a request body reach Sentry: they carry client PII and
    // privileged matter content (05 §14).
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        event.request.query_string = undefined;
      }

      // The message on the event itself (Sentry.captureMessage).
      if (typeof event.message === 'string') event.message = redact(event.message);

      // The message on each exception in the chain (Sentry.captureException).
      for (const exception of event.exception?.values ?? []) {
        if (exception.value) exception.value = redact(exception.value);
      }

      // Breadcrumbs replay what happened before the error — including logged
      // SQL and outbound request URLs.
      event.breadcrumbs = event.breadcrumbs?.map((crumb) => ({
        ...crumb,
        message: redact(crumb.message),
      }));

      return event;
    },
  });
} else if (process.env.NODE_ENV === 'production') {
  // In production a missing DSN means errors vanish. That is not a warning.
  throw new Error('SENTRY_DSN is required in production — refusing to start blind.');
}
