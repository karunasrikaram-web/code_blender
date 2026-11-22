import { TrendingUp } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import type {
  ForecastExpense,
  ForecastInvoice,
  ForecastPayment,
  ForecastResult,
} from '../lib/forecast';
import { computeForecast } from '../lib/forecast';
import { listExpenses, listInvoices, listPayments } from '../services/api';
import type { Expense, Invoice, Payment } from '../types';
import { formatCurrency, formatInrCompact } from '../utils/format';

const HORIZONS = [30, 60, 90] as const;
type HorizonDays = (typeof HORIZONS)[number];

interface ForecastSource {
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
}

const NAVY = '#1e3a8a';
const POSITIVE = '#16a34a';
const NEGATIVE = '#dc2626';

const skeletonStyle: CSSProperties = {
  background: 'var(--color-border)',
  borderRadius: 'var(--radius-md)',
  height: 96,
};

const bannerStyle: CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#991b1b',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-4)',
  marginBottom: 'var(--space-6)',
};

const mutedStyle: CSSProperties = {
  color: 'var(--color-muted)',
  fontSize: 'var(--font-size-sm)',
  margin: 'var(--space-1) 0 0',
};

/** Local calendar date as YYYY-MM-DD. */
function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toForecastInvoice(inv: Invoice): ForecastInvoice {
  return {
    id: inv.id,
    invoice_number: inv.invoiceNumber,
    ...(inv.customerName ? { customer_name: inv.customerName } : {}),
    due_date: inv.dueDate,
    total_amount: inv.totalAmount,
    paid_amount: inv.paidAmount,
    status: inv.status,
  };
}

function toForecastPayment(p: Payment): ForecastPayment {
  return { payment_amount: p.amount };
}

function toForecastExpense(e: Expense): ForecastExpense {
  return {
    id: e.id,
    amount: e.amount,
    expense_date: e.expenseDate,
    due_date: e.dueDate,
    payment_status: e.paymentStatus,
  };
}

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div style={mutedStyle}>{note}</div>}
    </div>
  );
}

export default function CashFlowForecastPage() {
  const [source, setSource] = useState<ForecastSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<HorizonDays>(30);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listInvoices(), listPayments(), listExpenses()])
      .then(([invoices, payments, expenses]) => {
        if (!cancelled) setSource({ invoices, payments, expenses });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load forecast data.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const forecast: ForecastResult | null = useMemo(() => {
    if (!source) return null;
    return computeForecast({
      invoices: source.invoices.map(toForecastInvoice),
      payments: source.payments.map(toForecastPayment),
      expenses: source.expenses.map(toForecastExpense),
      today: toLocalYmd(new Date()),
      horizonDays: horizon,
    });
  }, [source, horizon]);

  const isEmpty =
    source !== null &&
    source.invoices.length === 0 &&
    source.payments.length === 0 &&
    source.expenses.length === 0;

  return (
    <div>
      <div className="ui-page-header">
        <PageHeader
          title="Cash Flow Forecast"
          description="See how upcoming invoices and expenses are expected to shape your cash position."
        />
      </div>

      <div
        role="group"
        aria-label="Forecast period"
        style={{
          display: 'inline-flex',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          marginBottom: 'var(--space-6)',
        }}
      >
        {HORIZONS.map((days) => {
          const active = days === horizon;
          return (
            <button
              key={days}
              type="button"
              aria-pressed={active}
              onClick={() => setHorizon(days)}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                border: 'none',
                cursor: 'pointer',
                background: active ? 'var(--color-primary)' : 'var(--color-card)',
                color: active ? '#fff' : 'inherit',
                fontWeight: 600,
              }}
            >
              {days} days
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="stat-grid" aria-busy="true">
          <div style={skeletonStyle} />
          <div style={skeletonStyle} />
          <div style={skeletonStyle} />
          <div style={skeletonStyle} />
          <div style={skeletonStyle} />
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="ui-alert-error" style={bannerStyle}>
          {error}
        </div>
      )}

      {!loading && !error && isEmpty && (
        <EmptyState
          icon={TrendingUp}
          title="No financial records yet."
          description="Add invoices, payments or expenses to see a forecast."
        />
      )}

      {!loading && !error && !isEmpty && forecast && (
        <>
          {forecast.firstNegativeDate !== null && (
            <div role="alert" style={bannerStyle}>
              Balance may become negative on {forecast.firstNegativeDate} (in{' '}
              {forecast.daysUntilNegative} days).
            </div>
          )}

          <div className="stat-grid">
            <StatTile
              label="Recorded cash position"
              value={formatCurrency(forecast.currentCash)}
              note="No opening balance is stored; this is recorded receipts minus paid expenses."
            />
            <StatTile
              label="Expected incoming"
              value={formatCurrency(forecast.expectedInflowsTotal)}
              note={`Confirmed (due in period): ${formatCurrency(forecast.inflowsDueInHorizon)} · Estimated (overdue, assumed today): ${formatCurrency(forecast.overdueOutstanding)}`}
            />
            <StatTile
              label="Upcoming expenses"
              value={formatCurrency(forecast.upcomingExpensesTotal)}
              note="Pending expenses due in this period."
            />
            <StatTile
              label="Predicted ending balance"
              value={formatCurrency(forecast.predictedEndingBalance)}
              note={`At the end of the next ${horizon} days (estimated).`}
            />
            <StatTile
              label="Forecast confidence"
              value={forecast.confidence.charAt(0).toUpperCase() + forecast.confidence.slice(1)}
              note={forecast.confidenceReason}
            />
          </div>

          <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <h2 className="card-title">Projected balance</h2>
            <p style={mutedStyle}>
              Points after today are estimates based on due dates and pending expenses.
            </p>
            <div style={{ width: '100%', height: 280, marginTop: 'var(--space-4)' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecast.series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value: string) => formatShortDate(value)}
                    minTickGap={24}
                  />
                  <YAxis
                    width={72}
                    tickFormatter={(value: number) => formatInrCompact(value)}
                  />
                  <Tooltip
                    labelFormatter={(label) => `${formatShortDate(String(label))} (estimated)`}
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                  <ReferenceLine
                    y={0}
                    stroke={forecast.firstNegativeDate !== null ? NEGATIVE : POSITIVE}
                    strokeDasharray="4 4"
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    name="Balance"
                    stroke={NAVY}
                    fill={NAVY}
                    fillOpacity={0.08}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Insights</h2>
            {forecast.insights.length === 0 ? (
              <p className="ui-empty" style={mutedStyle}>No insights for this period.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
                {forecast.insights.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
