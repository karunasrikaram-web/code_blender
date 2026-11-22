import { describe, it, expect } from 'vitest';
import { addDays, runScenario, type ScenarioInput } from './scenarios.ts';
import type { ForecastInvoice } from './forecast.ts';

const TODAY = '2025-01-10';

function inv(
  id: string,
  due: string,
  total: number,
  paid = 0,
  status = 'sent',
): ForecastInvoice {
  return {
    id,
    invoice_number: `INV-${id}`,
    due_date: due,
    total_amount: total,
    paid_amount: paid,
    status,
  };
}

function baseInput(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    invoices: [],
    payments: [],
    expenses: [],
    today: TODAY,
    horizonDays: 30,
    delays: [],
    extraExpenses: [],
    ...overrides,
  };
}

describe('runScenario', () => {
  it('(a) no changes gives zero balance delta and a "No scenario changes" summary', () => {
    const result = runScenario(
      baseInput({ invoices: [inv('a', '2025-01-25', 20000)] }),
    );
    expect(result.balanceDelta).toBe(0);
    expect(result.summary).toContain('No scenario changes were applied.');
  });

  it('(b) delaying a 20000 invoice by 15 days moves its inflow from 2025-01-25 to 2025-02-09', () => {
    // 2025-02-09 is outside a 30-day horizon from 2025-01-10, so use 60 days.
    const result = runScenario(
      baseInput({
        horizonDays: 60,
        invoices: [inv('a', '2025-01-25', 20000)],
        delays: [{ invoiceId: 'a', delayDays: 15 }],
      }),
    );
    expect(result.delayedInvoices).toHaveLength(1);
    expect(result.delayedInvoices[0].originalDue).toBe('2025-01-25');
    expect(result.delayedInvoices[0].simulatedDue).toBe('2025-02-09');

    const origJan25 = result.original.series.find((p) => p.date === '2025-01-25');
    expect(origJan25?.inflow).toBe(20000);

    const simJan25 = result.simulated.series.find((p) => p.date === '2025-01-25');
    expect(simJan25?.inflow).toBe(0);
    const simFeb9 = result.simulated.series.find((p) => p.date === '2025-02-09');
    expect(simFeb9?.inflow).toBe(20000);
  });

  it('(c) an extra 15000 expense on 2025-01-15 gives a balance delta of exactly -15000', () => {
    const result = runScenario(
      baseInput({
        invoices: [inv('a', '2025-01-25', 20000)],
        extraExpenses: [{ amount: 15000, date: '2025-01-15', title: 'Repair' }],
      }),
    );
    expect(result.balanceDelta).toBe(-15000);
    expect(result.summary.some((s) => s.includes('An unexpected expense of'))).toBe(true);
  });

  it('(d) two delayed invoices both appear in delayedInvoices', () => {
    const result = runScenario(
      baseInput({
        invoices: [inv('a', '2025-01-20', 5000), inv('b', '2025-01-28', 7000)],
        delays: [
          { invoiceId: 'a', delayDays: 5 },
          { invoiceId: 'b', delayDays: 10 },
        ],
      }),
    );
    const numbers = result.delayedInvoices.map((d) => d.invoice_number).sort();
    expect(numbers).toEqual(['INV-a', 'INV-b']);
  });

  it('(e) a fully paid invoice is not listed and delaying it changes no balances', () => {
    const result = runScenario(
      baseInput({
        invoices: [inv('paid', '2025-01-20', 5000, 5000)],
        delays: [{ invoiceId: 'paid', delayDays: 10 }],
      }),
    );
    expect(result.delayedInvoices).toHaveLength(0);
    expect(result.balanceDelta).toBe(0);
    expect(result.simulated.predictedEndingBalance).toBe(
      result.original.predictedEndingBalance,
    );
  });

  it('(f) input arrays are not mutated', () => {
    const input = baseInput({
      invoices: [inv('a', '2025-01-25', 20000)],
      payments: [{ payment_amount: 1000 }],
      expenses: [
        {
          id: 'e1',
          amount: 300,
          expense_date: '2025-01-12',
          due_date: '2025-01-14',
          payment_status: 'pending',
        },
      ],
      delays: [{ invoiceId: 'a', delayDays: 15 }],
      extraExpenses: [{ amount: 500, date: '2025-01-18', title: 'Fuel' }],
    });
    const before = JSON.stringify(input);
    runScenario(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('(g) delayDays 7 is clamped to 5 or 10, not kept as 7', () => {
    const result = runScenario(
      baseInput({
        invoices: [inv('a', '2025-01-25', 20000)],
        delays: [{ invoiceId: 'a', delayDays: 7 }],
      }),
    );
    const simulatedDue = result.delayedInvoices[0].simulatedDue;
    expect([addDays('2025-01-25', 5), addDays('2025-01-25', 10)]).toContain(simulatedDue);
    expect(simulatedDue).not.toBe(addDays('2025-01-25', 7));
  });
});

describe('addDays', () => {
  it('adds days across a month boundary using UTC arithmetic', () => {
    expect(addDays('2025-01-25', 15)).toBe('2025-02-09');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});
