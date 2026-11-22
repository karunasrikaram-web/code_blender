import { computeForecast } from './forecast.ts';
import type { ForecastExpense, ForecastInvoice, ForecastPayment } from './forecast.ts';
import { formatCurrency, formatDate } from '../utils/format.ts';

/*
 * Pure assistant context builder. No Supabase, no React, no Deno APIs.
 * All dates are YYYY-MM-DD strings; date arithmetic is done in UTC.
 */

export interface AssistantInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  status: string;
}

export interface AssistantExpense {
  id: string;
  expense_title: string;
  category: string;
  amount: number;
  expense_date: string;
  due_date: string | null;
  payment_status: 'paid' | 'pending';
}

export interface AssistantOverdueInvoice {
  invoice_number: string;
  customer_name: string;
  outstanding: number;
  daysOverdue: number;
}

export interface AssistantCustomerOutstanding {
  customer_name: string;
  outstanding: number;
  invoiceCount: number;
}

export interface AssistantPendingExpense {
  title: string;
  category: string;
  amount: number;
  dueDate: string | null;
}

export interface AssistantForecastSummary {
  currentCash: number;
  expectedInflowsTotal: number;
  upcomingExpensesTotal: number;
  predictedEndingBalance: number;
  firstNegativeDate: string | null;
  daysUntilNegative: number | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface AssistantFacts {
  today: string;
  outstandingTotal: number;
  outstandingCount: number;
  overdueTotal: number;
  overdueCount: number;
  overdueInvoices: AssistantOverdueInvoice[];
  customersWithOutstanding: AssistantCustomerOutstanding[];
  dueThisMonth: number;
  pendingExpensesTotal: number;
  pendingExpenses: AssistantPendingExpense[];
  totalReceived: number;
  forecast30: AssistantForecastSummary;
  hasAnyData: boolean;
}

export interface BuildAssistantFactsInput {
  invoices: AssistantInvoice[];
  payments: ForecastPayment[];
  expenses: AssistantExpense[];
  today: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LIST = 10;

function toNum(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Rounds half away from zero to 2 decimals. */
function round2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(value) + Number.EPSILON) * 100)) / 100;
}

