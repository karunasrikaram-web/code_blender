// Database-shaped types for the Phase 2 Supabase schema (snake_case columns).
// Money columns are numeric in Postgres; the service layer converts them with Number().

export type InvoiceStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'upi' | 'cheque' | 'card' | 'other';

export type PaymentStatus = 'paid' | 'pending';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  business_name: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  user_id: string;
  customer_name: string;
  email: string | null;
  phone: string | null;
  project_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  user_id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  description: string | null;
  subtotal: number;
  total_amount: number;
  paid_amount: number;
  status: InvoiceStatus;
  created_at: string;
  /** Present when queried with '*, customer:customers(id, customer_name)'. */
  customer?: Pick<Customer, 'id' | 'customer_name'> | null;
}

export interface Payment {
  id: string;
  user_id: string;
  invoice_id: string;
  customer_id: string;
  payment_amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  notes: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  user_id: string;
  expense_title: string;
  category: string;
  amount: number;
  expense_date: string;
  due_date: string | null;
  payment_status: PaymentStatus;
  notes: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CustomerInput {
  customer_name: string;
  email?: string | null;
  phone?: string | null;
  project_name?: string | null;
  notes?: string | null;
}

export interface InvoiceInput {
  customer_id: string;
  /** Optional: when omitted the service generates the next number. */
  invoice_number?: string;
  invoice_date: string;
  due_date: string;
  description?: string | null;
  subtotal: number;
  total_amount: number;
}

export interface PaymentInput {
  invoice_id: string;
  payment_amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  notes?: string | null;
}

export interface ExpenseInput {
  expense_title: string;
  category: string;
  amount: number;
  expense_date: string;
  due_date?: string | null;
  payment_status: PaymentStatus;
  notes?: string | null;
}
