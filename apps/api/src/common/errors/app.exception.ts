import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@counselos/shared';

/**
 * The only exception type service code throws (05 §1D, 04-data-contracts).
 *
 * A raw `HttpException` from a service is banned: it carries a message and a
 * status but no typed code, and the frontend switches on `error.code`, never on
 * `error.message` (06 Principle: messages change freely, codes are the
 * contract). Throwing a string literal is worse still — it becomes a 500.
 *
 * `details` is field-level context, populated for validation failures. It must
 * never carry an internal field name, a SQL fragment, or anything a client
 * shouldn't see: whatever lands here is serialized straight to the wire.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: Record<string, string[]> | null,
  ) {
    super(message, status);
  }
}

/** 404. Also the correct answer for a client-portal resource the caller may not
 *  see — revealing that a transaction exists is itself a disclosure (05 L10). */
export class NotFoundException extends AppException {
  constructor(message = 'Not found', code: ErrorCode = ERROR_CODES.NOT_FOUND) {
    super(code, message, HttpStatus.NOT_FOUND);
  }
}

/** 401 — not authenticated, or the token is expired/invalid. */
export class UnauthorizedException extends AppException {
  constructor(message = 'Unauthorized', code: ErrorCode = ERROR_CODES.UNAUTHORIZED) {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

/**
 * 403 — authenticated, but not allowed.
 *
 * The message is load-bearing here. Slice 0's gate requires that a paralegal
 * denied an unassigned matter sees an *explaining* error, not a bare 403 — the
 * UI tells them who to ask. Pass a message that a human can act on.
 */
export class ForbiddenException extends AppException {
  constructor(message = 'Forbidden', code: ErrorCode = ERROR_CODES.FORBIDDEN) {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}

/**
 * 422 — the request was understood and rejected on its content.
 *
 * Deliberately 422 and not 400: validation failures and invalid state
 * transitions are business outcomes the frontend renders per field or per rule,
 * and giving them their own status keeps them distinct from a malformed
 * request that never parsed.
 */
export class UnprocessableException extends AppException {
  constructor(
    message: string,
    code: ErrorCode = ERROR_CODES.VALIDATION_ERROR,
    details?: Record<string, string[]> | null,
  ) {
    super(code, message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

/** 429 — too many attempts. Redis-backed counters; never in-memory (CLAUDE.md §4). */
export class TooManyRequestsException extends AppException {
  constructor(message = 'Too many attempts. Try again shortly.') {
    super(ERROR_CODES.RATE_LIMIT_EXCEEDED, message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/** 409 — a uniqueness or concurrency conflict. */
export class ConflictException extends AppException {
  constructor(message: string, code: ErrorCode) {
    super(code, message, HttpStatus.CONFLICT);
  }
}
