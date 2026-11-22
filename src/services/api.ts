import { supabase } from '../lib/supabase';
import type {
  Customer,
  Expense,
  ExpenseStatus,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Payment,
  PaymentMethod,
} from '../types';

// ---------------------------------------------------------------------------
// Database row shapes
// Source of truth: supabase/migrations/20250101000000_phase2_init.sql and
// 20250102000000_phase2_functions.sql. The client never writes subtotal,
// total_amount, paid_amount or status on invoices; the DB triggers and RPCs do.
// ---------------------------------------------------------------------------

interface CustomerRow {
  id: string;
  user_id: string;
  customer_name: string;
  email: string | null;
  phone: string | null;
  project_name: string | null;
  notes: string | null;
  created_at: string;
}

/** Row from the invoices_with_status view (invoices.* plus derived columns). */
interface InvoiceViewRow {
  id: string;
  user_id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  description: string | null;
  subtotal: number | string;
  total_amount: number | string;
  paid_amount: number | string;
  status: string;
  created_at: string;
  balance_due: number | string;
  display_status: string;
  customer_name: string | null;
}

interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
  position: number;
}

interface PaymentRow {
  id: string;
  user_id: string;
  invoice_id: string;
  customer_id: string;
  payment_amount: number | string;
  payment_date: string;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

type PaymentJoinRow = PaymentRow & {
  invoices?: { invoice_number: string } | null;
  customers?: { customer_name: string } | null;
};

interface ExpenseRow {
  id: string;
  user_id: string;
  expense_title: string;
  category: string;
  amount: number | string;
  expense_date: string;
  due_date: string | null;
  payment_status: string;
  notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Inputs used by existing pages (camelCase UI shapes; signatures preserved)
// ---------------------------------------------------------------------------

export interface CustomerInput {
  name: string;
  email: string;
  phone: string;
  projectName: string;
  notes: string;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface SaveInvoiceInput {
  id?: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  description: string;
  status: 'draft' | 'pending';
  items: InvoiceItemInput[];
}

export interface PaymentFilter {
  invoiceId?: string;
  customerId?: string;
}

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  notes: string;
}

export interface ExpenseInput {
  title: string;
  category: string;
  amount: number;
  expenseDate: string;
  dueDate: string | null;
  paymentStatus: ExpenseStatus;
  notes: string;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface MonthlyTotals {
  month: string;
  revenue: number;
  expenses: number;
}

export interface DashboardSummary {
  // Spec fields (computed from the database).
  revenueReceived: number;
  outstandingTotal: number;
  overdueTotal: number;
  overdueCount: number;
  totalExpenses: number;
  cashBalance: number;
  customerCount: number;
  pendingInvoiceCount: number;
  // Fields already consumed by the existing dashboard page.
  totalRevenue: number;
  outstanding: number;
  overdue: number;
  availableCash: number;
  monthly: MonthlyTotals[];
  recentInvoices: Invoice[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Exact values allowed by the payments.payment_method CHECK constraint. */
const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'Bank transfer',
  'Cash',
  'Card',
  'UPI',
  'Cheque',
  'Other',
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ErrorLike {
  message: string;
}

/** Converts a PostgrestError (or any error with a message) into a readable Error. */
function toReadableError(error: ErrorLike): Error {
  const message = (error.message ?? '').trim();
  if (message.includes('Payment exceeds remaining balance')) {
    return new Error('The payment is larger than the remaining balance.');
  }
  return new Error(message !== '' ? message : 'Unexpected database error.');
}

function throwIfError(error: ErrorLike | null): void {
  if (error) {
    throw toReadableError(error);
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Display-only mirror of the invoices_with_status rule, for client-side use
 * when no view row is available. Never used to write status to the database.
 */
export function deriveInvoiceStatus(
  total: number,
  paid: number,
  dueDate: string,
  today: string = todayIso(),
): InvoiceStatus {
  if (paid >= total) {
    return 'paid';
  }
  if (dueDate < today) {
    return 'overdue';
  }
  if (paid > 0) {
    return 'partially_paid';
  }
  return 'pending';
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function toPaymentMethod(value: string): PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value)
    ? (value as PaymentMethod)
    : 'Other';
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.customer_name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    projectName: row.project_name ?? '',
    notes: row.notes ?? '',
    createdAt: row.created_at,
  };
}

/**
 * Maps a row from the invoices_with_status view to the UI shape. The status
 * comes from display_status, which is the only place 'overdue' is derived.
 */
function toInvoice(row: InvoiceViewRow): Invoice {
  const total = round2(Number(row.total_amount));
  const paid = round2(Number(row.paid_amount));
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerName: row.customer_name ?? '',
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    description: row.description ?? '',
    subtotal: round2(Number(row.subtotal)),
    totalAmount: total,
    paidAmount: paid,
    balanceDue: round2(Number(row.balance_due)),
    status: row.display_status as InvoiceStatus,
    items: [],
    createdAt: row.created_at,
  };
}

function toInvoiceItem(row: InvoiceItemRow): InvoiceItem {
  // InvoiceItem's UI type was not readable from the migrations; field names
  // here follow the invoice_items columns. Verify against src/types.
  return {
    id: row.id,
    description: row.description,
    quantity: round2(Number(row.quantity)),
    unitPrice: round2(Number(row.unit_price)),
    lineTotal: round2(Number(row.line_total)),
  } as InvoiceItem;
}

function toPayment(row: PaymentJoinRow): Payment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoices?.invoice_number ?? '',
    customerId: row.customer_id,
    customerName: row.customers?.customer_name ?? '',
    amount: round2(Number(row.payment_amount)),
    paymentDate: row.payment_date,
    method: toPaymentMethod(row.payment_method),
    notes: row.notes ?? '',
    createdAt: row.created_at,
  };
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    title: row.expense_title,
    category: row.category,
    amount: round2(Number(row.amount)),
    expenseDate: row.expense_date,
    dueDate: row.due_date ?? null,
    paymentStatus: row.payment_status as ExpenseStatus,
    notes: row.notes ?? '',
    createdAt: row.created_at,
  };
}

function validateExpense(input: ExpenseInput): { title: string; category: string; notes: string } {
  const title = input.title.trim();
  const category = input.category.trim();
  if (title === '') {
    throw new Error('Expense title is required');
  }
  if (category === '') {
    throw new Error('Expense category is required');
  }
  if (!(input.amount > 0)) {
    throw new Error('Expense amount must be greater than zero');
  }
  if (input.expenseDate === '') {
    throw new Error('Expense date is required');
  }
  if (input.paymentStatus !== 'paid' && input.paymentStatus !== 'pending') {
    throw new Error('Expense payment status must be paid or pending');
  }
  if (input.dueDate !== null && input.dueDate !== '' && input.dueDate < input.expenseDate) {
    throw new Error('Due date must be on or after the expense date');
  }
  return { title, category, notes: input.notes.trim() };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function listCustomers(search?: string): Promise<Customer[]> {
  let query = supabase.from('customers').select('*').order('customer_name', { ascending: true });
  // Strip characters that have meaning in PostgREST filter syntax.
  const term = (search ?? '').replace(/[%_,()*]/g, ' ').trim();
  if (term !== '') {
    query = query.or(
      `customer_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,project_name.ilike.%${term}%`,
    );
  }
  const { data, error } = await query;
  throwIfError(error);
  return ((data ?? []) as CustomerRow[]).map(toCustomer);
}

export async function getCustomer(id: string): Promise<Customer> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).single();
  throwIfError(error);
  return toCustomer(data as CustomerRow);
}

