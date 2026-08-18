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
 */
export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const form = useZodForm<LoginInput>(loginSchema);
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
      router.replace('/dashboard');
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
      <form className={styles.card} onSubmit={onSubmit} noValidate data-testid="auth-login-form">
        <h1 className={styles.title}>Sign in to CounselOS</h1>

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

        <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
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
            {formError}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          loading={form.formState.isSubmitting}
          data-testid="auth-submit-btn"
        >
          Sign in
        </Button>
      </form>
    </main>
  );
}
