import { ERROR_CODES, type ApiResponse, type ErrorCode } from '@counselos/shared';

import { useAuthStore } from '@/stores/auth.store';

/**
 * apiFetch owns the entire auth lifecycle. Components never think about tokens
 * (06 Part 6).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DO NOT MOCK THIS FUNCTION IN TESTS. Mock the network under it, with MSW.
 *
 * Everything below — 401 detection, single-flight refresh, retry-once,
 * USER_INACTIVE routing, bumpTokenVersion — only runs if the real function
 * runs. Stub it and every one of those paths is skipped silently: the tests
 * pass, the surface looks finished, and the first real 401 in production is the
 * first time that code has ever executed. See 06 Part 14.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * The API ORIGIN — no path, no `/v1`.
 *
 * Every path handed to apiFetch already begins with `/v1`, because SWR keys are
 * the literal API path (queryKeys.ts) and the key must match the URL exactly.
 * Putting `/v1` in this variable too yields `/v1/v1/dashboard`, which 404s in a
 * way that reads like a routing bug on the server rather than a config mistake
 * here. The trailing slash is stripped for the same reason.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

/** Thrown for every unsuccessful response. Carries the typed code, not a string. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, string[]> | null = null,
    readonly requestId?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level errors for a 422, ready to hand to setError(field, …). */
  get fieldErrors(): Record<string, string[]> {
    return this.details ?? {};
  }
}

/**
 * Single-flight refresh.
 *
 * If five requests 401 at once, one refresh fires and the other four await it.
 * Without this you get a refresh storm — and with rotating refresh tokens, the
 * later ones present an already-consumed token and log the user out for what
 * was really a burst of parallel loads.
 */
let refreshPromise: Promise<string> | null = null;

async function doRefresh(): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
    method: 'POST',
    // The refresh token is an httpOnly cookie — deliberately not readable here.
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
  });

  if (!res.ok) {
    useAuthStore.getState().clear();
    throw new ApiError(ERROR_CODES.UNAUTHORIZED, 'Session expired.', null, undefined, 401);
  }

  const body = (await res.json()) as ApiResponse<{ accessToken: string }>;
  if (!body.success) {
    useAuthStore.getState().clear();
    throw new ApiError(body.error.code, body.error.message, null, body.error.requestId, 401);
  }

  useAuthStore.getState().setAccessToken(body.data.accessToken);
  return body.data.accessToken;
}

function refreshToken(): Promise<string> {
  refreshPromise ??= doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function withAuth(init: RequestInit | undefined, token: string | null): RequestInit {
  const headers = new Headers(init?.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);

  /**
   * NEVER set content-type on a FormData body.
   *
   * The browser generates `multipart/form-data; boundary=…` itself, and the
   * boundary is what separates the parts. Overwriting it with
   * application/json produces a request the server cannot parse — every
   * document upload would fail with a body the backend reads as empty, which
   * looks like a backend bug and is not one.
   */
  const isFormData = init?.body instanceof FormData;
  if (init?.body !== undefined && !isFormData && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return { ...init, headers, credentials: 'include' };
}

/** Where USER_INACTIVE sends the user. Overridable so this file imports no router. */
let onDeactivated: () => void = () => {
  if (typeof window !== 'undefined') window.location.assign('/auth/deactivated');
};

export function setDeactivatedHandler(handler: () => void): void {
  onDeactivated = handler;
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  /** Serialized as JSON unless it is already a string or FormData. */
  body?: unknown;
}

export async function apiFetch<T>(path: string, options?: ApiFetchOptions): Promise<T> {
  const init = normalize(options);
  let res = await fetch(`${API_BASE}${path}`, withAuth(init, useAuthStore.getState().accessToken));

  if (res.status === 401) {
    // clone(): the body is read again below, and a Response body streams once.
    const parsed = await safeJson(res.clone());
    const code = parsed && !parsed.success ? parsed.error.code : undefined;

    if (code === ERROR_CODES.USER_INACTIVE) {
      // NOT login. Their credentials are fine — the account was disabled, and
      // sending them to a login form that then succeeds produces a loop.
      useAuthStore.getState().clear();
      onDeactivated();
      throw new ApiError(code, 'Your account has been deactivated.', null, undefined, 401);
    }

    if (code === ERROR_CODES.TOKEN_EXPIRED) {
      const token = await refreshToken();
      // What re-establishes SSE: EventSource can't set headers, so the token
      // rides in the URL and the hook re-subscribes on tokenVersion changing.
      useAuthStore.getState().bumpTokenVersion();
      // Retry ONCE. A loop here turns an auth bug into a self-inflicted DDoS.
      res = await fetch(`${API_BASE}${path}`, withAuth(init, token));
    }
  }

  // 204 and other empty bodies are legitimate successes with nothing to parse.
  if (res.status === 204) return undefined as T;

  const body = await safeJson(res);
  if (!body) {
    throw new ApiError(
      ERROR_CODES.INTERNAL_ERROR,
      'The server returned an unreadable response.',
      null,
      undefined,
      res.status,
    );
  }

  if (!body.success) {
    throw new ApiError(
      body.error.code,
      body.error.message,
      body.error.details ?? null,
      body.error.requestId,
      res.status,
    );
  }

  return body.data as T;
}

function normalize(options?: ApiFetchOptions): RequestInit {
  if (!options) return {};
  const { body, ...rest } = options;
  if (body === undefined) return rest;
  const serialized =
    typeof body === 'string' || body instanceof FormData ? body : JSON.stringify(body);
  return { ...rest, body: serialized };
}

async function safeJson(res: Response): Promise<ApiResponse<unknown> | null> {
  try {
    return (await res.json()) as ApiResponse<unknown>;
  } catch {
    return null;
  }
}

/** The SWR fetcher. Every key is a literal API path, so this needs no arguments. */
export const fetcher = <T>(path: string): Promise<T> => apiFetch<T>(path);
