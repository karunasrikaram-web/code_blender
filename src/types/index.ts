export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  projectName: string;
  notes: string;
  createdAt: string;
}

export type InvoiceStatus = 'draft' | 'pending' | 'partially_paid' | 'paid' | 'overdue';

export type PaymentMethod = 'Bank transfer' | 'Cash' | 'Card' | 'UPI' | 'Cheque' | 'Other';

export const PAYMENT_METHODS: PaymentMethod[] = ['Bank transfer', 'Cash', 'Card', 'UPI', 'Cheque', 'Other'];

export interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  description: string;
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  status: InvoiceStatus;
  items: InvoiceItem[];
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentDate: string;
  method: PaymentMethod;
  notes: string;
  createdAt: string;
}

export type ExpenseStatus = 'paid' | 'pending';

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  expenseDate: string;
  dueDate: string | null;
  paymentStatus: ExpenseStatus;
  notes: string;
  createdAt: string;
}

export const EXPENSE_CATEGORIES: string[] = [
  'Software subscriptions',
  'Internet bills',
  'Salaries',
  'Office rent',
  'Marketing',
  'Other expenses',
];

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  businessName: string;
}
