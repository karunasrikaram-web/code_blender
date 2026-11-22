import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Clock, Receipt, Search, Wallet } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import Table from '../components/ui/Table';
import type { TableColumn } from '../components/ui/Table';
import { createExpense, deleteExpense, listExpenses, updateExpense } from '../services/api';
import type { ExpenseInput } from '../services/api';
import { EXPENSE_CATEGORIES } from '../types';
import type { Expense, ExpenseStatus } from '../types';
import { formatCurrency } from '../utils/format';

type StatusFilter = 'all' | ExpenseStatus;

interface ExpenseForm {
  title: string;
  category: string;
  amount: string;
  expenseDate: string;
  dueDate: string;
  paymentStatus: ExpenseStatus;
  notes: string;
}

type FormErrors = Partial<Record<keyof ExpenseForm, string>>;

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyForm(): ExpenseForm {
  return {
    title: '',
    category: '',
    amount: '',
    expenseDate: todayIso(),
    dueDate: '',
    paymentStatus: 'pending',
    notes: '',
  };
}

function validateForm(form: ExpenseForm): FormErrors {
  const errors: FormErrors = {};
  if (form.title.trim() === '') {
    errors.title = 'Title is required.';
  }
  if (form.category === '') {
    errors.category = 'Category is required.';
  }
  const amount = Number(form.amount);
  if (form.amount.trim() === '' || !(amount > 0)) {
    errors.amount = 'Amount must be greater than zero.';
  }
  if (form.expenseDate === '') {
    errors.expenseDate = 'Expense date is required.';
  }
  if (form.dueDate !== '' && form.expenseDate !== '' && form.dueDate < form.expenseDate) {
    errors.dueDate = 'Due date must be on or after the expense date.';
  }
  return errors;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}


function statusLabel(status: ExpenseStatus): 'Paid' | 'Pending' {
  return status === 'paid' ? 'Paid' : 'Pending';
}

function toStatusFilter(value: string): StatusFilter {
  return value === 'paid' || value === 'pending' ? value : 'all';
}

function toExpenseStatus(value: string): ExpenseStatus {
  return value === 'paid' ? 'paid' : 'pending';
}

