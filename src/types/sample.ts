// Phase 1 view shapes used by the sample data and the pages that still render it.
// These are separate from the Phase 2 database types in ./index.ts.

export type SampleCustomerStatus = 'Paid' | 'Partially Paid' | 'Unpaid' | 'Overdue';

export interface SampleCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  projectName: string;
  projectAmount: number;
  paidAmount: number;
  status: SampleCustomerStatus;
}

export type SampleInvoiceStatus = 'Paid' | 'Pending' | 'Overdue' | 'Draft';

export interface SampleInvoice {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: SampleInvoiceStatus;
}

export interface Activity {
  id: string;
  customerName: string;
  description: string;
  date: string;
  type: 'invoice' | 'reminder' | 'payment';
}

export interface SamplePayment {
  id: string;
  customerName: string;
  amount: number;
  dueDate: string;
  description: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
  date: string;
}
