const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeInrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Coerces null/undefined/NaN/Infinity to 0 so money displays never show "NaN". */
function toSafeNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});

/** Formats a number as INR with Indian grouping, e.g. 125000 -> "₹1,25,000.00". */
export function formatCurrency(amount: number | null | undefined): string {
  return currencyFormatter.format(toSafeNumber(amount));
}

/**
 * Compact INR for chart axes: 850 -> "₹850", 120000 -> "₹1.2L", 35000000 -> "₹3.5Cr".
 * Values under one lakh keep their full (whole-rupee) form.
 */
export function formatInrCompact(value: number): string {
  const n = toSafeNumber(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trimmed = (x: number) => x.toFixed(1).replace(/\.0$/, '');

  if (abs >= 1e7) return `${sign}₹${trimmed(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trimmed(abs / 1e5)}L`;
  return `${sign}${wholeInrFormatter.format(abs)}`;
}

/** Formats an ISO date as a short en-US date, e.g. "2025-05-18" -> "May 18, 2025". */
export function formatDate(iso: string): string {
  // Date-only strings are parsed as UTC by the Date constructor, which can shift
  // the day back in US time zones, so parse them as local time instead.
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const date = new Date(isDateOnly ? `${iso}T00:00:00` : iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Formats a ratio as a percentage, e.g. 0.125 -> "12.5%". */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}
