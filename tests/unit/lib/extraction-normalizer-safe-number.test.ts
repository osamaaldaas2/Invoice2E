import { describe, it, expect } from 'vitest';
import { safeNumberStrict, normalizeExtractedData } from '@/lib/extraction-normalizer';

/**
 * T2: Numeric locale guard tests.
 * Verify safeNumberStrict handles European comma-decimal numbers,
 * standard dot-decimal numbers, and rejects unparseable values.
 */

describe('safeNumberStrict', () => {
  it('parses standard dot-decimal number', () => {
    expect(safeNumberStrict('1234.56')).toBe(1234.56);
  });

  it('parses integer', () => {
    expect(safeNumberStrict('100')).toBe(100);
  });

  it('parses European comma-decimal: 5.508,99 → 5508.99', () => {
    expect(safeNumberStrict('5.508,99')).toBe(5508.99);
  });

  it('parses European comma-decimal: 1.234,56 → 1234.56', () => {
    expect(safeNumberStrict('1.234,56')).toBe(1234.56);
  });

  it('parses European format with multiple thousand separators: 1.234.567,89', () => {
    expect(safeNumberStrict('1.234.567,89')).toBe(1234567.89);
  });

  it('parses simple comma-decimal without thousands: 100,50 → 100.50', () => {
    expect(safeNumberStrict('100,50')).toBe(100.5);
  });

  it('passes through numeric values as-is', () => {
    expect(safeNumberStrict(42.5)).toBe(42.5);
  });

  it('returns NaN for null', () => {
    expect(safeNumberStrict(null)).toBeNaN();
  });

  it('returns NaN for undefined', () => {
    expect(safeNumberStrict(undefined)).toBeNaN();
  });

  it('returns NaN for empty string', () => {
    expect(safeNumberStrict('')).toBeNaN();
  });

  it('returns NaN for non-numeric string', () => {
    expect(safeNumberStrict('abc')).toBeNaN();
  });

  it('handles negative numbers', () => {
    expect(safeNumberStrict('-50.00')).toBe(-50);
  });

  it('handles zero', () => {
    expect(safeNumberStrict('0')).toBe(0);
    expect(safeNumberStrict(0)).toBe(0);
  });

  it('handles whitespace-padded string', () => {
    expect(safeNumberStrict('  119.00  ')).toBe(119);
  });
});

describe('normalizeExtractedData — monetary fields with locale formats', () => {
  const baseData: Record<string, unknown> = {
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-01-01',
    buyerName: 'Buyer',
    sellerName: 'Seller',
    lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19 }],
    subtotal: 100,
    taxAmount: 19,
    totalAmount: 119,
    currency: 'EUR',
  };

  it('handles European comma-decimal totalAmount', () => {
    const result = normalizeExtractedData({ ...baseData, totalAmount: '5.508,99' });
    expect(result.totalAmount).toBe(5508.99);
  });

  it('handles European comma-decimal subtotal', () => {
    const result = normalizeExtractedData({ ...baseData, subtotal: '1.234,56' });
    expect(result.subtotal).toBe(1234.56);
  });

  it('handles European comma-decimal in line item totalPrice', () => {
    const result = normalizeExtractedData({
      ...baseData,
      lineItems: [
        { description: 'Item', quantity: 1, unitPrice: '1.234,56', totalPrice: '1.234,56' },
      ],
    });
    expect(result.lineItems[0]?.unitPrice).toBe(1234.56);
    expect(result.lineItems[0]?.totalPrice).toBe(1234.56);
  });

  it('defaults totalAmount to 0 when completely unparseable (not silent NaN→0)', () => {
    const result = normalizeExtractedData({ ...baseData, totalAmount: 'N/A' });
    expect(result.totalAmount).toBe(0);
  });
});
