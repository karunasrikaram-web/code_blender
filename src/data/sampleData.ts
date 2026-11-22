import type {
  Activity,
  AppNotification,
  SampleCustomer,
  SampleInvoice,
  SamplePayment,
} from '../types/sample';

// Sample data for Alex Morgan, a freelance website designer.
// Invoice totals are consistent with customer paidAmount values:
// paid invoices = $17,750, outstanding (Pending + Overdue) = $9,850, overdue = $6,000.

export const sampleCustomers: SampleCustomer[] = [
  {
    id: 'cus-001',
    name: 'Sarah Mitchell',
    email: 'sarah.mitchell@bloombotanicals.com',
    phone: '+1 (415) 555-0142',
    projectName: 'E-commerce redesign for Bloom Botanicals',
    projectAmount: 6800,
    paidAmount: 6800,
    status: 'Paid',
  },
  {
    id: 'cus-002',
    name: 'David Okafor',
    email: 'david@northpeakfitness.com',
    phone: '+1 (312) 555-0187',
    projectName: 'Marketing website for North Peak Fitness',
    projectAmount: 4500,
    paidAmount: 2250,
    status: 'Partially Paid',
  },
  {
    id: 'cus-003',
    name: 'Lena Rodriguez',
    email: 'lena.rodriguez@harborvale.com',
    phone: '+1 (206) 555-0163',
    projectName: 'Client portal and website for Harbor & Vale LLP',
    projectAmount: 9200,
    paidAmount: 0,
    status: 'Overdue',
  },
  {
    id: 'cus-004',
    name: 'Marcus Johnson',
    email: 'marcus@summitrealty.com',
    phone: '+1 (720) 555-0129',
    projectName: 'Property listing site for Summit Realty Group',
    projectAmount: 5400,
    paidAmount: 5400,
    status: 'Paid',
  },
  {
    id: 'cus-005',
    name: 'Priya Patel',
    email: 'priya@greenleafcafe.com',
    phone: '+1 (503) 555-0175',
    projectName: 'Online ordering website for Greenleaf Café',
    projectAmount: 3200,
    paidAmount: 0,
    status: 'Unpaid',
  },
  {
    id: 'cus-006',
    name: 'Tom Becker',
    email: 'tom@ironoakbrewing.com',
    phone: '+1 (617) 555-0118',
    projectName: 'Brand website and landing pages for Iron Oak Brewing',
    projectAmount: 2800,
    paidAmount: 1400,
    status: 'Overdue',
  },
  {
    id: 'cus-007',
    name: 'Hannah Lee',
    email: 'hannah@lumenstudio.io',
    phone: '+1 (512) 555-0196',
    projectName: 'Portfolio website for Lumen Photography Studio',
    projectAmount: 1900,
    paidAmount: 1900,
    status: 'Paid',
  },
  {
    id: 'cus-008',
    name: 'Carlos Mendes',
    email: 'carlos@brightpathedu.org',
    phone: '+1 (305) 555-0151',
    projectName: 'LMS landing page redesign for BrightPath Education',
    projectAmount: 7600,
    paidAmount: 0,
    status: 'Unpaid',
  },
];

export const sampleInvoices: SampleInvoice[] = [
  { id: 'inv-001', number: 'INV-2025-001', customerId: 'cus-001', customerName: 'Sarah Mitchell', amount: 3400, issueDate: '2025-01-10', dueDate: '2025-01-24', status: 'Paid' },
  { id: 'inv-002', number: 'INV-2025-002', customerId: 'cus-001', customerName: 'Sarah Mitchell', amount: 3400, issueDate: '2025-02-03', dueDate: '2025-02-17', status: 'Paid' },
  { id: 'inv-003', number: 'INV-2025-003', customerId: 'cus-002', customerName: 'David Okafor', amount: 2250, issueDate: '2025-01-20', dueDate: '2025-02-03', status: 'Paid' },
  { id: 'inv-004', number: 'INV-2025-004', customerId: 'cus-003', customerName: 'Lena Rodriguez', amount: 4600, issueDate: '2025-02-01', dueDate: '2025-02-15', status: 'Overdue' },
  { id: 'inv-005', number: 'INV-2025-005', customerId: 'cus-004', customerName: 'Marcus Johnson', amount: 2700, issueDate: '2025-01-15', dueDate: '2025-01-29', status: 'Paid' },
  { id: 'inv-006', number: 'INV-2025-006', customerId: 'cus-004', customerName: 'Marcus Johnson', amount: 2700, issueDate: '2025-02-20', dueDate: '2025-03-06', status: 'Paid' },
  { id: 'inv-007', number: 'INV-2025-007', customerId: 'cus-005', customerName: 'Priya Patel', amount: 1600, issueDate: '2025-05-08', dueDate: '2025-06-07', status: 'Pending' },
  { id: 'inv-008', number: 'INV-2025-008', customerId: 'cus-006', customerName: 'Tom Becker', amount: 1400, issueDate: '2025-03-02', dueDate: '2025-03-16', status: 'Paid' },
  { id: 'inv-009', number: 'INV-2025-009', customerId: 'cus-006', customerName: 'Tom Becker', amount: 1400, issueDate: '2025-04-10', dueDate: '2025-04-24', status: 'Overdue' },
  { id: 'inv-010', number: 'INV-2025-010', customerId: 'cus-007', customerName: 'Hannah Lee', amount: 1900, issueDate: '2025-03-05', dueDate: '2025-03-19', status: 'Paid' },
  { id: 'inv-011', number: 'INV-2025-011', customerId: 'cus-008', customerName: 'Carlos Mendes', amount: 3800, issueDate: '2025-05-18', dueDate: '2025-06-17', status: 'Draft' },
  { id: 'inv-012', number: 'INV-2025-012', customerId: 'cus-002', customerName: 'David Okafor', amount: 2250, issueDate: '2025-05-01', dueDate: '2025-05-31', status: 'Pending' },
];

