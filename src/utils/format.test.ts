import { describe, it, expect } from 'vitest';
import { formatCurrency, formatInrCompact } from './format';

describe('formatCurrency', () => {
  it('formats whole thousands with two decimals', () => {
    expect(formatCurrency(1000)).toBe('₹1,000.00');
    expect(formatCurrency(15000)).toBe('₹15,000.00');
  });

  it('uses Indian digit grouping', () => {
    expect(formatCurrency(125000)).toBe('₹1,25,000.00');
    expect(formatCurrency(1050000)).toBe('₹10,50,000.00');
  });

  it('formats negative amounts with the minus sign and the absolute value', () => {
    const result = formatCurrency(-500);
    expect(result).toContain('-');
    expect(result).toContain('₹500.00');
  });

  it('coerces null, undefined and NaN to zero', () => {
    expect(formatCurrency(null)).toBe('₹0.00');
    expect(formatCurrency(undefined)).toBe('₹0.00');
    expect(formatCurrency(NaN)).toBe('₹0.00');
  });

  it('always shows two decimal places', () => {
    expect(formatCurrency(10.5)).toBe('₹10.50');
  });
});

describe('formatInrCompact', () => {
  it('keeps values under one lakh in whole-rupee form', () => {
    expect(formatInrCompact(850)).toBe('₹850');
  });

  it('abbreviates lakhs with L', () => {
    expect(formatInrCompact(120000)).toBe('₹1.2L');
  });

  it('abbreviates crores with Cr', () => {
    expect(formatInrCompact(35000000)).toBe('₹3.5Cr');
  });
});
