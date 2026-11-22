import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PageHeader from '../components/ui/PageHeader';
import type { ForecastExpense, ForecastInvoice, ForecastPayment } from '../lib/forecast';
import type { ScenarioExtraExpense } from '../lib/scenarios';
import { ALLOWED_DELAY_DAYS, runScenario } from '../lib/scenarios';
import { listExpenses, listInvoices, listPayments } from '../services/api';
import type { Expense, Invoice, Payment } from '../types';
import { formatCurrency, formatInrCompact } from '../utils/format';

const HORIZONS = [30, 60, 90] as const;
type HorizonDays = (typeof HORIZONS)[number];

interface SimulatorSource {
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
}

const NAVY = '#1e3a8a';
const SLATE = '#64748b';

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

const inputStyle: CSSProperties = {
  padding: 'var(--space-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  width: '100%',
  boxSizing: 'border-box',
};

const cellStyle: CSSProperties = {
  padding: 'var(--space-2)',
  borderBottom: '1px solid var(--color-border)',
  textAlign: 'left',
};

const twoColumnStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
  gap: 'var(--space-6)',
  marginBottom: 'var(--space-6)',
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

export default function WhatIfSimulatorPage() {
  const [source, setSource] = useState<SimulatorSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<HorizonDays>(30);

  // Scenario state is temporary React state only. Nothing here is persisted.
  const [today] = useState(() => toLocalYmd(new Date()));
  const [delays, setDelays] = useState<Record<string, number>>({});
  const [extraExpenses, setExtraExpenses] = useState<ScenarioExtraExpense[]>([]);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(today);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseError, setExpenseError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listInvoices(), listPayments(), listExpenses()])
      .then(([invoices, payments, expenses]) => {
        if (!cancelled) setSource({ invoices, payments, expenses });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load simulator data.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const forecastInvoices: ForecastInvoice[] = useMemo(
    () => (source ? source.invoices.map(toForecastInvoice) : []),
    [source],
  );
  const forecastPayments: ForecastPayment[] = useMemo(
    () => (source ? source.payments.map(toForecastPayment) : []),
    [source],
  );
  const forecastExpenses: ForecastExpense[] = useMemo(
    () => (source ? source.expenses.map(toForecastExpense) : []),
    [source],
  );

  const unpaidInvoices: ForecastInvoice[] = useMemo(
    () =>
      forecastInvoices.filter(
        (inv) => inv.status !== 'draft' && Number(inv.total_amount) - Number(inv.paid_amount) > 0,
      ),
    [forecastInvoices],
  );

  const scenario = useMemo(() => {
    if (!source) return null;
    const delayList = Object.entries(delays).map(([invoiceId, delayDays]) => ({
      invoiceId,
      delayDays,
    }));
    return runScenario({
      invoices: forecastInvoices,
      payments: forecastPayments,
      expenses: forecastExpenses,
      today,
      horizonDays: horizon,
      delays: delayList,
      extraExpenses,
    });
  }, [source, forecastInvoices, forecastPayments, forecastExpenses, today, horizon, delays, extraExpenses]);

  const chartData = useMemo(() => {
    if (!scenario) return [];
    return scenario.original.series.map((point, index) => ({
      date: point.date,
      original: point.balance,
      simulated: scenario.simulated.series[index]?.balance ?? point.balance,
    }));
  }, [scenario]);

  function setDelay(invoiceId: string, delayDays: number) {
    setDelays((prev) => {
      const next = { ...prev };
      if (delayDays === 0) {
        delete next[invoiceId];
      } else {
        next[invoiceId] = delayDays;
      }
      return next;
    });
  }

  function addExpense() {
    const amount = Number(expenseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setExpenseError('Enter an amount greater than zero.');
      return;
    }
    if (!expenseDate) {
      setExpenseError('Choose a date for the expense.');
      return;
    }
    setExtraExpenses((prev) => [
      ...prev,
      { amount, date: expenseDate, title: expenseTitle.trim() || 'Unexpected expense' },
    ]);
    setExpenseAmount('');
    setExpenseTitle('');
    setExpenseError(null);
  }

  function removeExpense(index: number) {
    setExtraExpenses((prev) => prev.filter((_, i) => i !== index));
  }

  function resetScenario() {
    setDelays({});
    setExtraExpenses([]);
    setExpenseError(null);
  }

  const hasChanges = Object.keys(delays).length > 0 || extraExpenses.length > 0;

  return (
    <div>
      <div className="ui-page-header">
        <PageHeader
          title="What-If Simulator"
          description="Test how invoice delays and unexpected expenses could change your projected cash balance. Nothing is saved."
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
          marginRight: 'var(--space-4)',
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

      <button
        type="button"
        onClick={resetScenario}
        disabled={!hasChanges}
        style={{
          padding: 'var(--space-2) var(--space-4)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-card)',
          cursor: hasChanges ? 'pointer' : 'not-allowed',
          marginBottom: 'var(--space-6)',
          fontWeight: 600,
        }}
      >
        Reset Scenario
      </button>

      {loading && (
        <div className="stat-grid" aria-busy="true">
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

      {!loading && !error && source && scenario && (
        <>
          <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <h2 className="card-title">Invoice delays</h2>
            {unpaidInvoices.length === 0 ? (
              <p className="ui-empty" style={mutedStyle}>No unpaid invoices to simulate. Add invoices to test delays.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={cellStyle}>Invoice</th>
                      <th style={cellStyle}>Outstanding</th>
                      <th style={cellStyle}>Due date</th>
                      <th style={cellStyle}>Delay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td style={cellStyle}>{inv.invoice_number}</td>
                        <td style={cellStyle}>
                          {formatCurrency(Number(inv.total_amount) - Number(inv.paid_amount))}
                        </td>
                        <td style={cellStyle}>{inv.due_date}</td>
                        <td style={cellStyle}>
                          <select
                            aria-label={`Delay for invoice ${inv.invoice_number}`}
                            value={delays[inv.id] ?? 0}
                            onChange={(e) => setDelay(inv.id, Number(e.target.value))}
                            style={inputStyle}
                          >
                            {ALLOWED_DELAY_DAYS.map((days) => (
                              <option key={days} value={days}>
                                {days === 0 ? 'No delay' : `${days} days`}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <h2 className="card-title">Unexpected expense</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
                gap: 'var(--space-3)',
                alignItems: 'end',
              }}
            >
              <label>
                <span style={mutedStyle}>Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  style={inputStyle}
                />
              </label>
              <label>
                <span style={mutedStyle}>Date</span>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  style={inputStyle}
                />
              </label>
              <label>
                <span style={mutedStyle}>Title</span>
                <input
                  type="text"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  placeholder="Unexpected expense"
                  style={inputStyle}
                />
              </label>
              <button
                type="button"
                onClick={addExpense}
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Add expense
              </button>
            </div>
            {expenseError && (
              <p role="alert" style={{ ...mutedStyle, color: '#991b1b' }}>
                {expenseError}
              </p>
            )}
            {extraExpenses.length > 0 && (
              <ul style={{ margin: 'var(--space-4) 0 0', paddingLeft: 'var(--space-5)' }}>
                {extraExpenses.map((x, index) => (
                  <li key={index} style={{ marginBottom: 'var(--space-2)' }}>
                    {x.title} · {formatCurrency(x.amount)} · {x.date}{' '}
                    <button
                      type="button"
                      onClick={() => removeExpense(index)}
                      style={{
                        marginLeft: 'var(--space-2)',
                        border: 'none',
                        background: 'none',
                        color: NAVY,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="stat-grid">
            <StatTile
              label="Original ending balance"
              value={formatCurrency(scenario.original.predictedEndingBalance)}
              note={`At the end of the next ${horizon} days (estimated).`}
            />
            <StatTile
              label="Simulated ending balance"
              value={formatCurrency(scenario.simulated.predictedEndingBalance)}
              note="Includes the delays and expenses above (estimated)."
            />
            <StatTile
              label="Balance difference"
              value={`${scenario.balanceDelta > 0 ? '+' : ''}${formatCurrency(scenario.balanceDelta)}`}
              note="Simulated minus original."
            />
            <StatTile
              label="Shortage status"
              value={
                scenario.shortageAfter !== null
                  ? `Negative on ${scenario.shortageAfter}`
                  : 'No projected shortage'
              }
              note={
                scenario.shortageBefore !== null
                  ? `Original: negative on ${scenario.shortageBefore}`
                  : 'Original: no projected shortage'
              }
            />
          </div>

          <div style={{ ...twoColumnStyle, marginTop: 'var(--space-6)' }}>
            <section className="card">
              <h2 className="card-title">Original vs simulated balance</h2>
              <p style={mutedStyle}>
                Points after today ({today}) are estimated based on due dates and pending expenses.
              </p>
              <div style={{ width: '100%', height: 280, marginTop: 'var(--space-4)' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value: string) => formatShortDate(value)}
                      minTickGap={24}
                    />
                    <YAxis width={72} tickFormatter={(value: number) => formatInrCompact(value)} />
                    <Tooltip
                      labelFormatter={(label) => {
                        const text = String(label);
                        return text > today
                          ? `${formatShortDate(text)} (estimated)`
                          : formatShortDate(text);
                      }}
                      formatter={(value) => formatCurrency(Number(value))}
                    />
                    <Line
                      type="monotone"
                      dataKey="original"
                      name="Original"
                      stroke={SLATE}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="simulated"
                      name="Simulated"
                      stroke={NAVY}
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card">
              <h2 className="card-title">Summary</h2>
              <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
                {scenario.summary.map((text, index) => (
                  <li key={index} style={{ marginBottom: 'var(--space-2)' }}>
                    {text}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="card">
            <h2 className="card-title">Delayed invoices</h2>
            {scenario.delayedInvoices.length === 0 ? (
              <p className="ui-empty" style={mutedStyle}>No invoices are delayed in this scenario.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={cellStyle}>Invoice</th>
                      <th style={cellStyle}>Amount</th>
                      <th style={cellStyle}>Original due</th>
                      <th style={cellStyle}>Simulated due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenario.delayedInvoices.map((d) => (
                      <tr key={d.invoiceId}>
                        <td style={cellStyle}>{d.invoice_number}</td>
                        <td style={cellStyle}>{formatCurrency(d.amount)}</td>
                        <td style={cellStyle}>{d.originalDue}</td>
                        <td style={cellStyle}>{d.simulatedDue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
