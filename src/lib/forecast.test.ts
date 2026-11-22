import { describe, it, expect } from 'vitest';
import { computeForecast, type ForecastInvoice, type ForecastExpense } from './forecast.ts';

const TODAY = '2025-01-10';

function invoice(overrides: Partial<ForecastInvoice> = {}): ForecastInvoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV-001',
    customer_name: 'Acme',
    due_date: '2025-02-01',
    total_amount: 10000,
    paid_amount: 0,
    status: 'sent',
    ...overrides,
  };
}

function expense(overrides: Partial<ForecastExpense> = {}): ForecastExpense {
  return {
    id: 'exp-1',
    amount: 1000,
    expense_date: '2025-01-05',
    due_date: '2025-01-20',
    payment_status: 'pending',
    ...overrides,
  };
}

describe('computeForecast', () => {
  it.each([
    [30, '2025-02-08'],
    [60, '2025-03-10'],
    [90, '2025-04-09'],
  ])('produces a series of exactly %i days', (days, lastDate) => {
    const result = computeForecast({
      invoices: [],
      payments: [],
      expenses: [],
      today: TODAY,
      horizonDays: days,
    });
    expect(result.series).toHaveLength(days);
    expect(result.series[0].date).toBe(TODAY);
    expect(result.series[days - 1].date).toBe(lastDate);
  });

  it('counts only the unpaid part of a partially paid invoice', () => {
    const result = computeForecast({
      invoices: [invoice({ total_amount: 10000, paid_amount: 4000, status: 'partial' })],
      payments: [],
      expenses: [],
      today: TODAY,
      horizonDays: 30,
    });
    expect(result.expectedInflowsTotal).toBe(6000);
    expect(result.inflowsDueInHorizon).toBe(6000);
    expect(result.currentCash).toBe(0);
    expect(result.insights.some((i) => i.includes('₹'))).toBe(true);
  });

  it('places an overdue invoice on today and counts it as overdue', () => {
    const result = computeForecast({
      invoices: [invoice({ due_date: '2025-01-05', total_amount: 5000, paid_amount: 0 })],
      payments: [],
      expenses: [],
      today: TODAY,
      horizonDays: 30,
    });
    expect(result.series[0].date).toBe(TODAY);
    expect(result.series[0].inflow).toBe(5000);
    expect(result.overdueOutstanding).toBe(5000);
    expect(result.overdueInvoiceCount).toBe(1);
    expect(result.expectedInflowsTotal).toBe(5000);
    expect(result.inflowsDueInHorizon).toBe(0);
    expect(result.confidence).toBe('low');
  });

  it('excludes a paid expense from currentCash and upcomingExpensesTotal', () => {
    const result = computeForecast({
      invoices: [],
      payments: [{ payment_amount: 5000 }],
      expenses: [expense({ amount: 800, payment_status: 'paid', due_date: null, expense_date: '2025-01-08' })],
      today: TODAY,
      horizonDays: 30,
    });
    expect(result.currentCash).toBe(4200);
    expect(result.upcomingExpensesTotal).toBe(0);
    expect(result.series.every((p) => p.outflow === 0)).toBe(true);
  });

  it('places a pending expense with null due_date on its expense_date', () => {
    const result = computeForecast({
      invoices: [],
      payments: [],
      expenses: [expense({ amount: 300, due_date: null, expense_date: '2025-01-20' })],
      today: TODAY,
      horizonDays: 30,
    });
    const point = result.series.find((p) => p.date === '2025-01-20');
    expect(point?.outflow).toBe(300);
    expect(result.upcomingExpensesTotal).toBe(300);
    expect(result.confidence).toBe('medium');
  });

  it('detects the first negative balance and days until it happens', () => {
    const result = computeForecast({
      invoices: [],
      payments: [{ payment_amount: 1000 }],
      expenses: [expense({ amount: 1500, due_date: '2025-01-15', expense_date: '2025-01-01' })],
      today: TODAY,
      horizonDays: 30,
    });
    expect(result.currentCash).toBe(1000);
    expect(result.firstNegativeDate).toBe('2025-01-15');
    expect(result.daysUntilNegative).toBe(5);
    expect(result.predictedEndingBalance).toBe(-500);
  });

  it('returns zero cash, a full-length series and the no-data insight for empty input', () => {
    const result = computeForecast({
      invoices: [],
      payments: [],
      expenses: [],
      today: TODAY,
      horizonDays: 30,
    });
    expect(result.currentCash).toBe(0);
    expect(result.series).toHaveLength(30);
    expect(result.firstNegativeDate).toBeNull();
    expect(result.daysUntilNegative).toBeNull();
    expect(result.insights).toContain(
      'No invoices, payments or expenses are recorded yet, so this forecast has no data.',
    );
  });

  it('excludes draft invoices from collections', () => {
    const result = computeForecast({
      invoices: [invoice({ status: 'draft', due_date: '2025-01-20', total_amount: 2000, paid_amount: 0 })],
      payments: [],
      expenses: [],
      today: TODAY,
      horizonDays: 30,
    });
    expect(result.expectedInflowsTotal).toBe(0);
    expect(result.inflowsDueInHorizon).toBe(0);
    expect(result.series.every((p) => p.inflow === 0)).toBe(true);
  });
});
