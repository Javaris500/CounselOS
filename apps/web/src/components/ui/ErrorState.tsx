'use client';

import type { ReactNode } from 'react';
import { ERROR_CODES, type ErrorCode } from '@counselos/shared';

import styles from './ErrorState.module.css';

/**
 * Error display, mapped by `error.code` — NEVER by parsing `error.message`.
 *
 * Messages change freely; codes are the contract. A component that branches on
 * message text breaks the day someone improves the wording, and it breaks
 * silently.
 *
 * The copy here is deliberately plain and non-technical. An attorney reading
 * "Request failed with status 500" learns nothing they can act on.
 */
const MESSAGES: Partial<Record<ErrorCode, string>> = {
  [ERROR_CODES.NOT_FOUND]: "We couldn't find that. It may have been moved or deleted.",
  [ERROR_CODES.FORBIDDEN]:
    "You don't have access to this matter. Ask the assigned attorney to add you.",
  [ERROR_CODES.MATTER_ACCESS_DENIED]:
    "You don't have access to this matter. Ask the assigned attorney to add you.",
  [ERROR_CODES.VALIDATION_ERROR]: 'Some details need fixing before this can be saved.',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Too many requests just now. Give it a moment and try again.',
  [ERROR_CODES.INTERNAL_ERROR]:
    'Something went wrong on our end. It has been logged and we are looking at it.',
};

export interface ErrorStateProps {
  code?: ErrorCode;
  /** Correlation ID. Shown so a support request can quote it and be findable. */
  requestId?: string;
  action?: ReactNode;
}

export function ErrorState({ code, requestId, action }: ErrorStateProps): React.JSX.Element {
  const message =
    (code ? MESSAGES[code] : undefined) ??
    MESSAGES[ERROR_CODES.INTERNAL_ERROR] ??
    'Something went wrong.';

  return (
    <div className={styles.wrap} role="alert" data-testid="ui-error-state" data-error-code={code}>
      <p className={styles.message}>{message}</p>
      {action ? <div>{action}</div> : null}
      {requestId ? <p className={styles.requestId}>Reference: {requestId}</p> : null}
    </div>
  );
}
