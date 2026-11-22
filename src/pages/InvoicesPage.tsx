import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Table from '../components/ui/Table';
import type { TableColumn } from '../components/ui/Table';
import {
  deleteInvoice,
  getInvoice,
  listCustomers,
  listInvoices,
  listPaymentsByInvoice,
  nextInvoiceNumber,
  saveInvoice,
} from '../services/api';
import { downloadInvoicePdf } from '../lib/invoicePdf';
import type { Customer, Invoice, InvoiceStatus, Payment } from '../types';
import { formatCurrency, formatDate } from '../utils/format';

/** Statuses the form may write. 'overdue', 'partially_paid' and 'paid' are derived by the DB. */
type FormStatus = 'draft' | 'pending';
type StatusFilter = 'All' | InvoiceStatus;

const STATUS_FILTERS: StatusFilter[] = ['All', 'draft', 'pending', 'partially_paid', 'paid', 'overdue'];

const STATUS_LABELS: Record<InvoiceStatus, 'Draft' | 'Pending' | 'Partially Paid' | 'Paid' | 'Overdue'> = {
  draft: 'Draft',
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
};

const EDIT_BLOCKED_MESSAGE = 'Invoices with payments cannot be edited. Reverse the payments first.';

interface LineItem {
  id: string;
  description: string;
  /** Kept as strings so partially typed numbers can be edited. */
  quantity: string;
  unitPrice: string;
}

interface InvoiceForm {
  customerId: string;
  issueDate: string;
  dueDate: string;
  lines: LineItem[];
  notes: string;
  status: FormStatus;
}

interface InvoiceFormErrors {
  customer?: string;
  issueDate?: string;
  dueDate?: string;
  items?: string;
  lines: Record<string, string>;
}

let lineSequence = 0;

function createLine(): LineItem {
  lineSequence += 1;
  return { id: `line-${lineSequence}`, description: '', quantity: '1', unitPrice: '' };
}

function toDateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function createEmptyForm(): InvoiceForm {
  const today = new Date();
  return {
    customerId: '',
    issueDate: toDateInputValue(today),
    dueDate: toDateInputValue(addDays(today, 30)),
    lines: [createLine()],
    notes: '',
    status: 'pending',
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message !== '' ? err.message : 'Something went wrong. Please try again.';
}

/** Client-side amount for display only; the database computes the stored totals. */
function lineTotal(line: LineItem): number {
  return (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
}

function validateForm(form: InvoiceForm): InvoiceFormErrors {
  const errors: InvoiceFormErrors = { lines: {} };

  if (!form.customerId) errors.customer = 'Select a customer.';

  if (!form.issueDate) errors.issueDate = 'Issue date is required.';
  if (!form.dueDate) {
    errors.dueDate = 'Due date is required.';
  } else if (form.issueDate && form.dueDate < form.issueDate) {
    errors.dueDate = 'Due date must be on or after the issue date.';
  }

  if (form.lines.length === 0) errors.items = 'Add at least one line item.';
  form.lines.forEach((line) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    if (!line.description.trim()) {
      errors.lines[line.id] = 'Enter a description.';
    } else if (!(quantity > 0)) {
      errors.lines[line.id] = 'Quantity must be greater than zero.';
    } else if (line.unitPrice.trim() === '' || !(unitPrice >= 0)) {
      errors.lines[line.id] = 'Unit price must be zero or more.';
    }
  });

  return errors;
}

function hasErrors(errors: InvoiceFormErrors): boolean {
  return Boolean(
    errors.customer || errors.issueDate || errors.dueDate || errors.items || Object.keys(errors.lines).length > 0,
  );
}

interface InvoiceDetailsViewProps {
  invoice: Invoice | null;
  payments: Payment[];
  loading: boolean;
  error: string | null;
}

function InvoiceDetailsView({ invoice, payments, loading, error }: InvoiceDetailsViewProps) {
  if (loading) {
    return <p className="invoice-view-note">Loading invoice…</p>;
  }
  if (error) {
    return <p className="field-error">{error}</p>;
  }
  if (!invoice) {
    return null;
  }
  return (
    <>
      <dl className="invoice-details">
        <div>
          <dt>Invoice number</dt>
          <dd>{invoice.invoiceNumber}</dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>{invoice.customerName}</dd>
        </div>
        <div>
          <dt>Payment status</dt>
          <dd>
            <StatusBadge status={STATUS_LABELS[invoice.status]} />
          </dd>
        </div>
        <div>
          <dt>Issue date</dt>
          <dd>{formatDate(invoice.invoiceDate)}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{formatDate(invoice.dueDate)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatCurrency(invoice.totalAmount)}</dd>
        </div>
        <div>
          <dt>Paid</dt>
          <dd>{formatCurrency(invoice.paidAmount)}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd>{formatCurrency(invoice.balanceDue)}</dd>
        </div>
      </dl>

      <h4 className="invoice-section-title">Line items</h4>
      {invoice.items.length > 0 ? (
        <ul className="invoice-view-lines">
          {invoice.items.map((line, index) => (
            <li key={line.id ?? index}>
              <span>{line.description}</span>
              <span className="num">
                {line.quantity} × {formatCurrency(line.unitPrice)} = {formatCurrency(line.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="invoice-view-note">No line items were recorded for this invoice.</p>
      )}

      {invoice.description && (
        <>
          <h4 className="invoice-section-title">Notes</h4>
          <p>{invoice.description}</p>
        </>
      )}

      <h4 className="invoice-section-title">Payments</h4>
      {payments.length > 0 ? (
        <ul className="invoice-view-lines">
          {payments.map((payment) => (
            <li key={payment.id}>
              <span>
                {formatDate(payment.paymentDate)} · {payment.method}
              </span>
              <span className="num">{formatCurrency(payment.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="invoice-view-note">No payments recorded for this invoice.</p>
      )}
    </>
  );
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [form, setForm] = useState<InvoiceForm>(createEmptyForm);
  const [errors, setErrors] = useState<InvoiceFormErrors>({ lines: {} });
  const [saveError, setSaveError] = useState<string | null>(null);

  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [viewDetail, setViewDetail] = useState<Invoice | null>(null);
  const [viewPayments, setViewPayments] = useState<Payment[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const closeView = useCallback(() => setViewing(null), []);

  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadInvoices = useCallback(async () => {
    setIsLoading(true);
    try {
      const [invoiceRows, customerRows] = await Promise.all([listInvoices(), listCustomers()]);
      setInvoices(invoiceRows);
      setCustomers(customerRows);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleInvoices = invoices.filter((invoice) => {
    if (statusFilter !== 'All' && invoice.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    return (
      invoice.invoiceNumber.toLowerCase().includes(normalizedQuery) ||
      invoice.customerName.toLowerCase().includes(normalizedQuery)
    );
  });

  // No tax or discounts in Phase 1, so the total equals the subtotal.
  const subtotal = form.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const total = subtotal;

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setSaveError(null);
  }

  async function openCreate() {
    setActionError(null);
    setEditingId(null);
    setForm(createEmptyForm());
    setErrors({ lines: {} });
    setSaveError(null);
    setInvoiceNumber('');
    setIsFormOpen(true);
    setFormLoading(true);
    try {
      setInvoiceNumber(await nextInvoiceNumber());
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setFormLoading(false);
    }
  }

  async function openEdit(invoice: Invoice) {
    setActionError(null);
    if (invoice.paidAmount > 0) {
      setActionError(EDIT_BLOCKED_MESSAGE);
      return;
    }
    setEditingId(invoice.id);
    setInvoiceNumber(invoice.invoiceNumber);
    setErrors({ lines: {} });
    setSaveError(null);
    setIsFormOpen(true);
    setFormLoading(true);
    try {
      const full = await getInvoice(invoice.id);
      if (full.paidAmount > 0) {
        closeForm();
        setActionError(EDIT_BLOCKED_MESSAGE);
        return;
      }
      setInvoiceNumber(full.invoiceNumber);
      setForm({
        customerId: full.customerId,
        issueDate: full.invoiceDate,
        dueDate: full.dueDate,
        lines:
          full.items.length > 0
            ? full.items.map((item) => ({
                id: `line-${(lineSequence += 1)}`,
                description: item.description,
                quantity: String(item.quantity),
                unitPrice: String(item.unitPrice),
              }))
            : [createLine()],
        notes: full.description,
        status: full.status === 'draft' ? 'draft' : 'pending',
      });
    } catch (err) {
      closeForm();
      setActionError(errorMessage(err));
    } finally {
      setFormLoading(false);
    }
  }

  function updateLine(id: string, patch: Partial<Omit<LineItem, 'id'>>) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }));
  }

  function addLine() {
    setForm((prev) => ({ ...prev, lines: [...prev.lines, createLine()] }));
  }

  function removeLine(id: string) {
    setForm((prev) => ({ ...prev, lines: prev.lines.filter((line) => line.id !== id) }));
  }

  async function handleSave(status: FormStatus) {
    if (formLoading || isSaving) return;
    const validation = validateForm(form);
    setErrors(validation);
    setSaveError(null);
    if (hasErrors(validation)) return;
    if (invoiceNumber.trim() === '') {
      setSaveError('The invoice number has not loaded. Cancel and try again.');
      return;
    }

    setIsSaving(true);
    try {
      await saveInvoice({
        id: editingId ?? undefined,
        customerId: form.customerId,
        invoiceNumber,
        invoiceDate: form.issueDate,
        dueDate: form.dueDate,
        description: form.notes,
        status,
        items: form.lines.map((line) => ({
          description: line.description.trim(),
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
        })),
      });
      setIsFormOpen(false);
      setEditingId(null);
      await loadInvoices();
    } catch (err) {
      setSaveError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  async function openView(invoice: Invoice) {
    setViewing(invoice);
    setViewDetail(null);
    setViewPayments([]);
    setViewError(null);
    setViewLoading(true);
    try {
      const [full, payments] = await Promise.all([getInvoice(invoice.id), listPaymentsByInvoice(invoice.id)]);
      setViewDetail(full);
      setViewPayments(payments);
    } catch (err) {
      setViewError(errorMessage(err));
    } finally {
      setViewLoading(false);
    }
  }

  function closeDelete() {
    if (isDeleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteInvoice(pendingDelete.id);
      setPendingDelete(null);
      setViewing(null);
      await loadInvoices();
    } catch (err) {
      setDeleteError(errorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  }

  const columns: TableColumn<Invoice>[] = [
    {
      key: 'number',
      header: 'Invoice number',
      render: (invoice) => <span className="invoices-number">{invoice.invoiceNumber}</span>,
    },
    {
      key: 'customer',
      header: 'Customer name',
      render: (invoice) => <span className="invoices-name">{invoice.customerName}</span>,
    },
    {
      key: 'amount',
      header: 'Invoice amount',
      align: 'right',
      render: (invoice) => formatCurrency(invoice.totalAmount),
    },
    {
      key: 'created',
      header: 'Creation date',
      render: (invoice) => formatDate(invoice.invoiceDate),
    },
    {
      key: 'due',
      header: 'Due date',
      render: (invoice) => formatDate(invoice.dueDate),
    },
    {
      key: 'status',
      header: 'Payment status',
      render: (invoice) => <StatusBadge status={STATUS_LABELS[invoice.status]} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (invoice) => (
        <div className="table-actions">
          <Button variant="ghost" size="sm" onClick={() => void openView(invoice)}>
            View
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void openEdit(invoice)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPendingDelete(invoice)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Create, track and follow up on every invoice in one place."
        actions={
          <Button onClick={() => void openCreate()} disabled={isFormOpen}>
            <Plus size={16} />
            Create invoice
          </Button>
        }
      />

      {isFormOpen && (
        <Card
          title={editingId ? 'Edit invoice' : 'Create invoice'}
          className="invoice-form-card"
          actions={
            <Button variant="ghost" size="sm" onClick={closeForm}>
              Cancel
            </Button>
          }
        >
          {formLoading ? (
            <p className="invoice-view-note">Loading invoice…</p>
          ) : (
            <form
              noValidate
              className="invoice-form"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void handleSave(form.status);
              }}
            >
              <div className="form-grid">
                <div>
                  <label className="label" htmlFor="invoice-customer">
                    Customer
                  </label>
                  <select
                    id="invoice-customer"
                    className={`input${errors.customer ? ' is-invalid' : ''}`}
                    value={form.customerId}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setForm((prev) => ({ ...prev, customerId: event.target.value }))
                    }
                  >
                    <option value="">Select a customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  {errors.customer && <p className="field-error">{errors.customer}</p>}
                </div>

                <div>
                  <span className="label">Invoice number</span>
                  <div className="input invoice-number">{invoiceNumber}</div>
                </div>

                <div>
                  <label className="label" htmlFor="invoice-issue-date">
                    Issue date
                  </label>
                  <input
                    id="invoice-issue-date"
                    type="date"
                    className={`input${errors.issueDate ? ' is-invalid' : ''}`}
                    value={form.issueDate}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setForm((prev) => ({ ...prev, issueDate: event.target.value }))
                    }
                  />
                  {errors.issueDate && <p className="field-error">{errors.issueDate}</p>}
                </div>

                <div>
                  <label className="label" htmlFor="invoice-due-date">
                    Due date
                  </label>
                  <input
                    id="invoice-due-date"
                    type="date"
                    className={`input${errors.dueDate ? ' is-invalid' : ''}`}
                    value={form.dueDate}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setForm((prev) => ({ ...prev, dueDate: event.target.value }))
                    }
                  />
                  {errors.dueDate && <p className="field-error">{errors.dueDate}</p>}
                </div>

                <div className="form-full">
                  <span className="label">Line items</span>
                  <div className="invoice-lines">
                    <div className="invoice-line invoice-line-head" aria-hidden="true">
                      <span>Description</span>
                      <span>Qty</span>
                      <span>Unit price</span>
                      <span className="num">Amount</span>
                      <span />
                    </div>

                    {form.lines.map((line) => {
                      const lineError = errors.lines[line.id];
                      return (
                        <div className="invoice-line" key={line.id}>
                          <div className="invoice-line-description">
                            <input
                              type="text"
                              className={`input${lineError ? ' is-invalid' : ''}`}
                              aria-label="Line item description"
                              placeholder="e.g. Homepage design"
                              value={line.description}
                              onChange={(event) => updateLine(line.id, { description: event.target.value })}
                            />
                            {lineError && <p className="field-error">{lineError}</p>}
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="input"
                            aria-label="Quantity"
                            value={line.quantity}
                            onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input"
                            aria-label="Unit price"
                            value={line.unitPrice}
                            onChange={(event) => updateLine(line.id, { unitPrice: event.target.value })}
                          />
                          <span className="invoice-line-total num">{formatCurrency(lineTotal(line))}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="invoice-line-remove"
                            aria-label="Remove line item"
                            onClick={() => removeLine(line.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      );
                    })}
                  </div>

                  {errors.items && <p className="field-error">{errors.items}</p>}

                  <div className="invoice-line-actions">
                    <Button variant="secondary" size="sm" onClick={addLine}>
                      <Plus size={14} />
                      Add line item
                    </Button>
                  </div>

                  <dl className="invoice-totals">
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{formatCurrency(subtotal)}</dd>
                    </div>
                    <div className="invoice-totals-total">
                      <dt>Total</dt>
                      <dd>{formatCurrency(total)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="form-full">
                  <label className="label" htmlFor="invoice-notes">
                    Notes
                  </label>
                  <textarea
                    id="invoice-notes"
                    className="input"
                    rows={3}
                    placeholder="Payment terms, bank details or a thank-you note"
                    value={form.notes}
                    onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                      setForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="label" htmlFor="invoice-status">
                    Status
                  </label>
                  <select
                    id="invoice-status"
                    className="input"
                    value={form.status}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setForm((prev) => ({
                        ...prev,
                        status: event.target.value === 'draft' ? 'draft' : 'pending',
                      }))
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              {saveError && <p className="field-error">{saveError}</p>}

              <div className="invoice-form-actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSaving}
                  onClick={() => void handleSave('draft')}
                >
                  Save as draft
                </Button>
                <Button type="submit" disabled={isSaving}>
                  Save invoice
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {actionError && <p className="field-error">{actionError}</p>}

      {loadError && (
        <p className="field-error">
          {loadError}{' '}
          <Button variant="ghost" size="sm" onClick={() => void loadInvoices()}>
            Retry
          </Button>
        </p>
      )}

      <div className="invoices-toolbar">
        <div className="invoices-search">
          <Search size={16} className="invoices-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="input invoices-search-input"
            placeholder="Search by invoice number or customer"
            aria-label="Search invoices"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          className="input invoices-filter"
          aria-label="Filter by payment status"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(STATUS_FILTERS.find((status) => status === event.target.value) ?? 'All')
          }
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {status === 'All' ? 'All statuses' : STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="invoice-view-note">Loading invoices…</p>
      ) : loadError ? null : visibleInvoices.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices found"
          description="Try a different search or status filter, or create a new invoice."
        />
      ) : (
        <div className="invoices-table">
          <Table columns={columns} rows={visibleInvoices} getRowKey={(invoice) => invoice.id} />
        </div>
      )}

      <Modal
        open={viewing !== null}
        title={viewing ? `Invoice ${viewing.invoiceNumber}` : 'Invoice'}
        onClose={closeView}
        footer={
          <>
            {viewDetail && (
              <Button
                variant="secondary"
                onClick={() =>
                  downloadInvoicePdf({
                    invoiceNumber: viewDetail.invoiceNumber,
                    invoiceDate: viewDetail.invoiceDate,
                    dueDate: viewDetail.dueDate,
                    status: viewDetail.status,
                    description: viewDetail.description,
                    customerName: viewDetail.customerName,
                    items: viewDetail.items.map((item) => ({
                      description: item.description,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      lineTotal: item.lineTotal,
                    })),
                    subtotal: viewDetail.subtotal,
                    totalAmount: viewDetail.totalAmount,
                    paidAmount: viewDetail.paidAmount,
                  })
                }
              >
                Download PDF
              </Button>
            )}
            <Button variant="secondary" onClick={closeView}>
              Close
            </Button>
          </>
        }
      >
        <InvoiceDetailsView
          invoice={viewDetail}
          payments={viewPayments}
          loading={viewLoading}
          error={viewError}
        />
      </Modal>

      <Modal
        open={pendingDelete !== null}
        title="Delete invoice"
        onClose={closeDelete}
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete} disabled={isDeleting}>
              Cancel
            </Button>
            <Button onClick={() => void confirmDelete()} disabled={isDeleting}>
              Delete
            </Button>
          </>
        }
      >
        {pendingDelete && (
          <>
            <p>
              Delete invoice <strong>{pendingDelete.invoiceNumber}</strong>? This cannot be undone.
            </p>
            {deleteError && <p className="field-error">{deleteError}</p>}
          </>
        )}
      </Modal>
    </div>
  );
}
