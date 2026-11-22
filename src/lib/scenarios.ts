import { computeForecast } from './forecast.ts';
import type {
  ForecastExpense,
  ForecastInvoice,
  ForecastPayment,
  ForecastResult,
} from './forecast.ts';
import { formatCurrency } from '../utils/format.ts';

/*
 * Pure what-if scenario module. No Supabase, no React.
 * Reuses computeForecast from ./forecast for all forecast math.
 * Dates are YYYY-MM-DD strings; date arithmetic is done in UTC.
 */

export const ALLOWED_DELAY_DAYS = [0, 5, 10, 15, 30] as const;

export interface ScenarioDelay {
  invoiceId: string;
  delayDays: number;
}

export interface ScenarioExtraExpense {
  amount: number;
  date: string;
  title: string;
}

export interface ScenarioInput {
  invoices: ForecastInvoice[];
  payments: ForecastPayment[];
  expenses: ForecastExpense[];
  today: string;
  horizonDays: number;
  delays: ScenarioDelay[];
  extraExpenses: ScenarioExtraExpense[];
}

export interface ScenarioDelayedInvoice {
  invoiceId: string;
  invoice_number: string;
  originalDue: string;
  simulatedDue: string;
  amount: number;
}

export interface ScenarioResult {
  original: ForecastResult;
  simulated: ForecastResult;
  balanceDelta: number;
  shortageBefore: string | null;
  shortageAfter: string | null;
  delayedInvoices: ScenarioDelayedInvoice[];
  summary: string[];
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

/** Adds n days to a YYYY-MM-DD date using UTC arithmetic only. */
export function addDays(date: string, n: number): string {
  const base = Date.parse(`${date}T00:00:00Z`);
  return new Date(base + n * DAY_MS).toISOString().slice(0, 10);
}

/** Snaps any delay to the nearest allowed value. Ties go to the lower value. */
function clampDelay(value: number): number {
  const n = toNum(value);
  let best: number = ALLOWED_DELAY_DAYS[0];
  for (const allowed of ALLOWED_DELAY_DAYS) {
    if (Math.abs(allowed - n) < Math.abs(best - n)) best = allowed;
  }
  return best;
}

export function runScenario(input: ScenarioInput): ScenarioResult {
  const invoices = input.invoices ?? [];
  const payments = input.payments ?? [];
  const expenses = input.expenses ?? [];
  const delays = input.delays ?? [];
  const extraExpenses = input.extraExpenses ?? [];

  // 1. Original forecast
  const original = computeForecast({
    invoices,
    payments,
    expenses,
    today: input.today,
    horizonDays: input.horizonDays,
  });

  // 2. Simulated invoices (copies only; inputs are never mutated).
  // If an invoiceId appears more than once, the last entry wins.
  const delayById = new Map<string, number>();
  for (const d of delays) {
    delayById.set(d.invoiceId, clampDelay(d.delayDays));
  }

  const delayedInvoices: ScenarioDelayedInvoice[] = [];
  const simulatedInvoices: ForecastInvoice[] = invoices.map((inv) => {
    const copy: ForecastInvoice = { ...inv };
    const delay = delayById.get(inv.id);
    if (delay === undefined) return copy;

    const originalDue = inv.due_date || input.today;
    const simulatedDue = addDays(originalDue, delay);
    copy.due_date = simulatedDue;

    const outstanding = round2(Math.max(0, toNum(inv.total_amount) - toNum(inv.paid_amount)));
    if (outstanding > 0 && inv.status !== 'draft') {
      delayedInvoices.push({
        invoiceId: inv.id,
        invoice_number: inv.invoice_number,
        originalDue,
        simulatedDue,
        amount: outstanding,
      });
    }
    return copy;
  });

  // 3. Simulated expenses: append extra expenses as pending items.
  const scenarioExpenses: ForecastExpense[] = extraExpenses.map((x, index) => ({
    id: 'scenario-' + index,
    amount: round2(toNum(x.amount)),
    expense_date: x.date,
    due_date: x.date,
    payment_status: 'pending',
  }));
  const simulatedExpenses: ForecastExpense[] = [...expenses, ...scenarioExpenses];

  // 4. Simulated forecast
  const simulated = computeForecast({
    invoices: simulatedInvoices,
    payments,
    expenses: simulatedExpenses,
    today: input.today,
    horizonDays: input.horizonDays,
  });

  // 5. Comparison values
  const balanceDelta = round2(simulated.predictedEndingBalance - original.predictedEndingBalance);
  const shortageBefore = original.firstNegativeDate;
  const shortageAfter = simulated.firstNegativeDate;

  // 6. Summary, built only from computed numbers
  const movedInvoices = delayedInvoices.filter((d) => d.simulatedDue !== d.originalDue);
  const hasChanges = movedInvoices.length > 0 || extraExpenses.length > 0;

  const summary: string[] = [];
  if (!hasChanges) {
    summary.push('No scenario changes were applied.');
  } else {
    summary.push(`Your predicted ending balance changes by ${formatCurrency(balanceDelta)}.`);

    if (shortageBefore === null && shortageAfter !== null) {
      summary.push(`This scenario makes your balance go negative on ${shortageAfter}.`);
    }
    if (shortageBefore !== null && shortageAfter === null) {
      summary.push('This scenario removes the projected shortage.');
    }
    for (const d of movedInvoices) {
      summary.push(`${d.invoice_number} moves from ${d.originalDue} to ${d.simulatedDue}.`);
    }
    for (const x of extraExpenses) {
      summary.push(
        `An unexpected expense of ${formatCurrency(round2(toNum(x.amount)))} is added on ${x.date}.`,
      );
    }
  }

  return {
    original,
    simulated,
    balanceDelta,
    shortageBefore,
    shortageAfter,
    delayedInvoices,
    summary,
  };
}
