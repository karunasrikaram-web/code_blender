const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});

/** Formats a number as USD, e.g. 1234.5 -> "$1,234.50". */
export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
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