export async function createCustomer(input: CustomerInput): Promise<Customer> {
  const name = input.name.trim();
  if (name === '') {
    throw new Error('Customer name is required');
  }
  // user_id defaults to auth.uid() in the table definition.
  const { data, error } = await supabase
    .from('customers')
    .insert({
      customer_name: name,
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      project_name: emptyToNull(input.projectName),
      notes: emptyToNull(input.notes),
    })
    .select('*')
    .single();
  throwIfError(error);
  return toCustomer(data as CustomerRow);
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  const name = input.name.trim();
  if (name === '') {
    throw new Error('Customer name is required');
  }
  const { data, error } = await supabase
    .from('customers')
    .update({
      customer_name: name,
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      project_name: emptyToNull(input.projectName),
      notes: emptyToNull(input.notes),
    })
    .eq('id', id)
    .select('*')
    .single();
  throwIfError(error);
  return toCustomer(data as CustomerRow);
}

/**
 * Deletes a customer through delete_customer. The DB refuses customers that
 * still have invoices or payments; its message is surfaced unchanged.
 */
export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_customer', { p_id: id });
  throwIfError(error);
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function listInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices_with_status')
    .select('*')
    .order('invoice_date', { ascending: false });
  throwIfError(error);
  return ((data ?? []) as InvoiceViewRow[]).map(toInvoice);
}

