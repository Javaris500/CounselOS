'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { REFERRAL_SOURCE_TYPES, TRANSACTION_TYPES } from '@counselos/shared';

import { Button, Dialog, Field, Select, applyServerErrors, useToast, useZodForm } from '@/components/ui';
import { createTransaction } from '@/lib/api/mutations';

import {
  createTransactionFormSchema,
  toCreateBody,
  type CreateTransactionForm,
} from './create-transaction.schema';
import { TRANSACTION_TYPE_LABELS } from './status-ladder';
import type { TransactionDetail } from './transaction.types';
import styles from './CreateTransactionDialog.module.css';

const REFERRAL_LABELS: Record<string, string> = {
  REALTOR: 'Realtor',
  PAST_CLIENT: 'Past client',
  ATTORNEY: 'Attorney',
  LENDER: 'Lender',
  TITLE_COMPANY: 'Title company',
  WEB_SEARCH: 'Web search',
  WALK_IN: 'Walk-in',
  OTHER: 'Other',
};

/**
 * Opening a matter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO TRANSACTION NUMBER FIELD, AND NO STATUS FIELD.
 *
 * The number is generated server-side and unique per firm; a client-side guess
 * races a concurrent create. Status always starts at INTAKE — offering it here
 * would be a way around the transition map. Neither is an omission.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * REFERRAL SOURCE IS ON THIS FORM ON PURPOSE. It is unrecoverable after intake
 * (16 §2.2) — nobody remembers who referred a matter eighteen months later, so
 * it is captured at the one moment it is known, or never.
 *
 * On success the attorney lands on the new matter rather than back on the
 * board: they opened it to work on it.
 */
export function CreateTransactionDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const form = useZodForm<CreateTransactionForm>(createTransactionFormSchema, {
    transactionType: 'PURCHASE',
  } as Partial<CreateTransactionForm> as never);

  const { errors } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      // Not optimistic: the server owns the number and the title, so there is
      // nothing honest to render until it answers.
      const created = await createTransaction<TransactionDetail>(toCreateBody(values));
      form.reset();
      onClose();
      router.push(`/transactions/${created.id}`);
    } catch (error) {
      try {
        // A 422 lands on the offending field; anything else re-throws to here.
        applyServerErrors(form, error);
      } catch {
        toast('error', 'That matter could not be created. Nothing was saved.');
      }
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New matter"
      testId="transaction-create-dialog"
      footer={
        <>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            onClick={() => void submit()}
            data-testid="transaction-create-submit"
          >
            Open matter
          </Button>
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Type" htmlFor="transactionType" error={errors.transactionType?.message}>
          <Select
            id="transactionType"
            testId="transaction-type-select"
            options={TRANSACTION_TYPES.map((type) => ({
              value: type,
              label: TRANSACTION_TYPE_LABELS[type] ?? type,
            }))}
            {...form.register('transactionType')}
          />
        </Field>

        <Field
          label="Property address"
          htmlFor="propertyAddress"
          error={errors.propertyAddress?.message}
          hint="Street address. City defaults to Austin."
        >
          <input
            id="propertyAddress"
            className={styles.input}
            data-testid="transaction-address-input"
            {...form.register('propertyAddress')}
          />
        </Field>

        <div className={styles.row}>
          <Field label="Buyer" htmlFor="buyerName" error={errors.buyerName?.message}>
            <input
              id="buyerName"
              className={styles.input}
              data-testid="transaction-buyer-input"
              {...form.register('buyerName')}
            />
          </Field>
          <Field label="Seller" htmlFor="sellerName" error={errors.sellerName?.message}>
            <input
              id="sellerName"
              className={styles.input}
              data-testid="transaction-seller-input"
              {...form.register('sellerName')}
            />
          </Field>
        </div>

        <Field
          label="Title"
          htmlFor="title"
          error={errors.title?.message}
          hint="Leave blank and CounselOS names it from the parties and address."
        >
          <input
            id="title"
            className={styles.input}
            data-testid="transaction-title-input"
            {...form.register('title')}
          />
        </Field>

        <div className={styles.row}>
          <Field
            label="Effective date"
            htmlFor="effectiveDate"
            error={errors.effectiveDate?.message}
            hint="The anchor every deadline is calculated from."
          >
            <input
              id="effectiveDate"
              type="date"
              className={styles.input}
              data-testid="transaction-effective-date-input"
              {...form.register('effectiveDate')}
            />
          </Field>
          <Field label="Closing date" htmlFor="closingDate" error={errors.closingDate?.message}>
            <input
              id="closingDate"
              type="date"
              className={styles.input}
              data-testid="transaction-closing-date-input"
              {...form.register('closingDate')}
            />
          </Field>
        </div>

        <div className={styles.row}>
          <Field label="Purchase price" htmlFor="purchasePrice" error={errors.purchasePrice?.message}>
            <input
              id="purchasePrice"
              inputMode="decimal"
              className={styles.input}
              placeholder="615000.00"
              data-testid="transaction-price-input"
              {...form.register('purchasePrice')}
            />
          </Field>
          <Field
            label="Earnest money"
            htmlFor="earnestMoneyAmount"
            error={errors.earnestMoneyAmount?.message}
          >
            <input
              id="earnestMoneyAmount"
              inputMode="decimal"
              className={styles.input}
              placeholder="6150.00"
              data-testid="transaction-earnest-input"
              {...form.register('earnestMoneyAmount')}
            />
          </Field>
        </div>

        <div className={styles.row}>
          <Field
            label="Referral source"
            htmlFor="referralSourceType"
            error={errors.referralSourceType?.message}
            hint="Capture it now — it cannot be reconstructed later."
          >
            <Select
              id="referralSourceType"
              placeholder="Not recorded"
              testId="transaction-referral-select"
              options={REFERRAL_SOURCE_TYPES.map((type) => ({
                value: type,
                label: REFERRAL_LABELS[type] ?? type,
              }))}
              {...form.register('referralSourceType')}
            />
          </Field>
          <Field
            label="Referred by"
            htmlFor="referralSourceName"
            error={errors.referralSourceName?.message}
          >
            <input
              id="referralSourceName"
              className={styles.input}
              data-testid="transaction-referral-name-input"
              {...form.register('referralSourceName')}
            />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
