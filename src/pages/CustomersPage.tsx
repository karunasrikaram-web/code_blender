import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Eye, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import Table from '../components/ui/Table';
import type { TableColumn } from '../components/ui/Table';
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  listInvoices,
  listPayments,
  updateCustomer,
} from '../services/api';
import type { CustomerInput } from '../services/api';
import type { Customer, Invoice, InvoiceStatus, Payment } from '../types';
import { formatCurrency } from '../utils/format';

type PaymentStatusLabel = 'Paid' | 'Partially Paid' | 'Unpaid' | 'Overdue';
/** Labels accepted by StatusBadge that this page produces. */
type BadgeStatus = 'Draft' | 'Pending' | PaymentStatusLabel;
type StatusFilter = 'All' | PaymentStatusLabel;

const STATUS_OPTIONS: PaymentStatusLabel[] = ['Paid', 'Partially Paid', 'Unpaid', 'Overdue'];
const INVOICE_STATUS_LABEL: Record<InvoiceStatus, BadgeStatus> = {
  draft: 'Draft',
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BALANCE_TOLERANCE = 0.005;

interface CustomerFormValues {
  name: string;
  email: string;
  phone: string;
  projectName: string;
  notes: string;
}

type CustomerFormErrors = Partial<Record<keyof CustomerFormValues, string>>;

interface CustomerTotals {
  billed: number;
  paid: number;
  balance: number;
  paymentStatus: PaymentStatusLabel;
}

interface CustomerSummary extends CustomerTotals {
  customer: Customer;
}

const emptyForm: CustomerFormValues = {
  name: '',
  email: '',
  phone: '',
  projectName: '',
  notes: '',
};

function toFormValues(customer: Customer): CustomerFormValues {
  return {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    projectName: customer.projectName,
    notes: customer.notes,
  };
}

function validateForm(values: CustomerFormValues): CustomerFormErrors {
  const errors: CustomerFormErrors = {};

  if (!values.name.trim()) errors.name = 'Name is required.';

  const email = values.email.trim();
  if (email !== '' && !EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';

  return errors;
}

function inputClass(error?: string): string {
  return error ? 'input is-invalid' : 'input';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

/** Totals and payment status for one customer's invoices (empty list -> Unpaid, zeros). */
function summarizeInvoices(invoices: Invoice[]): CustomerTotals {
  let billed = 0;
  let paid = 0;
  let balance = 0;
  let hasOverdue = false;

  for (const invoice of invoices) {
    billed += invoice.totalAmount;
    paid += invoice.paidAmount;
    balance += invoice.balanceDue;
    if (invoice.status === 'overdue') hasOverdue = true;
  }

  let paymentStatus: PaymentStatusLabel;
  if (invoices.length > 0 && Math.abs(balance) < BALANCE_TOLERANCE) {
    paymentStatus = 'Paid';
  } else if (hasOverdue) {
    paymentStatus = 'Overdue';
  } else if (paid > 0) {
    paymentStatus = 'Partially Paid';
  } else {
    paymentStatus = 'Unpaid';
  }

  return {
    billed: round2(billed),
    paid: round2(paid),
    balance: round2(balance),
    paymentStatus,
  };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewPayments, setViewPayments] = useState<Payment[]>([]);
  const [viewPaymentsLoading, setViewPaymentsLoading] = useState(false);
  const [viewPaymentsError, setViewPaymentsError] = useState<string | null>(null);

  /** null = form closed; `id: null` = adding a new customer. */
  const [formTarget, setFormTarget] = useState<{ id: string | null } | null>(null);
  const [form, setForm] = useState<CustomerFormValues>(emptyForm);
  const [errors, setErrors] = useState<CustomerFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const viewingCustomer = customers.find((customer) => customer.id === viewingId) ?? null;

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [nextCustomers, nextInvoices] = await Promise.all([listCustomers(), listInvoices()]);
      setCustomers(nextCustomers);
      setInvoices(nextInvoices);
    } catch (error: unknown) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (viewingId === null) return;
    let cancelled = false;
    setViewPayments([]);
    setViewPaymentsError(null);
    setViewPaymentsLoading(true);
    listPayments({ customerId: viewingId })
      .then((rows) => {
        if (!cancelled) setViewPayments(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) setViewPaymentsError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setViewPaymentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewingId]);

  const summaries = useMemo<CustomerSummary[]>(() => {
    const invoicesByCustomer = new Map<string, Invoice[]>();
    for (const invoice of invoices) {
      const list = invoicesByCustomer.get(invoice.customerId) ?? [];
      list.push(invoice);
      invoicesByCustomer.set(invoice.customerId, list);
    }
    return customers.map((customer) => ({
      customer,
      ...summarizeInvoices(invoicesByCustomer.get(customer.id) ?? []),
    }));
  }, [customers, invoices]);

  const filteredSummaries = useMemo(() => {
    const search = query.trim().toLowerCase();
    return summaries.filter((summary) => {
      const matchesStatus = statusFilter === 'All' || summary.paymentStatus === statusFilter;
      const matchesSearch = search === '' || summary.customer.name.toLowerCase().includes(search);
      return matchesStatus && matchesSearch;
    });
  }, [summaries, query, statusFilter]);

  const viewingInvoices = useMemo(
    () => (viewingCustomer ? invoices.filter((invoice) => invoice.customerId === viewingCustomer.id) : []),
    [invoices, viewingCustomer],
  );

  const viewingTotals = viewingCustomer ? summarizeInvoices(viewingInvoices) : null;

  function openAddForm() {
    setForm(emptyForm);
    setErrors({});
    setFormError(null);
    setFormTarget({ id: null });
  }

  function openEditForm(customer: Customer) {
    setViewingId(null);
    setForm(toFormValues(customer));
    setErrors({});
    setFormError(null);
    setFormTarget({ id: customer.id });
  }

  function closeForm() {
    if (saving) return;
    setFormTarget(null);
  }

  function openDelete(customer: Customer) {
    setDeleteError(null);
    setDeleteTarget(customer);
  }

  function closeDelete() {
    if (deleting) return;
    setDeleteTarget(null);
  }

  function handleFieldChange(field: keyof CustomerFormValues) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formTarget || saving) return;

    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const targetId = formTarget.id;
    const input: CustomerInput = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      projectName: form.projectName.trim(),
      notes: form.notes.trim(),
    };

    setSaving(true);
    setFormError(null);
    try {
      if (targetId === null) {
        await createCustomer(input);
      } else {
        await updateCustomer(targetId, input);
      }
      setFormTarget(null);
      setToast(targetId === null ? `${input.name} was added.` : `${input.name} was updated.`);
      await loadData();
    } catch (error: unknown) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;

    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCustomer(target.id);
      setDeleteTarget(null);
      setToast(`${target.name} was deleted.`);
      await loadData();
    } catch (error: unknown) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  const columns: TableColumn<CustomerSummary>[] = [
    {
      key: 'name',
      header: 'Customer name',
      render: (row) => <span className="customers-name">{row.customer.name}</span>,
    },
    { key: 'email', header: 'Email', render: (row) => row.customer.email },
    { key: 'phone', header: 'Phone', render: (row) => row.customer.phone },
    { key: 'projectName', header: 'Project name', render: (row) => row.customer.projectName },
    {
      key: 'billed',
      header: 'Total billed',
      align: 'right',
      render: (row) => formatCurrency(row.billed),
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      render: (row) => formatCurrency(row.paid),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (row) => formatCurrency(row.balance),
    },
    {
      key: 'status',
      header: 'Payment status',
      render: (row) => <StatusBadge status={row.paymentStatus} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="table-actions">
          <Button
            variant="ghost"
            size="icon"
            title="View"
            aria-label={`View ${row.customer.name}`}
            onClick={() => setViewingId(row.customer.id)}
          >
            <Eye size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Edit"
            aria-label={`Edit ${row.customer.name}`}
            onClick={() => openEditForm(row.customer)}
          >
            <Pencil size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Delete"
            aria-label={`Delete ${row.customer.name}`}
            onClick={() => openDelete(row.customer)}
          >
            <Trash2 size={18} />
          </Button>
        </div>
      ),
    },
  ];

  const invoiceColumns: TableColumn<Invoice>[] = [
    { key: 'invoiceNumber', header: 'Invoice', render: (invoice) => invoice.invoiceNumber },
    { key: 'dueDate', header: 'Due date', render: (invoice) => formatDate(invoice.dueDate) },
    { key: 'total', header: 'Total', align: 'right', render: (invoice) => formatCurrency(invoice.totalAmount) },
    { key: 'paid', header: 'Paid', align: 'right', render: (invoice) => formatCurrency(invoice.paidAmount) },
    { key: 'balance', header: 'Balance', align: 'right', render: (invoice) => formatCurrency(invoice.balanceDue) },
    {
      key: 'status',
      header: 'Status',
      render: (invoice) => <StatusBadge status={INVOICE_STATUS_LABEL[invoice.status]} />,
    },
  ];

  const paymentColumns: TableColumn<Payment>[] = [
    { key: 'date', header: 'Date', render: (payment) => formatDate(payment.paymentDate) },
    { key: 'amount', header: 'Amount', align: 'right', render: (payment) => formatCurrency(payment.amount) },
    { key: 'method', header: 'Method', render: (payment) => payment.method },
    { key: 'invoiceNumber', header: 'Invoice', render: (payment) => payment.invoiceNumber },
  ];

  const isEditing = formTarget !== null && formTarget.id !== null;

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Manage client contacts, billing totals and payment status in one place."
        actions={
          <Button onClick={openAddForm}>
            <Plus size={18} />
            Add customer
          </Button>
        }
      />

      <Card>
        <div className="customers-toolbar">
          <div className="customers-search">
            <Search size={16} className="customers-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="input customers-search-input"
              placeholder="Search by customer name"
              aria-label="Search customers"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="input customers-filter"
            aria-label="Filter by payment status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="All">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {loadError && (
          <div className="field-error" role="alert">
            <p>{loadError}</p>
            <Button variant="secondary" size="sm" onClick={() => void loadData()}>
              Retry
            </Button>
          </div>
        )}

        {loading ? (
          <p role="status">Loading customers…</p>
        ) : filteredSummaries.length > 0 ? (
          <div className="customers-table">
            <Table columns={columns} rows={filteredSummaries} getRowKey={(row) => row.customer.id} />
          </div>
        ) : loadError ? null : (
          <EmptyState
            icon={Users}
            title={customers.length === 0 ? 'No customers yet' : 'No matching customers'}
            description={
              customers.length === 0
                ? 'Add your first customer to start tracking projects and payments.'
                : 'Try a different search term or status filter.'
            }
          />
        )}
      </Card>

      {viewingCustomer && viewingTotals && (
        <Modal
          open
          title="Customer details"
          onClose={() => setViewingId(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setViewingId(null)}>
                Close
              </Button>
              <Button onClick={() => openEditForm(viewingCustomer)}>
                <Pencil size={16} />
                Edit
              </Button>
            </>
          }
        >
          <dl className="customer-details">
            <div>
              <dt>Customer name</dt>
              <dd>{viewingCustomer.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{viewingCustomer.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{viewingCustomer.phone}</dd>
            </div>
            <div>
              <dt>Payment status</dt>
              <dd>
                <StatusBadge status={viewingTotals.paymentStatus} />
              </dd>
            </div>
            <div>
              <dt>Project name</dt>
              <dd>{viewingCustomer.projectName}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{viewingCustomer.notes}</dd>
            </div>
            <div>
              <dt>Total billed</dt>
              <dd>{formatCurrency(viewingTotals.billed)}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>{formatCurrency(viewingTotals.paid)}</dd>
            </div>
            <div>
              <dt>Balance due</dt>
              <dd>{formatCurrency(viewingTotals.balance)}</dd>
            </div>
          </dl>

          <h3>Invoices</h3>
          {viewingInvoices.length > 0 ? (
            <Table columns={invoiceColumns} rows={viewingInvoices} getRowKey={(invoice) => invoice.id} />
          ) : (
            <p>No invoices for this customer.</p>
          )}

          <h3>Payment history</h3>
          {viewPaymentsLoading ? (
            <p role="status">Loading payments…</p>
          ) : viewPaymentsError ? (
            <p className="field-error" role="alert">
              {viewPaymentsError}
            </p>
          ) : viewPayments.length > 0 ? (
            <Table columns={paymentColumns} rows={viewPayments} getRowKey={(payment) => payment.id} />
          ) : (
            <p>No payments recorded for this customer.</p>
          )}
        </Modal>
      )}

      {formTarget && (
        <Modal
          open
          title={isEditing ? 'Edit customer' : 'Add customer'}
          onClose={closeForm}
          footer={
            <>
              <Button variant="secondary" onClick={closeForm} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" form="customer-form" disabled={saving}>
                {saving ? 'Saving…' : 'Save customer'}
              </Button>
            </>
          }
        >
          <form id="customer-form" className="form-grid" onSubmit={handleSubmit} noValidate>
            {formError && (
              <p className="field-error form-full" role="alert">
                {formError}
              </p>
            )}

            <div>
              <label className="label" htmlFor="customer-name">
                Name
              </label>
              <input
                id="customer-name"
                className={inputClass(errors.name)}
                value={form.name}
                onChange={handleFieldChange('name')}
                aria-invalid={errors.name ? true : undefined}
              />
              {errors.name && <p className="field-error">{errors.name}</p>}
            </div>

            <div>
              <label className="label" htmlFor="customer-email">
                Email
              </label>
              <input
                id="customer-email"
                type="email"
                className={inputClass(errors.email)}
                value={form.email}
                onChange={handleFieldChange('email')}
                aria-invalid={errors.email ? true : undefined}
              />
              {errors.email && <p className="field-error">{errors.email}</p>}
            </div>

            <div>
              <label className="label" htmlFor="customer-phone">
                Phone
              </label>
              <input
                id="customer-phone"
                type="tel"
                className="input"
                value={form.phone}
                onChange={handleFieldChange('phone')}
              />
            </div>

            <div>
              <label className="label" htmlFor="customer-project">
                Project name
              </label>
              <input
                id="customer-project"
                className="input"
                value={form.projectName}
                onChange={handleFieldChange('projectName')}
              />
            </div>

            <div className="form-full">
              <label className="label" htmlFor="customer-notes">
                Notes
              </label>
              <textarea
                id="customer-notes"
                className="input"
                rows={3}
                value={form.notes}
                onChange={handleFieldChange('notes')}
              />
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          open
          title="Delete customer"
          onClose={closeDelete}
          footer={
            <>
              <Button variant="secondary" onClick={closeDelete} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleDelete()} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            </>
          }
        >
          <p>Delete customer {deleteTarget.name}?</p>
          {deleteError && (
            <p className="field-error" role="alert">
              {deleteError}
            </p>
          )}
        </Modal>
      )}

      {toast && (
        <div className="toast-container" role="status" aria-live="polite">
          <div className="toast toast-success">{toast}</div>
        </div>
      )}
    </div>
  );
}