export async function getInvoice(id: string): Promise<Invoice> {
  const { data, error } = await supabase
    .from('invoices_with_status')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  throwIfError(error);
  if (data === null) {
    throw new Error('Invoice not found');
  }
  const { data: itemRows, error: itemsError } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', id)
    .order('position', { ascending: true });
  throwIfError(itemsError);
  return {
    ...toInvoice(data as InvoiceViewRow),
    items: ((itemRows ?? []) as InvoiceItemRow[]).map(toInvoiceItem),
  };
}

export async function nextInvoiceNumber(): Promise<string> {
  const { data, error } = await supabase.rpc('next_invoice_number');
  throwIfError(error);
  if (typeof data !== 'string' || data === '') {
    throw new Error('Unexpected response from next_invoice_number');
  }
  return data;
}

/**
 * Creates or edits an invoice through save_invoice, which replaces the line
 * items and lets the DB compute totals and status. A new invoice with no
 * number gets one from next_invoice_number.
 */
export async function saveInvoice(input: SaveInvoiceInput): Promise<string> {
  if (input.customerId.trim() === '') {
    throw new Error('Customer is required');
  }
  let invoiceNumber = input.invoiceNumber.trim();
  if (invoiceNumber === '') {
    if (input.id) {
      throw new Error('Invoice number is required');
    }
    invoiceNumber = await nextInvoiceNumber();
  }

  const { data, error } = await supabase.rpc('save_invoice', {
    p_id: input.id ?? null,
    p_customer_id: input.customerId,
    p_invoice_number: invoiceNumber,
    p_invoice_date: input.invoiceDate,
    p_due_date: input.dueDate,
    p_description: input.description.trim(),
    p_status: input.status,
    p_items: input.items.map((item) => ({
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unitPrice,
    })),
  });
  throwIfError(error);
  if (typeof data !== 'string') {
    throw new Error('Unexpected response from save_invoice');
  }
  return data;
}

/** Deletes an invoice through delete_invoice; the DB refuses invoices with payments. */
export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_invoice', { p_id: id });
  throwIfError(error);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function listPayments(filter?: PaymentFilter): Promise<Payment[]> {
  let query = supabase
    .from('payments')
    .select('*, invoices(invoice_number), customers(customer_name)')
    .order('payment_date', { ascending: false });
  if (filter?.invoiceId !== undefined) {
    query = query.eq('invoice_id', filter.invoiceId);
  }
  if (filter?.customerId !== undefined) {
    query = query.eq('customer_id', filter.customerId);
  }
  const { data, error } = await query;
  throwIfError(error);
  return ((data ?? []) as PaymentJoinRow[]).map(toPayment);
}

export async function listPaymentsByInvoice(invoiceId: string): Promise<Payment[]> {
  return listPayments({ invoiceId });
}

export async function listPaymentsByCustomer(customerId: string): Promise<Payment[]> {
  return listPayments({ customerId });
}

/**
 * Records a full or partial payment through record_payment. The DB enforces
 * the overpayment guard and refuses draft invoices. The method is sent as
 * the exact CHECK-list string.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<void> {
  if (!input.invoiceId) {
    throw new Error('Invoice is required');
  }
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || !(input.amount > 0)) {
    throw new Error('Payment amount must be a number greater than zero');
  }
  if (!input.paymentDate) {
    throw new Error('Payment date is required');
  }
  if (!(PAYMENT_METHODS as readonly string[]).includes(input.method)) {
    throw new Error('Unsupported payment method');
  }
  const { error } = await supabase.rpc('record_payment', {
    p_invoice_id: input.invoiceId,
    p_amount: round2(input.amount),
    p_payment_date: input.paymentDate,
    p_payment_method: input.method,
    p_notes: emptyToNull(input.notes),
  });
  throwIfError(error);
}

/** Reverses (deletes) a recorded payment through the delete_payment RPC. */
export async function reversePayment(paymentId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_payment', { p_id: paymentId });
  throwIfError(error);
}

