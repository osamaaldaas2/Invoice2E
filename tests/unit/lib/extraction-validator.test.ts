import { describe, it, expect } from 'vitest';
import { validateExtraction } from '@/lib/extraction-validator';
import type { ExtractedInvoiceData } from '@/types';

function makeValidInvoice(overrides?: Partial<ExtractedInvoiceData>): ExtractedInvoiceData {
  return {
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-01-15',
    sellerName: 'Seller GmbH',
    buyerName: 'Buyer AG',
    lineItems: [
      {
        description: 'Widget',
        quantity: 2,
        unitPrice: 50,
        totalPrice: 100,
        taxRate: 19,
      },
    ],
    subtotal: 100,
    taxAmount: 19,
    taxRate: 19,
    totalAmount: 119,
    confidence: 0.9,
    processingTimeMs: 1000,
    ...overrides,
  } as ExtractedInvoiceData;
}

describe('validateExtraction', () => {
  it('passes for a mathematically correct invoice', () => {
    const result = validateExtraction(makeValidInvoice());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when invoiceNumber is missing', () => {
    const result = validateExtraction(makeValidInvoice({ invoiceNumber: null as any }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'invoiceNumber')).toBe(true);
  });

  it('fails when lineItems is empty', () => {
    const result = validateExtraction(makeValidInvoice({ lineItems: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'lineItems')).toBe(true);
  });

  it('fails when line item totalPrice != unitPrice * quantity', () => {
    const result = validateExtraction(
      makeValidInvoice({
        lineItems: [{ description: 'X', quantity: 2, unitPrice: 50, totalPrice: 999, taxRate: 19 }],
        subtotal: 999,
        taxAmount: 189.81,
        totalAmount: 1188.81,
      } as any)
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field.includes('totalPrice'))).toBe(true);
  });

  it('fails when subtotal != sum of line items', () => {
    const result = validateExtraction(
      makeValidInvoice({
        subtotal: 500, // should be 100
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'subtotal')).toBe(true);
  });

  it('fails when taxAmount != subtotal * taxRate / 100', () => {
    const result = validateExtraction(
      makeValidInvoice({
        taxAmount: 50, // should be 19
        totalAmount: 150,
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'taxAmount')).toBe(true);
  });

  it('fails when totalAmount != subtotal + taxAmount', () => {
    const result = validateExtraction(
      makeValidInvoice({
        totalAmount: 999, // should be 119
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'totalAmount')).toBe(true);
  });

  // ── Multi-rate tax validation (F-04 fix) ──

  it('passes for multi-rate invoice (19% + 7%)', () => {
    const result = validateExtraction(
      makeValidInvoice({
        lineItems: [
          { description: 'Standard', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19 },
          { description: 'Reduced', quantity: 1, unitPrice: 50, totalPrice: 50, taxRate: 7 },
        ],
        subtotal: 150,
        taxRate: undefined as any, // No single document-level rate
        taxAmount: 22.5, // 19 + 3.5
        totalAmount: 172.5,
      })
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes for multi-rate invoice with 3 different rates', () => {
    const result = validateExtraction(
      makeValidInvoice({
        lineItems: [
          { description: 'A', quantity: 2, unitPrice: 100, totalPrice: 200, taxRate: 19 },
          { description: 'B', quantity: 1, unitPrice: 50, totalPrice: 50, taxRate: 7 },
          { description: 'C', quantity: 1, unitPrice: 30, totalPrice: 30, taxRate: 0 },
        ],
        subtotal: 280,
        taxRate: undefined as any,
        taxAmount: 41.5, // 38 + 3.5 + 0
        totalAmount: 321.5,
      })
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for multi-rate invoice with wrong taxAmount', () => {
    const result = validateExtraction(
      makeValidInvoice({
        lineItems: [
          { description: 'Standard', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19 },
          { description: 'Reduced', quantity: 1, unitPrice: 50, totalPrice: 50, taxRate: 7 },
        ],
        subtotal: 150,
        taxRate: undefined as any,
        taxAmount: 99, // Wrong — should be 22.5
        totalAmount: 249,
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'taxAmount')).toBe(true);
  });

  it('falls back to document-level taxRate when line items have no rates', () => {
    const result = validateExtraction(
      makeValidInvoice({
        lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 50, totalPrice: 100 }],
        subtotal: 100,
        taxRate: 19,
        taxAmount: 19,
        totalAmount: 119,
      })
    );
    expect(result.valid).toBe(true);
  });

  it('prefers per-line-item rates over document-level taxRate', () => {
    // Line items say 7%, document says 19% — per-line-item wins
    const result = validateExtraction(
      makeValidInvoice({
        lineItems: [
          { description: 'Reduced', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 7 },
        ],
        subtotal: 100,
        taxRate: 19, // Ignored when line items have rates
        taxAmount: 7, // Correct per line-item rate
        totalAmount: 107,
      })
    );
    expect(result.valid).toBe(true);
  });

  it('fails on negative monetary values', () => {
    const result = validateExtraction(
      makeValidInvoice({
        subtotal: -100,
      })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'subtotal')).toBe(true);
  });
});
