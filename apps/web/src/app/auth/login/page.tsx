'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ERROR_CODES, loginSchema, type LoginInput } from '@counselos/shared';

import { Button, Field, applyServerErrors, useZodForm } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { login } from '@/lib/api/auth';

import styles from './page.module.css';

/**
 * The only place a password is typed.
 *
 * It posts to our API, never to Supabase — so the access token comes back in
 * the response body and stays in memory, and the refresh token arrives as an
 * httpOnly cookie the browser cannot read (06 Part 6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THERE IS NO "FORGOT PASSWORD" AND NO "SIGN UP", AND THAT IS NOT AN OVERSIGHT.
 *
 * Phase 1 is one firm; accounts are provisioned by the owner. A reset link with
 * nothing behind it would be a faked integration, and an empty answer sends
 * people to support — so the page says plainly who to ask instead.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const form = useZodForm<LoginInput>(loginSchema);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      router.replace('/home');
    } catch (error) {
      // 422 maps field by field onto the form, so a server rejection lands
      // exactly where a client-side one would.
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        applyServerErrors(form, error);
        return;
      }
      if (error instanceof ApiError && error.code === ERROR_CODES.RATE_LIMIT_EXCEEDED) {
        setFormError(error.message);
        return;
      }
      // Deliberately the same message whatever went wrong. Distinguishing
      // "no such account" from "wrong password" turns this form into an
      // account enumerator.
      setFormError('That email and password combination was not recognised.');
    }
  });

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.mastheadRow}>
          <span>RODRIGUEZ LAW</span>
          <span>AUSTIN, TEXAS</span>
        </div>
        <div className={styles.rule} />
      </header>

      <div className={styles.composition}>
        <section className={styles.statement}>
          <h1 className={styles.headline}>Case management first.</h1>
          <p className={styles.lede}>
            The operational spine of the firm — matters, parties, deadlines and documents. The AI
            reads and drafts; it never sends, confirms or decides.
          </p>
        </section>

        <div className={styles.formColumn}>
          <form
            className={styles.form}
            onSubmit={onSubmit}
            noValidate
            data-testid="auth-login-form"
          >
            <span className={styles.formLabel}>SIGN IN</span>

            <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
              <input
                id="email"
                type="email"
                autoComplete="username"
                className={styles.input}
                data-testid="auth-email-input"
                {...form.register('email')}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              error={form.formState.errors.password?.message}
            >
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className={styles.input}
                data-testid="auth-password-input"
                {...form.register('password')}
              />
            </Field>

            {formError !== null ? (
              <p className={styles.error} role="alert" data-testid="auth-error">
                <svg
                  className={styles.errorIcon}
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 5v3.5" />
                  <path d="M8 11h.01" />
                </svg>
                {formError}
              </p>
            ) : null}

            {/*
              The registry Button, not a hand-rolled one.
              
              This was its own <button> with its own hover, active, focus,
              disabled and loading states — written before `fullWidth` and
              `iconRight` existed, and already drifted from the primitive by the
              time they did. Two implementations of one element is the failure
              the registry exists to prevent, and it never looks wrong alone.
              
              The 56px height is the one real difference and stays a local
              override: this control belongs to a page, not to a row.
            */}
            <span className={styles.submitSlot}>
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={form.formState.isSubmitting}
                data-testid="auth-submit-btn"
                iconRight={
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 8h9" />
                    <path d="M8.5 4.5 12 8l-3.5 3.5" />
                  </svg>
                }
              >
                {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </span>

            <p className={styles.lockout}>
              Accounts are provisioned by the firm owner. Locked out? Ask them to reset yours.
            </p>
          </form>
        </div>
      </div>

      <footer className={styles.colophon}>
        <div className={styles.ruleFaint} />
        <div className={styles.colophonRow}>
          <span>COUNSELOS</span>
          <span>TEX. DISCIPLINARY R. PROF. CONDUCT · OP. 705</span>
        </div>
      </footer>
    </main>
  );
}
