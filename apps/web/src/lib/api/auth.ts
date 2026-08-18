import type { LoginInput, LoginResponse, RefreshResponse } from '@counselos/shared';

import { useAuthStore } from '@/stores/auth.store';
import { apiFetch } from './client';

/**
 * The auth calls, kept out of mutations.ts on purpose.
 *
 * mutations.ts exists to declare SWR invalidation. These do not invalidate
 * anything — they move the session, which lives in Zustand, not in SWR. Filing
 * them there would blur the one rule that file exists to make obvious.
 */

export async function login(input: LoginInput): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    body: input,
  });
  useAuthStore.getState().setSession(result.accessToken, result.user);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<null>('/v1/auth/logout', { method: 'POST' });
  } finally {
    // Clear locally even if the server call failed — a user who clicks sign out
    // must end up signed out on this device regardless.
    useAuthStore.getState().clear();
  }
}

/**
 * Rebuilds the session after a page load.
 *
 * The access token lives in memory, so a refresh — or a new tab — starts with
 * nothing. The httpOnly refresh cookie is the durable half: if it is still
 * valid the API mints a new access token and we are signed in again, and if it
 * is not, this returns false and the caller sends the user to login.
 *
 * This is why the token being in memory costs nothing in practice.
 */
export async function restoreSession(): Promise<boolean> {
  try {
    const { accessToken } = await apiFetch<RefreshResponse>('/v1/auth/refresh', { method: 'POST' });
    useAuthStore.getState().setAccessToken(accessToken);
    // The token alone is not identity — fetch the user the API resolved from it.
    const user = await apiFetch<LoginResponse['user']>('/v1/auth/me');
    useAuthStore.getState().setSession(accessToken, user);
    return true;
  } catch {
    useAuthStore.getState().clear();
    return false;
  }
}
