'use client';

import { useState } from 'react';
import { OUTCOME_REASONS, type TransactionStatus } from '@counselos/shared';

import { Badge, Button, Dialog, Field, Select, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { updateTransactionStatus } from '@/lib/api/mutations';

import { OUTCOME_LABELS, STATUS_LABELS, STATUS_TONES } from './status-ladder';
import type { TransactionDetail } from './transaction.types';
import styles from './StatusControl.module.css';

const OUTCOME_NOTES_MAX = 500;

/**
 * Moving a matter along the ladder.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THREE RULES, ALL LOAD-BEARING.
 *
 * 1. NEVER OPTIMISTIC. A status is a legal state. Rendering a transition the
 *    server may reject is worse than a moment of pending — the attorney walks
 *    away believing a matter closed. The control disables and waits.
 *
 * 2. A REJECTION RENDERS ITS REASON AND THE LEGAL NEXT STATES. Never "Could
 *    not update". `INVALID_STATUS_TRANSITION` returns
 *    `details.allowedTransitions`, and those become buttons the attorney can
 *    actually press. A bare failure teaches nothing and files a support ticket.
 *
 * 3. A TERMINAL TRANSITION PROMPTS FOR THE OUTCOME, AND WILL NOT PROCEED
 *    WITHOUT IT. `outcome_reason` is unrecoverable (16 §2.3): the attorney
 *    knows why the deal died at this exact moment and never again. The server
 *    refuses a close without it; this dialog is why that refusal should never
 *    be what the attorney sees.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * The offered options come from `transaction.allowedTransitions`, which the
 * SERVER computed from its transition map. There is no ladder in this file.
 */
export function StatusControl({
  transaction,
}: {
  transaction: TransactionDetail;
}): React.JSX.Element {
  const { toast } = useToast();

  const [pending, setPending] = useState<TransactionStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rejection, setRejection] = useState<{ message: string; allowed: string[] } | null>(null);
  const [outcomeReason, setOutcomeReason] = useState('');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [outcomeError, setOutcomeError] = useState<string | undefined>(undefined);

  const terminalPending = pending === 'CLOSED' || pending === 'FALLEN_THROUGH';

  const reset = (): void => {
    setPending(null);
    setOutcomeReason('');
    setOutcomeNotes('');
    setOutcomeError(undefined);
  };

  async function commit(next: TransactionStatus, outcome?: Record<string, string>): Promise<void> {
    setSubmitting(true);
    setRejection(null);
    try {
      await updateTransactionStatus(transaction.id, { status: next, ...outcome });
      reset();
      toast('success', `Moved to ${STATUS_LABELS[next]}.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_STATUS_TRANSITION') {
        // The server's reasoning, rendered. Not our own.
        setRejection({
          message: error.message,
          allowed: error.details?.allowedTransitions ?? [],
        });
        reset();
      } else if (error instanceof ApiError && error.fieldErrors.outcomeReason) {
        setOutcomeError(error.fieldErrors.outcomeReason[0]);
      } else if (error instanceof ApiError && error.code === 'MATTER_ACCESS_DENIED') {
        toast('error', error.message);
        reset();
      } else {
        toast('error', 'The status could not be changed. Nothing was saved.');
        reset();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const start = (next: TransactionStatus): void => {
    setRejection(null);
    setPending(next);
    // A non-terminal move needs no extra information — go straight through.
    if (next !== 'CLOSED' && next !== 'FALLEN_THROUGH') void commit(next);
  };

  return (
    <section className={styles.wrap} data-testid="transaction-status-control">
      <div className={styles.current}>
        <span className={styles.label}>Status</span>
        <Badge tone={STATUS_TONES[transaction.status]}>
          {STATUS_LABELS[transaction.status]}
        </Badge>
      </div>

      {transaction.allowedTransitions.length === 0 ? (
        <p className={styles.terminal} data-testid="transaction-status-terminal">
          This matter is closed. A closed matter has no further transitions — a deal that reopens
          is a new matter.
        </p>
      ) : (
        <div className={styles.actions}>
          {transaction.allowedTransitions.map((next) => (
            <Button
              key={next}
              variant={next === 'FALLEN_THROUGH' ? 'danger' : 'secondary'}
              // Genuinely disabled while in flight — never optimistic.
              loading={submitting && pending === next}
              disabled={submitting}
              onClick={() => start(next)}
              data-testid={`status-move-${next.toLowerCase().replaceAll('_', '-')}-btn`}
            >
              {STATUS_LABELS[next]}
            </Button>
          ))}
        </div>
      )}

      {/*
        THE HARD STOP MADE VISIBLE. A refused transition explains itself and
        offers what IS legal, rather than a toast saying it failed.
      */}
      {rejection === null ? null : (
        <div className={styles.rejection} role="alert" data-testid="transaction-status-rejected">
          <p className={styles.rejectionMessage}>{rejection.message}</p>
          {rejection.allowed.length === 0 ? (
            <p className={styles.rejectionHint}>There are no transitions available from here.</p>
          ) : (
            <p className={styles.rejectionHint}>
              From {STATUS_LABELS[transaction.status]} this matter can move to{' '}
              <strong>
                {rejection.allowed
                  .map((s) => STATUS_LABELS[s as TransactionStatus] ?? s)
                  .join(', ')}
              </strong>
              .
            </p>
          )}
        </div>
      )}

      <Dialog
        open={terminalPending}
        onClose={reset}
        title={pending === 'CLOSED' ? 'Close this matter' : 'Mark this matter as fallen through'}
        // A real decision: Escape must not skip the one question that cannot be
        // answered later.
        dismissible={false}
        testId="transaction-outcome-dialog"
        footer={
          <>
            <Button onClick={reset} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={submitting}
              onClick={() => {
                if (outcomeReason === '') {
                  setOutcomeError('Choose an outcome — this cannot be recorded later.');
                  return;
                }
                void commit(pending as TransactionStatus, {
                  outcomeReason,
                  ...(outcomeNotes === '' ? {} : { outcomeNotes }),
                });
              }}
              data-testid="transaction-outcome-submit"
            >
              {pending === 'CLOSED' ? 'Close matter' : 'Mark fallen through'}
            </Button>
          </>
        }
      >
        <p className={styles.outcomeIntro}>
          This is the only moment this can be captured. Six months from now nobody reconstructs why
          a deal ended, and it is what makes “what kills our deals?” answerable.
        </p>

        <Field label="Outcome" htmlFor="outcomeReason" error={outcomeError}>
          <Select
            id="outcomeReason"
            placeholder="Choose an outcome"
            value={outcomeReason}
            invalid={outcomeError !== undefined}
            testId="transaction-outcome-select"
            onChange={(event) => {
              setOutcomeReason(event.target.value);
              setOutcomeError(undefined);
            }}
            options={OUTCOME_REASONS.map((reason) => ({
              value: reason,
              label: OUTCOME_LABELS[reason] ?? reason,
            }))}
          />
        </Field>

        <Field
          label="Notes"
          htmlFor="outcomeNotes"
          hint={`Optional. ${String(OUTCOME_NOTES_MAX - outcomeNotes.length)} characters left.`}
        >
          <textarea
            id="outcomeNotes"
            className={styles.textarea}
            maxLength={OUTCOME_NOTES_MAX}
            rows={3}
            value={outcomeNotes}
            onChange={(event) => setOutcomeNotes(event.target.value)}
            data-testid="transaction-outcome-notes"
          />
        </Field>
      </Dialog>
    </section>
  );
}
