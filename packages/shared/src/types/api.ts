import type { ErrorCode } from '../errors/error-codes.js';

/**
 * The response envelope, from 04-data-contracts.md. Every endpoint returns one
 * of these two shapes — no endpoint returns a bare resource.
 *
 * Produced by ResponseInterceptor (success) and GlobalExceptionFilter (error),
 * so consistency comes from two files rather than from discipline in hundreds.
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    /** Field-level detail. Populated for VALIDATION_ERROR; often absent otherwise. */
    details?: Record<string, string[]> | null;
    /** Correlation ID. Quote this in a bug report and the whole request is findable. */
    requestId: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Narrowing helper, so the frontend doesn't re-derive this check per call site. */
export function isApiError<T>(response: ApiResponse<T>): response is ApiError {
  return response.success === false;
}

/**
 * External-dependency state (05 §8L). `not_configured` is first-class: a
 * service nobody set up is not an error and is not "working" — the UI renders
 * a disabled state with a plain explanation rather than a spinner that never
 * resolves.
 */
export const SERVICE_STATES = ['ok', 'degraded', 'down', 'not_configured'] as const;
export type ServiceState = (typeof SERVICE_STATES)[number];

export interface ServiceHealth {
  name: string;
  status: ServiceState;
  /** Shown to the user when the state isn't `ok`. Plain language, no stack traces. */
  message?: string;
  checkedAt: string;
}