/** Kept for existing callers; delegates to reversePayment. */
export async function deletePayment(id: string): Promise<void> {
  return reversePayment(id);
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export async function listExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false });
  throwIfError(error);
  return ((data ?? []) as ExpenseRow[]).map(toExpense);
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const clean = validateExpense(input);
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      expense_title: clean.title,
      category: clean.category,
      amount: round2(input.amount),
      expense_date: input.expenseDate,
      due_date: input.dueDate ? input.dueDate : null,
      payment_status: input.paymentStatus,
      notes: emptyToNull(clean.notes),
    })
    .select('*')
    .single();
  throwIfError(error);
  return toExpense(data as ExpenseRow);
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
  const clean = validateExpense(input);
  const { data, error } = await supabase
    .from('expenses')
    .update({
      expense_title: clean.title,
      category: clean.category,
      amount: round2(input.amount),
      expense_date: input.expenseDate,
      due_date: input.dueDate ? input.dueDate : null,
      payment_status: input.paymentStatus,
      notes: emptyToNull(clean.notes),
    })
    .eq('id', id)
    .select('*')
    .single();
  throwIfError(error);
  return toExpense(data as ExpenseRow);
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  throwIfError(error);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * Aggregates are computed from the fetched rows. Invoice status and overdue
 * come from the invoices_with_status view (display_status).
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [invoicesResult, paymentsResult, expensesResult, customersResult] = await Promise.all([
    supabase.from('invoices_with_status').select('*').order('invoice_date', { ascending: false }),
    supabase.from('payments').select('payment_amount, payment_date'),
    supabase.from('expenses').select('amount, expense_date, payment_status'),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
  ]);

  throwIfError(invoicesResult.error);
  throwIfError(paymentsResult.error);
  throwIfError(expensesResult.error);
  throwIfError(customersResult.error);

  const invoices = ((invoicesResult.data ?? []) as InvoiceViewRow[]).map(toInvoice);
  const payments = (paymentsResult.data ?? []) as {
    payment_amount: number | string;
    payment_date: string;
  }[];
  const expenses = (expensesResult.data ?? []) as {
    amount: number | string;
    expense_date: string;
    payment_status: string;
  }[];

  const revenueReceived = round2(payments.reduce((sum, p) => sum + Number(p.payment_amount), 0));

  const paidExpenses = expenses.filter((e) => e.payment_status === 'paid');
  const totalExpenses = round2(paidExpenses.reduce((sum, e) => sum + Number(e.amount), 0));
  const cashBalance = round2(revenueReceived - totalExpenses);

  const open = invoices.filter((inv) => inv.status !== 'paid' && inv.status !== 'draft');
  const outstandingTotal = round2(open.reduce((sum, inv) => sum + inv.balanceDue, 0));

  const overdueInvoices = invoices.filter((inv) => inv.status === 'overdue');
  const overdueTotal = round2(overdueInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0));
  const overdueCount = overdueInvoices.length;

  const pendingInvoiceCount = invoices.filter(
    (inv) => inv.status === 'pending' || inv.status === 'partially_paid' || inv.status === 'overdue',
  ).length;

  // Last 12 calendar months, oldest first. Keys are 'YYYY-MM'.
  const now = new Date();
  const monthKeys: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    monthKeys.push({
      key: `${year}-${pad2(monthIndex + 1)}`,
      label: `${MONTH_NAMES[monthIndex]} ${year}`,
    });
  }

  const revenueByMonth = new Map<string, number>();
  for (const p of payments) {
    const key = p.payment_date.slice(0, 7);
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(p.payment_amount));
  }

  const expensesByMonth = new Map<string, number>();
  for (const e of paidExpenses) {
    const key = e.expense_date.slice(0, 7);
    expensesByMonth.set(key, (expensesByMonth.get(key) ?? 0) + Number(e.amount));
  }

  const monthly: MonthlyTotals[] = monthKeys.map(({ key, label }) => ({
    month: label,
    revenue: round2(revenueByMonth.get(key) ?? 0),
    expenses: round2(expensesByMonth.get(key) ?? 0),
  }));

  return {
    revenueReceived,
    outstandingTotal,
    overdueTotal,
    overdueCount,
    totalExpenses,
    cashBalance,
    customerCount: customersResult.count ?? 0,
    pendingInvoiceCount,
    totalRevenue: revenueReceived,
    outstanding: outstandingTotal,
    overdue: overdueTotal,
    availableCash: cashBalance,
    monthly,
    recentInvoices: invoices.slice(0, 5),
  };
}