function parseUtc(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`);
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseUtc(to) - parseUtc(from)) / DAY_MS);
}

function outstandingOf(inv: AssistantInvoice): number {
  return round2(Math.max(0, toNum(inv.total_amount) - toNum(inv.paid_amount)));
}

interface OpenInvoice {
  inv: AssistantInvoice;
  outstanding: number;
}

export function buildAssistantFacts(input: BuildAssistantFactsInput): AssistantFacts {
  const invoices = input.invoices ?? [];
  const payments = input.payments ?? [];
  const expenses = input.expenses ?? [];
  const today = input.today;

  // Drafts are excluded from every invoice total.
  const activeInvoices = invoices.filter((inv) => inv && inv.status !== 'draft');

  const open: OpenInvoice[] = [];
  for (const inv of activeInvoices) {
    const outstanding = outstandingOf(inv);
    if (outstanding > 0) open.push({ inv, outstanding });
  }

  const outstandingTotal = round2(open.reduce((sum, o) => sum + o.outstanding, 0));

  const overdue = open.filter((o) => o.inv.due_date < today);
  const overdueTotal = round2(overdue.reduce((sum, o) => sum + o.outstanding, 0));
  const overdueInvoices: AssistantOverdueInvoice[] = overdue
    .map((o) => ({
      invoice_number: o.inv.invoice_number,
      customer_name: o.inv.customer_name,
      outstanding: o.outstanding,
      daysOverdue: daysBetween(o.inv.due_date, today),
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, MAX_LIST);

  const monthPrefix = today.slice(0, 7);
  const dueThisMonth = round2(
    open
      .filter((o) => o.inv.due_date >= today && o.inv.due_date.slice(0, 7) === monthPrefix)
      .reduce((sum, o) => sum + o.outstanding, 0),
  );

  const byCustomer = new Map<string, { outstanding: number; invoiceCount: number }>();
  for (const o of open) {
    const entry = byCustomer.get(o.inv.customer_name) ?? { outstanding: 0, invoiceCount: 0 };
    entry.outstanding += o.outstanding;
    entry.invoiceCount += 1;
    byCustomer.set(o.inv.customer_name, entry);
  }
  const customersWithOutstanding: AssistantCustomerOutstanding[] = Array.from(byCustomer.entries())
    .map(([customer_name, entry]) => ({
      customer_name,
      outstanding: round2(entry.outstanding),
      invoiceCount: entry.invoiceCount,
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, MAX_LIST);

  const totalReceived = round2(
    payments.reduce((sum, p) => sum + toNum(p?.payment_amount), 0),
  );

  const pending = expenses.filter((e) => e && e.payment_status === 'pending');
  const pendingExpensesTotal = round2(pending.reduce((sum, e) => sum + toNum(e.amount), 0));
  const pendingExpenses: AssistantPendingExpense[] = pending
    .slice()
    .sort((a, b) => {
      if (a.due_date === null && b.due_date === null) return 0;
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
    })
    .slice(0, MAX_LIST)
    .map((e) => ({
      title: e.expense_title,
      category: e.category,
      amount: round2(toNum(e.amount)),
      dueDate: e.due_date,
    }));

  // The forecast engine ignores drafts itself, but pass only the active invoices to be explicit.
  const forecastInvoices: ForecastInvoice[] = activeInvoices;
  const forecastExpenses: ForecastExpense[] = expenses;
  const forecast = computeForecast({
    invoices: forecastInvoices,
    payments,
    expenses: forecastExpenses,
    today,
    horizonDays: 30,
  });

  return {
    today,
    outstandingTotal,
    outstandingCount: open.length,
    overdueTotal,
    overdueCount: overdue.length,
    overdueInvoices,
    customersWithOutstanding,
    dueThisMonth,
    pendingExpensesTotal,
    pendingExpenses,
    totalReceived,
    forecast30: {
      currentCash: forecast.currentCash,
      expectedInflowsTotal: forecast.expectedInflowsTotal,
      upcomingExpensesTotal: forecast.upcomingExpensesTotal,
      predictedEndingBalance: forecast.predictedEndingBalance,
      firstNegativeDate: forecast.firstNegativeDate,
      daysUntilNegative: forecast.daysUntilNegative,
      confidence: forecast.confidence,
    },
    hasAnyData: invoices.length > 0 || payments.length > 0 || expenses.length > 0,
  };
}

/**
 * Compact plain-text block. Every figure is formatted here, so the AI has a single
 * source of numbers and should not compute its own.
 */
export function formatFactsForPrompt(facts: AssistantFacts): string {
  const money = (n: number) => formatCurrency(n);
  const lines: string[] = [];

  lines.push(`Today: ${facts.today}`);
  if (!facts.hasAnyData) {
    lines.push('No invoices, payments or expenses are recorded yet.');
  }
  lines.push(
    `Outstanding total: ${money(facts.outstandingTotal)} across ${facts.outstandingCount} open invoice(s)`,
  );
  lines.push(`Overdue total: ${money(facts.overdueTotal)} across ${facts.overdueCount} invoice(s)`);
  lines.push(`Due this month (not yet overdue): ${money(facts.dueThisMonth)}`);
  lines.push(`Total received: ${money(facts.totalReceived)}`);
  lines.push(`Pending expenses total: ${money(facts.pendingExpensesTotal)}`);

  const f = facts.forecast30;
  lines.push('Forecast (30 days):');
  lines.push(`- Current cash: ${money(f.currentCash)}`);
  lines.push(`- Expected inflows: ${money(f.expectedInflowsTotal)}`);
  lines.push(`- Upcoming expenses: ${money(f.upcomingExpensesTotal)}`);
  lines.push(`- Predicted ending balance: ${money(f.predictedEndingBalance)}`);
  if (f.firstNegativeDate !== null && f.daysUntilNegative !== null) {
    lines.push(
      `- Balance may turn negative on ${f.firstNegativeDate} (${f.daysUntilNegative} days from today)`,
    );
  } else {
    lines.push('- No negative balance expected in the next 30 days');
  }
  lines.push(`- Forecast confidence: ${f.confidence}`);

  lines.push('Overdue invoices:');
  if (facts.overdueInvoices.length === 0) {
    lines.push('- None');
  }
  for (const inv of facts.overdueInvoices) {
    lines.push(
      `- Invoice ${inv.invoice_number} (${inv.customer_name}): ${money(inv.outstanding)} outstanding, ${inv.daysOverdue} days overdue`,
    );
  }

  lines.push('Customers with outstanding balances:');
  if (facts.customersWithOutstanding.length === 0) {
    lines.push('- None');
  }
  for (const c of facts.customersWithOutstanding) {
    lines.push(
      `- ${c.customer_name}: ${money(c.outstanding)} across ${c.invoiceCount} invoice(s)`,
    );
  }

  lines.push('Pending expenses:');
  if (facts.pendingExpenses.length === 0) {
    lines.push('- None');
  }
  for (const e of facts.pendingExpenses) {
    const due = e.dueDate ? `due ${e.dueDate}` : 'no due date';
    lines.push(`- ${e.title} (${e.category}): ${money(e.amount)}, ${due}`);
  }

  return lines.join('\n');
}

/** Polite English payment reminder. Text only; nothing is sent. */
export function buildReminderDraft(args: {
  customerName: string;
  invoiceNumber: string;
  outstanding: number;
  dueDate: string;
  senderName?: string;
}): string {
  const sender = args.senderName?.trim() || 'Accounts team';
  return [
    `Dear ${args.customerName},`,
    '',
    `This is a friendly reminder that invoice ${args.invoiceNumber} for ${formatCurrency(args.outstanding)} was due on ${formatDate(args.dueDate)} and is still unpaid.`,
    'If you have already made the payment, please disregard this message. Otherwise, we would be grateful if you could settle the amount at your earliest convenience.',
    '',
    'If you have any questions about this invoice, please let us know.',
    '',
    'Thank you,',
    sender,
  ].join('\n');
}
