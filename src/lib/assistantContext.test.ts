import { describe, it, expect } from 'vitest';
import {
  buildAssistantFacts,
  buildReminderDraft,
  formatFactsForPrompt,
  type AssistantExpense,
  type AssistantInvoice,
} from './assistantContext.ts';

const TODAY = '2025-01-10';

function invoice(overrides: Partial<AssistantInvoice> = {}): AssistantInvoice {
  return {
    id: 'inv-1',
    invoice_number: 'INV-001',
    customer_name: 'Acme Ltd',
    due_date: '2025-02-28',
    total_amount: 10000,
    paid_amount: 0,
    status: 'sent',
    ...overrides,
  };
}

function expense(overrides: Partial<AssistantExpense> = {}): AssistantExpense {
  return {
    id: 'exp-1',
    expense_title: 'Office rent',
    category: 'Rent',
    amount: 5000,
    expense_date: '2025-01-01',
    due_date: '2025-01-20',
    payment_status: 'pending',
    ...overrides,
  };
}

describe('buildAssistantFacts', () => {
  it('subtracts partial payments from the outstanding total', () => {
    const facts = buildAssistantFacts({
      invoices: [invoice({ total_amount: 10000, paid_amount: 4000 })],
      payments: [],
      expenses: [],
      today: TODAY,
    });
    expect(facts.outstandingTotal).toBe(6000);
  });

  it('excludes draft invoices from the outstanding total', () => {
    const facts = buildAssistantFacts({
      invoices: [
        invoice({ id: 'a', total_amount: 10000, paid_amount: 0, status: 'draft' }),
        invoice({ id: 'b', invoice_number: 'INV-002', total_amount: 2500, paid_amount: 0 }),
      ],
      payments: [],
      expenses: [],
      today: TODAY,
    });
    expect(facts.outstandingTotal).toBe(2500);
    expect(facts.outstandingCount).toBe(1);
  });

  it('lists an unpaid invoice due before today as overdue with the correct day count', () => {
    const facts = buildAssistantFacts({
      invoices: [invoice({ invoice_number: 'INV-OLD', due_date: '2025-01-05', total_amount: 3000 })],
      payments: [],
      expenses: [],
      today: TODAY,
    });
    expect(facts.overdueInvoices).toHaveLength(1);
    expect(facts.overdueInvoices[0]?.invoice_number).toBe('INV-OLD');
    expect(facts.overdueInvoices[0]?.daysOverdue).toBe(5);
    expect(facts.overdueTotal).toBe(3000);
    expect(facts.overdueCount).toBe(1);
  });

  it('aggregates two invoices for the same customer', () => {
    const facts = buildAssistantFacts({
      invoices: [
        invoice({ id: 'a', invoice_number: 'INV-A', customer_name: 'Beta Co', total_amount: 1000 }),
        invoice({ id: 'b', invoice_number: 'INV-B', customer_name: 'Beta Co', total_amount: 2000, paid_amount: 500 }),
      ],
      payments: [],
      expenses: [],
      today: TODAY,
    });
    expect(facts.customersWithOutstanding).toEqual([
      { customer_name: 'Beta Co', outstanding: 2500, invoiceCount: 2 },
    ]);
  });

  it('excludes paid expenses from the pending total', () => {
    const facts = buildAssistantFacts({
      invoices: [],
      payments: [],
      expenses: [
        expense({ id: 'p', amount: 5000, payment_status: 'pending' }),
        expense({ id: 'q', amount: 800, payment_status: 'paid' }),
      ],
      today: TODAY,
    });
    expect(facts.pendingExpensesTotal).toBe(5000);
    expect(facts.pendingExpenses).toHaveLength(1);
  });

  it('returns hasAnyData false and zero totals for empty input', () => {
    const facts = buildAssistantFacts({ invoices: [], payments: [], expenses: [], today: TODAY });
    expect(facts.hasAnyData).toBe(false);
    expect(facts.outstandingTotal).toBe(0);
    expect(facts.overdueTotal).toBe(0);
    expect(facts.pendingExpensesTotal).toBe(0);
    expect(facts.totalReceived).toBe(0);
  });
});

describe('formatFactsForPrompt', () => {
  it('contains the rupee sign and the overdue invoice number', () => {
    const facts = buildAssistantFacts({
      invoices: [invoice({ invoice_number: 'INV-OLD', due_date: '2025-01-05', total_amount: 3000 })],
      payments: [],
      expenses: [],
      today: TODAY,
    });
    const text = formatFactsForPrompt(facts);
    expect(text).toContain('₹');
    expect(text).toContain('INV-OLD');
  });
});

describe('buildReminderDraft', () => {
  it('includes customer, invoice number and formatted amount without "Rs."', () => {
    const text = buildReminderDraft({
      customerName: 'Gamma Traders',
      invoiceNumber: 'INV-777',
      outstanding: 125000,
      dueDate: '2025-01-05',
      senderName: 'Priya',
    });
    expect(text).toContain('Gamma Traders');
    expect(text).toContain('INV-777');
    expect(text).toContain('₹1,25,000.00');
    expect(text).not.toContain('Rs.');
  });
});