export const sampleActivities: Activity[] = [
  { id: 'act-001', customerName: 'Carlos Mendes', description: 'Draft invoice INV-2025-011 created', date: '2025-05-18', type: 'invoice' },
  { id: 'act-002', customerName: 'Lena Rodriguez', description: 'Overdue reminder sent for INV-2025-004', date: '2025-05-17', type: 'reminder' },
  { id: 'act-003', customerName: 'Priya Patel', description: 'Invoice INV-2025-007 sent', date: '2025-05-08', type: 'invoice' },
  { id: 'act-004', customerName: 'David Okafor', description: 'Balance invoice INV-2025-012 sent', date: '2025-05-01', type: 'invoice' },
  { id: 'act-005', customerName: 'Hannah Lee', description: 'Final payment of $1,900.00 received', date: '2025-03-18', type: 'payment' },
  { id: 'act-006', customerName: 'Tom Becker', description: 'Partial payment of $1,400.00 received', date: '2025-03-14', type: 'payment' },
];

export const samplePayments: SamplePayment[] = [
  { id: 'pay-001', customerName: 'Sarah Mitchell', amount: 450, dueDate: '2025-06-15', description: 'Monthly SEO and maintenance retainer' },
  { id: 'pay-002', customerName: 'Priya Patel', amount: 1600, dueDate: '2025-06-07', description: 'Online ordering website (INV-2025-007)' },
  { id: 'pay-003', customerName: 'Carlos Mendes', amount: 3800, dueDate: '2025-06-17', description: 'Milestone 1: LMS landing page design (INV-2025-011)' },
  { id: 'pay-004', customerName: 'Lena Rodriguez', amount: 4600, dueDate: '2025-06-20', description: 'Client portal, milestone 2' },
  { id: 'pay-005', customerName: 'David Okafor', amount: 2250, dueDate: '2025-05-31', description: 'Final balance for marketing website (INV-2025-012)' },
];

export const sampleNotifications: AppNotification[] = [
  {
    id: 'not-001',
    title: 'Invoice overdue',
    message: 'INV-2025-004 for Lena Rodriguez ($4,600.00) is past due. Send a reminder or follow up.',
    severity: 'danger',
    date: '2025-05-19',
  },
  {
    id: 'not-002',
    title: 'Invoice overdue',
    message: 'INV-2025-009 for Tom Becker ($1,400.00) was due on April 24.',
    severity: 'warning',
    date: '2025-05-19',
  },
  {
    id: 'not-003',
    title: 'Draft invoice ready',
    message: 'INV-2025-011 for Carlos Mendes is saved as a draft and has not been sent yet.',
    severity: 'info',
    date: '2025-05-18',
  },
  {
    id: 'not-004',
    title: 'Payment received',
    message: 'Hannah Lee paid $1,900.00 for the Lumen Photography Studio portfolio site.',
    severity: 'success',
    date: '2025-03-18',
  },
];

export const sampleExpenses: { id: string; category: string; amount: number }[] = [
  { id: 'exp-001', category: 'Coworking desk', amount: 450 },
  { id: 'exp-002', category: 'Design and software subscriptions', amount: 165 },
  { id: 'exp-003', category: 'Web hosting and domains', amount: 48 },
  { id: 'exp-004', category: 'Marketing and advertising', amount: 300 },
  { id: 'exp-005', category: 'Business insurance', amount: 120 },
  { id: 'exp-006', category: 'Accounting and bookkeeping', amount: 225 },
];

/**
 * Twelve months of 2025. Jan–Mar revenue matches the paid invoices above;
 * Apr–Dec values are illustrative chart data.
 */
export const monthlyRevenue: { month: string; revenue: number; expenses: number }[] = [
  { month: 'Jan', revenue: 8350, expenses: 1290 },
  { month: 'Feb', revenue: 6100, expenses: 1308 },
  { month: 'Mar', revenue: 3300, expenses: 1342 },
  { month: 'Apr', revenue: 4200, expenses: 1275 },
  { month: 'May', revenue: 5600, expenses: 1310 },
  { month: 'Jun', revenue: 6900, expenses: 1295 },
  { month: 'Jul', revenue: 4700, expenses: 1330 },
  { month: 'Aug', revenue: 7400, expenses: 1305 },
  { month: 'Sep', revenue: 6100, expenses: 1288 },
  { month: 'Oct', revenue: 5300, expenses: 1320 },
  { month: 'Nov', revenue: 7800, expenses: 1315 },
  { month: 'Dec', revenue: 8900, expenses: 1298 },
];