function fieldClass(error: string | undefined): string {
  return error ? 'input is-invalid' : 'input';
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setExpenses(await listExpenses());
    } catch (error: unknown) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  const totals = useMemo(() => {
    let all = 0;
    let paid = 0;
    let pending = 0;
    for (const expense of expenses) {
      all += expense.amount;
      if (expense.paymentStatus === 'paid') {
        paid += expense.amount;
      } else {
        pending += expense.amount;
      }
    }
    return { all: round2(all), paid: round2(paid), pending: round2(pending) };
  }, [expenses]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return expenses.filter(
      (expense) =>
        (term === '' || expense.title.toLowerCase().includes(term)) &&
        (categoryFilter === '' || expense.category === categoryFilter) &&
        (statusFilter === 'all' || expense.paymentStatus === statusFilter),
    );
  }, [expenses, search, categoryFilter, statusFilter]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setForm({
      title: expense.title,
      category: expense.category,
      amount: String(expense.amount),
      expenseDate: expense.expenseDate,
      dueDate: expense.dueDate ?? '',
      paymentStatus: expense.paymentStatus,
      notes: expense.notes,
    });
    setFormErrors({});
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
  }

  function updateField<K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFormErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const errors = validateForm(form);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const input: ExpenseInput = {
      title: form.title.trim(),
      category: form.category,
      amount: Number(form.amount),
      expenseDate: form.expenseDate,
      dueDate: form.dueDate === '' ? null : form.dueDate,
      paymentStatus: form.paymentStatus,
      notes: form.notes.trim(),
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateExpense(editing.id, input);
      } else {
        await createExpense(input);
      }
      setFormOpen(false);
      await loadExpenses();
    } catch (error: unknown) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function openDelete(expense: Expense) {
    setDeleteError(null);
    setDeleteTarget(expense);
  }

  function closeDelete() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }

  async function handleDelete() {
    if (deleteTarget === null || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteExpense(deleteTarget.id);
      setDeleteTarget(null);
      await loadExpenses();
    } catch (error: unknown) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  const columns: TableColumn<Expense>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (expense) => <span className="expenses-name">{expense.title}</span>,
    },
    { key: 'category', header: 'Category', render: (expense) => expense.category },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (expense) => formatCurrency(expense.amount),
    },
    { key: 'expenseDate', header: 'Expense date', render: (expense) => expense.expenseDate },
    { key: 'dueDate', header: 'Due date', render: (expense) => expense.dueDate ?? '—' },
    {
      key: 'paymentStatus',
      header: 'Payment status',
      render: (expense) => <StatusBadge status={statusLabel(expense.paymentStatus)} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (expense) => (
        <div className="table-actions">
          <Button variant="ghost" onClick={() => openEdit(expense)}>
            Edit
          </Button>
          <Button variant="ghost" onClick={() => openDelete(expense)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const showContent = !loading && (loadError === null || expenses.length > 0);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track business expenses, due dates and payment status."
        actions={<Button onClick={openCreate}>Add expense</Button>}
      />

      {loadError !== null && (
        <div className="expenses-error" role="alert">
          <span>Could not load expenses: {loadError}</span>
          <Button variant="secondary" onClick={() => void loadExpenses()} disabled={loading}>
            Retry
          </Button>
        </div>
      )}

      {loading && <p className="expenses-muted">Loading expenses…</p>}

      {showContent && (
        <>
          <div className="stat-grid">
            <StatCard
              label="Total expenses"
              value={formatCurrency(totals.all)}
              icon={Receipt}
              accent="primary"
            />
            <StatCard label="Paid" value={formatCurrency(totals.paid)} icon={Wallet} accent="success" />
            <StatCard
              label="Pending"
              value={formatCurrency(totals.pending)}
              icon={Clock}
              accent="warning"
            />
          </div>

          <Card>
            <div className="expenses-toolbar">
              <div className="expenses-search">
                <Search size={16} className="expenses-search-icon" />
                <input
                  className="input expenses-search-input"
                  type="search"
                  placeholder="Search by title"
                  aria-label="Search by title"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <select
                className="input expenses-filter"
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                className="input expenses-filter"
                aria-label="Filter by payment status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(toStatusFilter(event.target.value))}
              >
                <option value="all">All statuses</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={expenses.length === 0 ? 'No expenses yet' : 'No matching expenses'}
                description={
                  expenses.length === 0
                    ? 'Add your first expense to start tracking.'
                    : 'Try a different search or filter.'
                }
              />
            ) : (
              <div className="expenses-table">
                <Table columns={columns} rows={visible} getRowKey={(expense) => expense.id} />
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        open={formOpen}
        title={editing ? 'Edit expense' : 'Add expense'}
        onClose={closeForm}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="expense-form" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <form
          id="expense-form"
          className="form-grid"
          noValidate
          onSubmit={(event) => void handleSave(event)}
        >
          <div className="form-full">
            <label className="label" htmlFor="expense-title">
              Title
            </label>
            <input
              id="expense-title"
              className={fieldClass(formErrors.title)}
              value={form.title}
              disabled={saving}
              onChange={(event) => updateField('title', event.target.value)}
            />
            {formErrors.title && <p className="field-error">{formErrors.title}</p>}
          </div>

          <div>
            <label className="label" htmlFor="expense-category">
              Category
            </label>
            <select
              id="expense-category"
              className={fieldClass(formErrors.category)}
              value={form.category}
              disabled={saving}
              onChange={(event) => updateField('category', event.target.value)}
            >
              <option value="">Select a category</option>
              {EXPENSE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            {formErrors.category && <p className="field-error">{formErrors.category}</p>}
          </div>

          <div>
            <label className="label" htmlFor="expense-amount">
              Amount
            </label>
            <input
              id="expense-amount"
              className={fieldClass(formErrors.amount)}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.amount}
              disabled={saving}
              onChange={(event) => updateField('amount', event.target.value)}
            />
            {formErrors.amount && <p className="field-error">{formErrors.amount}</p>}
          </div>

          <div>
            <label className="label" htmlFor="expense-date">
              Expense date
            </label>
            <input
              id="expense-date"
              className={fieldClass(formErrors.expenseDate)}
              type="date"
              value={form.expenseDate}
              disabled={saving}
              onChange={(event) => updateField('expenseDate', event.target.value)}
            />
            {formErrors.expenseDate && <p className="field-error">{formErrors.expenseDate}</p>}
          </div>

          <div>
            <label className="label" htmlFor="expense-due">
              Due date (optional)
            </label>
            <input
              id="expense-due"
              className={fieldClass(formErrors.dueDate)}
              type="date"
              value={form.dueDate}
              disabled={saving}
              onChange={(event) => updateField('dueDate', event.target.value)}
            />
            {formErrors.dueDate && <p className="field-error">{formErrors.dueDate}</p>}
          </div>

          <div className="form-full">
            <label className="label" htmlFor="expense-status">
              Payment status
            </label>
            <select
              id="expense-status"
              className="input"
              value={form.paymentStatus}
              disabled={saving}
              onChange={(event) =>
                updateField('paymentStatus', toExpenseStatus(event.target.value))
              }
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          <div className="form-full">
            <label className="label" htmlFor="expense-notes">
              Notes
            </label>
            <textarea
              id="expense-notes"
              className="input"
              rows={3}
              value={form.notes}
              disabled={saving}
              onChange={(event) => updateField('notes', event.target.value)}
            />
          </div>
        </form>

        {formError !== null && (
          <div className="expenses-error" role="alert">
            {formError}
          </div>
        )}
      </Modal>

      <Modal
        open={deleteTarget !== null}
        title="Delete expense"
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
        {deleteTarget !== null && <p>Delete expense {deleteTarget.title}?</p>}
        {deleteError !== null && (
          <div className="expenses-error" role="alert">
            {deleteError}
          </div>
        )}
      </Modal>
    </div>
  );
}
