import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Clock, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import type { StatAccent } from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import Table from '../components/ui/Table';
import type { TableColumn } from '../components/ui/Table';
import type { DashboardSummary } from '../services/api';
import { getDashboardSummary, listInvoices, listPayments } from '../services/api';
import { getProfile } from '../services/settingsApi';
import type { Invoice, InvoiceStatus, Payment } from '../types';
import type { SampleInvoiceStatus } from '../types/sample';
import { formatCurrency, formatDate, formatInrCompact } from '../utils/format';

interface StatItem {
  label: string;
  value: number | null;
  icon: LucideIcon;
  accent: StatAccent;
}

// StatusBadge only knows the sample labels, so map the real invoice status onto them.
function toBadgeStatus(status: InvoiceStatus): SampleInvoiceStatus {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'pending':
    case 'partially_paid':
      return 'Pending';
    case 'paid':
      return 'Paid';
    case 'overdue':
      return 'Overdue';
  }
}

const invoiceColumns: TableColumn<Invoice>[] = [
  { key: 'number', header: 'Invoice', render: (invoice) => invoice.invoiceNumber },
  { key: 'customer', header: 'Customer', render: (invoice) => invoice.customerName },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    render: (invoice) => formatCurrency(invoice.totalAmount),
  },
  {
    key: 'status',
    header: 'Status',
    render: (invoice) => <StatusBadge status={toBadgeStatus(invoice.status)} />,
  },
];

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getProfile()
      .then((profile) => {
        if (!active) return;
        const name = profile.full_name.trim() || profile.email.trim().split('@')[0] || '';
        const first = name.split(/\s+/)[0] ?? '';
        setFirstName(first !== '' ? first : null);
      })
      .catch(() => {
        // Omit the welcome line if the profile cannot be loaded.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getDashboardSummary(), listInvoices(), listPayments()])
      .then(([summaryData, invoiceData, paymentData]) => {
        if (!active) return;
        setSummary(summaryData);
        setInvoices(invoiceData);
        setPayments(paymentData);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Could not load dashboard data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const stats: StatItem[] = [
    { label: 'Total Revenue', value: summary?.revenueReceived ?? null, icon: TrendingUp, accent: 'success' },
    { label: 'Outstanding Payments', value: summary?.outstandingTotal ?? null, icon: Clock, accent: 'warning' },
    { label: 'Overdue Payments', value: summary?.overdueTotal ?? null, icon: AlertTriangle, accent: 'danger' },
    { label: 'Total Expenses', value: summary?.totalExpenses ?? null, icon: Receipt, accent: 'info' },
    { label: 'Available Cash Balance', value: summary?.cashBalance ?? null, icon: Wallet, accent: 'primary' },
  ];

  const recentInvoices: Invoice[] = summary?.recentInvoices ?? [];

  const upcomingPayments = invoices
    .filter((invoice) => invoice.status !== 'draft' && invoice.balanceDue > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  const recentPayments = payments.slice(0, 5);

  return (
    <div>
      <div className="ui-page-header">
        <PageHeader
          title="Dashboard"
          description="Here is your business at a glance."
          actions={
            <Link to="/invoices" className="btn btn-primary">
              New invoice
            </Link>
          }
        />
      </div>

      {firstName && <p className="dashboard-welcome">Welcome back, {firstName}</p>}

      {error && (
        <p role="alert" style={{ color: '#dc2626' }}>
          Could not load dashboard data: {error}
        </p>
      )}
      {loading && !error && <p className="dashboard-list-text">Loading dashboard…</p>}

      <div className="stat-grid">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value === null ? '—' : formatCurrency(stat.value)}
            icon={stat.icon}
            accent={stat.accent}
          />
        ))}
      </div>

      <Card title="Revenue overview" className="dashboard-section">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={summary?.monthly ?? []} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" stroke="#64748b" tickLine={false} />
            <YAxis
              stroke="#64748b"
              tickLine={false}
              tickFormatter={(value: number) => formatInrCompact(value)}
            />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="#4f46e5"
              strokeWidth={2}
              fill="url(#revenueFill)"
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke="#dc2626"
              strokeWidth={2}
              fill="transparent"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="dashboard-two-col dashboard-section">
        <Card
          title="Recent invoices"
          actions={
            <Link to="/invoices" className="btn btn-ghost btn-sm">
              View all
            </Link>
          }
        >
          <Table
            columns={invoiceColumns}
            rows={recentInvoices}
            getRowKey={(invoice) => invoice.id}
          />
        </Card>

        <Card title="Recent customer activities">
          {loading ? (
            <p className="dashboard-list-text">Loading…</p>
          ) : recentPayments.length === 0 ? (
            <p className="dashboard-list-text">No payments recorded yet.</p>
          ) : (
            <ul className="dashboard-list">
              {recentPayments.map((payment) => (
                <li key={payment.id} className="dashboard-list-item">
                  <div className="dashboard-list-main">
                    <span className="dashboard-list-title">{payment.customerName}</span>
                    <span className="dashboard-list-text">
                      {formatCurrency(payment.amount)} received for {payment.invoiceNumber}
                    </span>
                  </div>
                  <span className="dashboard-list-meta">{formatDate(payment.paymentDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="dashboard-two-col dashboard-section">
        <Card title="Upcoming payments">
          {loading ? (
            <p className="dashboard-list-text">Loading…</p>
          ) : upcomingPayments.length === 0 ? (
            <p className="dashboard-list-text">No outstanding invoices.</p>
          ) : (
            <ul className="dashboard-list">
              {upcomingPayments.map((invoice) => (
                <li key={invoice.id} className="dashboard-list-item">
                  <div className="dashboard-list-main">
                    <span className="dashboard-list-title">{invoice.customerName}</span>
                    <span className="dashboard-list-text">{invoice.invoiceNumber}</span>
                    <span className="dashboard-list-meta">Due {formatDate(invoice.dueDate)}</span>
                  </div>
                  <span className="dashboard-list-amount">{formatCurrency(invoice.balanceDue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Important notifications"
          actions={
            <Link to="/notifications" className="btn btn-ghost btn-sm">
              View all
            </Link>
          }
        >
          <p className="dashboard-list-text">No data yet.</p>
        </Card>
      </div>
    </div>
  );
}
