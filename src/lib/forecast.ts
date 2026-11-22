import { formatCurrency } from '../utils/format.ts';

/*
 * Pure cash-flow forecast engine. No Supabase, no React.
 * All dates are YYYY-MM-DD strings; date arithmetic is done in UTC.
 */

export interface ForecastInvoice {
  id: string;
  invoice_number: string;
  customer_name?: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  status: string;
}

export interface ForecastPayment {
  payment_amount: number;
}

export interface ForecastExpense {
  id: string;
  amount: number;
  expense_date: string;
  due_date: string | null;
  payment_status: 'paid' | 'pending';
}

export interface ForecastDayPoint {
  date: string;
  balance: number;
  inflow: number;
  outflow: number;
}

export interface ForecastResult {
  currentCash: number;
  expectedInflowsTotal: number;
  inflowsDueInHorizon: number;
  overdueOutstanding: number;
  upcomingExpensesTotal: number;
  predictedEndingBalance: number;
  firstNegativeDate: string | null;
  daysUntilNegative: number | null;
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
  series: ForecastDayPoint[];
  insights: string[];
  overdueInvoiceCount: number;
}

export interface ComputeForecastInput {
  invoices: ForecastInvoice[];
  payments: ForecastPayment[];
  expenses: ForecastExpense[];
  today: string;
  horizonDays: 30 | 60 | 90 | number;
}

interface PlacedItem {
  date: string;
  amount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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

function addDays(ymd: string, days: number): string {
  return new Date(parseUtc(ymd) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseUtc(to) - parseUtc(from)) / DAY_MS);
}

export function computeForecast(input: ComputeForecastInput): ForecastResult {
  const invoices = input.invoices ?? [];
  const payments = input.payments ?? [];
  const expenses = input.expenses ?? [];
  const today = input.today;
  const horizon = Math.max(0, Math.floor(toNum(input.horizonDays)));
  // Last day inside the horizon. With horizon 0 this is yesterday, so nothing is inside.
  const endDate = addDays(today, horizon - 1);

  // 1. Current cash
  const receipts = payments.reduce((sum, p) => sum + toNum(p?.payment_amount), 0);
  const paidExpenses = expenses
    .filter((e) => e?.payment_status === 'paid')
    .reduce((sum, e) => sum + toNum(e.amount), 0);
  const currentCash = round2(receipts - paidExpenses);

  // 2. Collections (invoices)
  const collections: Array<PlacedItem & { overdue: boolean }> = [];
  let overdueOutstandingRaw = 0;
  let overdueInvoiceCount = 0;
  for (const inv of invoices) {
    if (!inv || inv.status === 'draft') continue;
    const outstanding = round2(Math.max(0, toNum(inv.total_amount) - toNum(inv.paid_amount)));
    if (outstanding <= 0) continue;
    const due = inv.due_date || today;
    const overdue = due < today;
    if (overdue) {
      overdueOutstandingRaw += outstanding;
      overdueInvoiceCount += 1;
    }
    collections.push({ date: overdue ? today : due, amount: outstanding, overdue });
  }
  const overdueOutstanding = round2(overdueOutstandingRaw);

  // 3. Expenses (pending only)
  const outflows: PlacedItem[] = [];
  let hasEstimatedExpense = false;
  for (const e of expenses) {
    if (!e || e.payment_status !== 'pending') continue;
    if (!e.due_date) hasEstimatedExpense = true;
    const raw = e.due_date || e.expense_date;
    const date = raw < today ? today : raw;
    outflows.push({ date, amount: round2(toNum(e.amount)) });
  }

  // 4. Bucket items by day, keeping only those inside the horizon
  const inflowByDate = new Map<string, number>();
  const outflowByDate = new Map<string, number>();
  let expectedInflowsRaw = 0;
  let inflowsDueRaw = 0;
  for (const c of collections) {
    if (c.date > endDate) continue;
    expectedInflowsRaw += c.amount;
    if (!c.overdue) inflowsDueRaw += c.amount;
    inflowByDate.set(c.date, (inflowByDate.get(c.date) ?? 0) + c.amount);
  }
  let upcomingExpensesRaw = 0;
  for (const o of outflows) {
    if (o.date > endDate) continue;
    upcomingExpensesRaw += o.amount;
    outflowByDate.set(o.date, (outflowByDate.get(o.date) ?? 0) + o.amount);
  }
  const expectedInflowsTotal = round2(expectedInflowsRaw);
  const inflowsDueInHorizon = round2(inflowsDueRaw);
  const upcomingExpensesTotal = round2(upcomingExpensesRaw);

  const series: ForecastDayPoint[] = [];
  let running = currentCash;
  for (let i = 0; i < horizon; i++) {
    const date = addDays(today, i);
    const inflow = round2(inflowByDate.get(date) ?? 0);
    const outflow = round2(outflowByDate.get(date) ?? 0);
    running = round2(running + inflow - outflow);
    series.push({ date, balance: running, inflow, outflow });
  }

  const predictedEndingBalance = series.length > 0 ? series[series.length - 1].balance : currentCash;

  // 6. Negative balance detection
  const firstNegative = series.find((p) => p.balance < 0);
  const firstNegativeDate = firstNegative ? firstNegative.date : null;
  const daysUntilNegative = firstNegative ? daysBetween(today, firstNegative.date) : null;

  // 7. Confidence
  let confidence: 'high' | 'medium' | 'low';
  let confidenceReason: string;
  if (expectedInflowsTotal > 0 && overdueOutstanding > 0.5 * expectedInflowsTotal) {
    confidence = 'low';
    confidenceReason =
      'Overdue invoices make up more than half of the expected inflows, so confidence is rated low.';
  } else if (overdueOutstanding > 0) {
    confidence = 'medium';
    confidenceReason = 'Some invoices are overdue, so confidence is rated medium.';
  } else {
    confidence = 'high';
    confidenceReason = 'No invoices are overdue, so confidence is rated high.';
  }
  if (hasEstimatedExpense && confidence === 'high') {
    confidence = 'medium';
    confidenceReason =
      'Some pending expenses have no due date and are estimated from their expense date, so confidence is capped at medium.';
  }

  // 8. Insights (computed numbers only)
  const insights: string[] = [];
  if (firstNegativeDate !== null && daysUntilNegative !== null) {
    insights.push(
      `Your balance may become negative on ${firstNegativeDate} (${daysUntilNegative} days from today).`,
    );
  }
  if (inflowsDueInHorizon > 0) {
    insights.push(
      `You are expecting ${formatCurrency(inflowsDueInHorizon)} from outstanding invoices due in the next ${horizon} days.`,
    );
  }
  if (overdueOutstanding > 0) {
    const n = overdueInvoiceCount;
    insights.push(
      `${n} ${n === 1 ? 'invoice is' : 'invoices are'} overdue, totalling ${formatCurrency(overdueOutstanding)}. Follow up to improve your cash position.`,
    );
  }
  if (upcomingExpensesTotal > 0) {
    insights.push(
      `You have ${formatCurrency(upcomingExpensesTotal)} in pending expenses due in this period.`,
    );
  }
  if (invoices.length === 0 && expenses.length === 0 && payments.length === 0) {
    insights.push(
      'No invoices, payments or expenses are recorded yet, so this forecast has no data.',
    );
  }

  return {
    currentCash,
    expectedInflowsTotal,
    inflowsDueInHorizon,
    overdueOutstanding,
    upcomingExpensesTotal,
    predictedEndingBalance,
    firstNegativeDate,
    daysUntilNegative,
    confidence,
    confidenceReason,
    series,
    insights,
    overdueInvoiceCount,
  };
}
