import type { SampleInvoice } from '../types/sample';
import { sampleExpenses, sampleInvoices } from './sampleData';

/** Sum of Paid invoices. */
export function totalRevenue(invoices: SampleInvoice[] = sampleInvoices): number {
  return invoices
    .filter((invoice) => invoice.status === 'Paid')
    .reduce((sum, invoice) => sum + invoice.amount, 0);
}

/** Sum of invoices that are neither Paid nor Draft. */
export function outstanding(invoices: SampleInvoice[] = sampleInvoices): number {
  return invoices
    .filter((invoice) => invoice.status !== 'Paid' && invoice.status !== 'Draft')
    .reduce((sum, invoice) => sum + invoice.amount, 0);
}

/** Sum of Overdue invoices. */
export function overdue(invoices: SampleInvoice[] = sampleInvoices): number {
  return invoices
    .filter((invoice) => invoice.status === 'Overdue')
    .reduce((sum, invoice) => sum + invoice.amount, 0);
}

/** Sum of expense entries. */
export function totalExpenses(expenses: { amount: number }[] = sampleExpenses): number {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

/** Total revenue minus total expenses. */
export function availableCash(
  invoices: SampleInvoice[] = sampleInvoices,
  expenses: { amount: number }[] = sampleExpenses,
): number {
  return totalRevenue(invoices) - totalExpenses(expenses);
}
