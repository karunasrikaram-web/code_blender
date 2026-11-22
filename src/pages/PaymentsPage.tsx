import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { CreditCard } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Table from '../components/ui/Table';
import type { TableColumn } from '../components/ui/Table';
import { listInvoices, listPayments, recordPayment, reversePayment, todayIso } from '../services/api';
import { PAYMENT_METHODS } from '../types';
import type { Invoice, InvoiceStatus, Payment, PaymentMethod } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

const STATUS_LABELS: Record<InvoiceStatus, 'Draft' | 'Pending' | 'Partially Paid' | 'Paid' | 'Overdue'> = {
  draft: 'Draft',
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
};

interface PaymentForm {
  invoiceId: string;
  /** Kept as a string so partially typed numbers can be edited. */
  amount: string;
  paymentDate: string;
  method: PaymentMethod;
  notes: string;
}

interface PaymentFormErrors {
  invoice?: string;
  amount?: string;
  paymentDate?: string;
  method?: string;
}

function createEmptyForm(): PaymentForm {
  return {
    invoiceId: '',
    amount: '',
    paymentDate: todayIso(),
    method: PAYMENT_METHODS[0],
    notes: '',
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message !== '' ? err.message : 'Something went wrong. Please try again.';
}

/** Compares money in whole cents so floating-point noise cannot cause false errors. */
function toCents(value: number): number {
  return Math.round(value * 100);
}

function validateForm(form: PaymentForm, invoice: Invoice | null): PaymentFormErrors {
  const errors: PaymentFormErrors = {};

  if (!invoice) {
    errors.invoice = 'Select an invoice.';
  }

  const amountText = form.amount.trim();
  const amount = Number(amountText);
  if (amountText === '') {
    errors.amount = 'Enter a payment amount.';
  } else if (!Number.isFinite(amount) || !(amount > 0)) {
    errors.amount = 'Amount must be greater than zero.';
  } else if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    errors.amount = 'Amount can have at most two decimal places.';
  } else if (invoice && toCents(amount) > toCents(invoice.balanceDue)) {
    errors.amount = `Amount cannot exceed the remaining balance of ${formatCurrency(invoice.balanceDue)}.`;
  }

  if (!form.paymentDate) {
    errors.paymentDate = 'Payment date is required.';
  }

  if (!(PAYMENT_METHODS as readonly string[]).includes(form.method)) {
    errors.method = 'Select a payment method.';
  }

  return errors;
}

