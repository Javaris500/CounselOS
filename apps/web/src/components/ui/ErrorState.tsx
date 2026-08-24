'use client';

import type { ReactNode } from 'react';
import { ERROR_CODES, type ErrorCode } from '@counselos/shared';

import styles from './ErrorState.module.css';

/**
 * Error display, BRANCHED on `error.code` — never on `error.message`.
 *
 * Messages change freely; codes are the contract. A component that branches on
 * message text breaks the day someone improves the wording, and it breaks
 * silently.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BRANCHING ON A MESSAGE AND DISPLAYING ONE ARE DIFFERENT THINGS.
 *
 * This component used to map the code to fixed copy and stop there, which read
 * as the rule above being honoured. It was over-applied. Some errors are
 * COMPOSED by the server precisely so they can explain themselves —
 * `MATTER_ACCESS_DENIED` names the assigned attorney and carries
 * `details.requestAccessFrom` (13-adoption-features §1). Mapping the code threw
 * all of that away and told a paralegal to "ask the assigned attorney" when the
 * server had already said it was James Okafor.
 *
 * The same product got this right on the other path the whole time —
 * `StatusControl` renders `error.message` verbatim for the same code — so one
 * error code produced two levels of helpfulness depending on which surface you
 * hit. See `.team-5/findings/nemi-slice-1-findings.md` finding 1.
 *
 * So: the code still selects WHAT to show. `SERVER_MESSAGE_CODES` is an
 * ALLOWLIST of codes whose server prose is written for the user and safe to
 * render. It is an allowlist rather than a denylist on purpose — it fails
 * closed. A code added later shows curated copy until someone deliberately
 * decides its server message is fit to display, which is the right default for
 * a product holding privileged matter content. `INTERNAL_ERROR` is the case
 * that must never leak server text, and under an allowlist it cannot.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The fallback copy is deliberately plain and non-technical. An attorney
 * reading "Request failed with status 500" learns nothing they can act on.
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

/**
 * Codes whose server message is composed for the user and may be rendered.
 *
 * Everything absent from this list falls back to `MESSAGES`, including — and
 * especially — `INTERNAL_ERROR`, whose message is deliberately contentless and
 * whose detail belongs in Sentry, never on screen.
 */
const SERVER_MESSAGE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  ERROR_CODES.MATTER_ACCESS_DENIED,
  ERROR_CODES.INVALID_STATUS_TRANSITION,
]);

export interface ErrorStateProps {
  code?: ErrorCode;
  /**
   * The server's message. Rendered only when `code` is in
   * `SERVER_MESSAGE_CODES`; otherwise ignored in favour of the mapped copy.
   */
  message?: string;
  /**
   * The error envelope's `details`.
   *
   * Currently unread. It is on the props because the *action* half of
   * 13-adoption-features §1 — a control that requests access from
   * `details.requestAccessFrom` — has no endpoint behind it in slice 1, and a
   * button that does nothing is a faked integration. When that endpoint lands,
   * this is where it wires in. Passing the field now keeps the call sites
   * unchanged at that point.
   */
  details?: Record<string, string[]> | null;
  /** Correlation ID. Shown so a support request can quote it and be findable. */
  requestId?: string;
  action?: ReactNode;
}

export function ErrorState({
  code,
  message: serverMessage,
  requestId,
  action,
}: ErrorStateProps): React.JSX.Element {
  const useServerMessage =
    code !== undefined && SERVER_MESSAGE_CODES.has(code) && Boolean(serverMessage);

  const message = useServerMessage
    ? (serverMessage as string)
    : ((code ? MESSAGES[code] : undefined) ??
      MESSAGES[ERROR_CODES.INTERNAL_ERROR] ??
      'Something went wrong.');

  return (
    <div className={styles.wrap} role="alert" data-testid="ui-error-state" data-error-code={code}>
      <p className={styles.message} data-testid="ui-error-message">
        {message}
      </p>
      {action ? <div>{action}</div> : null}
      {requestId ? <p className={styles.requestId}>Reference: {requestId}</p> : null}
    </div>
  );
}
