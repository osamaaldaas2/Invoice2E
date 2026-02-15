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