function hasErrors(errors: PaymentFormErrors): boolean {
  return Boolean(errors.invoice || errors.amount || errors.paymentDate || errors.method);
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<PaymentForm>(createEmptyForm);
  const [errors, setErrors] = useState<PaymentFormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pendingReverse, setPendingReverse] = useState<Payment | null>(null);
  const [isReversing, setIsReversing] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [paymentRows, invoiceRows] = await Promise.all([listPayments(), listInvoices()]);
      setPayments(paymentRows);
      setInvoices(invoiceRows);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Only invoices with a remaining balance can take a payment. Draft invoices
  // are refused by record_payment, so they are left out of the selector too.
  const payableInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.balanceDue > 0 && invoice.status !== 'draft'),
    [invoices],
  );

  const selectedInvoice = payableInvoices.find((invoice) => invoice.id === form.invoiceId) ?? null;

  // If the selected invoice drops out of the payable list after a reload
  // (fully paid, or reversed to draft), clear the selection.
  useEffect(() => {
    setForm((prev) =>
      prev.invoiceId !== '' && !payableInvoices.some((invoice) => invoice.id === prev.invoiceId)
        ? { ...prev, invoiceId: '' }
        : prev,
    );
  }, [payableInvoices]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const validation = validateForm(form, selectedInvoice);
    setErrors(validation);
    setSaveError(null);
    if (hasErrors(validation) || !selectedInvoice) return;

    setIsSaving(true);
    try {
      await recordPayment({
        invoiceId: selectedInvoice.id,
        amount: Number(form.amount.trim()),
        paymentDate: form.paymentDate,
        method: form.method,
        notes: form.notes,
      });
      setForm(createEmptyForm());
      setErrors({});
      await loadAll();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  function closeReverse() {
    if (isReversing) return;
    setPendingReverse(null);
    setReverseError(null);
  }

  async function confirmReverse() {
    if (!pendingReverse || isReversing) return;
    setIsReversing(true);
    setReverseError(null);
    try {
      await reversePayment(pendingReverse.id);
      setPendingReverse(null);
      await loadAll();
    } catch (err) {
      setReverseError(errorMessage(err));
    } finally {
      setIsReversing(false);
    }
  }

  const columns: TableColumn<Payment>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (payment) => formatDate(payment.paymentDate),
    },
    {
      key: 'invoice',
      header: 'Invoice number',
      render: (payment) => <span className="invoices-number">{payment.invoiceNumber}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (payment) => payment.customerName,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (payment) => <span className="num">{formatCurrency(payment.amount)}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      render: (payment) => payment.method,
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (payment) => payment.notes || '—',
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (payment) => (
        <div className="table-actions">
          <Button variant="ghost" size="sm" onClick={() => setPendingReverse(payment)}>
            Reverse
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Record incoming payments and match them to invoices and customers."
      />

      {loadError && (
        <p className="field-error">
          {loadError}{' '}
          <Button variant="ghost" size="sm" onClick={() => void loadAll()}>
            Retry
          </Button>
        </p>
      )}

      <Card title="Record payment">
        <form noValidate className="invoice-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <div className="form-full">
              <label className="label" htmlFor="payment-invoice">
                Invoice
              </label>
              <select
                id="payment-invoice"
                className={`input${errors.invoice ? ' is-invalid' : ''}`}
                value={form.invoiceId}
                disabled={isLoading}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setForm((prev) => ({ ...prev, invoiceId: event.target.value, amount: '' }));
                  setErrors((prev) => ({ ...prev, invoice: undefined, amount: undefined }));
                }}
              >
                <option value="">{isLoading ? 'Loading invoices…' : 'Select an invoice'}</option>
                {payableInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {`${invoice.invoiceNumber} · ${invoice.customerName} · Remaining ${formatCurrency(invoice.balanceDue)}`}
                  </option>
                ))}
              </select>
              {errors.invoice && <p className="field-error">{errors.invoice}</p>}
              {!isLoading && !loadError && payableInvoices.length === 0 && (
                <p className="invoice-view-note">No invoices have an outstanding balance.</p>
              )}
            </div>

            {selectedInvoice && (
              <div className="form-full">
                <dl className="invoice-details">
                  <div>
                    <dt>Total</dt>
                    <dd>{formatCurrency(selectedInvoice.totalAmount)}</dd>
                  </div>
                  <div>
                    <dt>Paid so far</dt>
                    <dd>{formatCurrency(selectedInvoice.paidAmount)}</dd>
                  </div>
                  <div>
                    <dt>Remaining</dt>
                    <dd>{formatCurrency(selectedInvoice.balanceDue)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <StatusBadge status={STATUS_LABELS[selectedInvoice.status]} />
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            <div>
              <label className="label" htmlFor="payment-amount">
                Amount
              </label>
              <input
                id="payment-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                max={selectedInvoice ? selectedInvoice.balanceDue : undefined}
                className={`input${errors.amount ? ' is-invalid' : ''}`}
                value={form.amount}
                disabled={!selectedInvoice}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setForm((prev) => ({ ...prev, amount: event.target.value }));
                  setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
              />
              {errors.amount && <p className="field-error">{errors.amount}</p>}
            </div>

            <div>
              <label className="label" htmlFor="payment-date">
                Payment date
              </label>
              <input
                id="payment-date"
                type="date"
                className={`input${errors.paymentDate ? ' is-invalid' : ''}`}
                value={form.paymentDate}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setForm((prev) => ({ ...prev, paymentDate: event.target.value }));
                  setErrors((prev) => ({ ...prev, paymentDate: undefined }));
                }}
              />
              {errors.paymentDate && <p className="field-error">{errors.paymentDate}</p>}
            </div>

            <div>
              <label className="label" htmlFor="payment-method">
                Payment method
              </label>
              <select
                id="payment-method"
                className={`input${errors.method ? ' is-invalid' : ''}`}
                value={form.method}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  const method = PAYMENT_METHODS.find((option) => option === event.target.value);
                  setForm((prev) => ({ ...prev, method: method ?? prev.method }));
                  setErrors((prev) => ({ ...prev, method: undefined }));
                }}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              {errors.method && <p className="field-error">{errors.method}</p>}
            </div>

            <div className="form-full">
              <label className="label" htmlFor="payment-notes">
                Notes
              </label>
              <textarea
                id="payment-notes"
                className="input"
                rows={2}
                placeholder="Optional reference or remark"
                value={form.notes}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
            </div>
          </div>

          {saveError && <p className="field-error">{saveError}</p>}

          <div className="invoice-form-actions">
            <Button type="submit" disabled={isSaving || isLoading}>
              {isSaving ? 'Recording…' : 'Record payment'}
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Payment history">
        {isLoading ? (
          <p className="invoice-view-note">Loading payments…</p>
        ) : loadError ? null : payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments recorded"
            description="Recorded payments will appear here."
          />
        ) : (
          <Table columns={columns} rows={payments} getRowKey={(payment) => payment.id} />
        )}
      </Card>

      <Modal
        open={pendingReverse !== null}
        title="Reverse payment"
        onClose={closeReverse}
        footer={
          <>
            <Button variant="secondary" onClick={closeReverse} disabled={isReversing}>
              Cancel
            </Button>
            <Button onClick={() => void confirmReverse()} disabled={isReversing}>
              {isReversing ? 'Reversing…' : 'Reverse'}
            </Button>
          </>
        }
      >
        {pendingReverse && (
          <>
            <p>
              Reverse the payment of <strong>{formatCurrency(pendingReverse.amount)}</strong> on invoice{' '}
              <strong>{pendingReverse.invoiceNumber}</strong>? The invoice balance will be restored.
            </p>
            {reverseError && <p className="field-error">{reverseError}</p>}
          </>
        )}
      </Modal>
    </div>
  );
}
