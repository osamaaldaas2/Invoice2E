import { describe, it, expect } from 'vitest';
import { normalizeExtractedData } from '@/lib/extraction-normalizer';

describe('extraction-normalizer: taxRate array handling', () => {
  it('should convert document-level taxRate array to undefined', () => {
    const data = {
      invoiceNumber: 'INV-001',
      totalAmount: 119,
      subtotal: 100,
      taxAmount: 19,
      taxRate: [19, 7], // Mistral returns array for mixed-rate invoices
      currency: 'EUR',
    };

    const result = normalizeExtractedData(data as any);
    expect(result.taxRate).toBeUndefined();
  });

  it('should preserve normal numeric taxRate', () => {
    const data = {
      invoiceNumber: 'INV-002',
      totalAmount: 119,
      subtotal: 100,
      taxAmount: 19,
      taxRate: 19,
      currency: 'EUR',
    };

    const result = normalizeExtractedData(data as any);
    expect(result.taxRate).toBe(19);
  });

  it('should convert line item taxRate array to undefined', () => {
    const data = {
      invoiceNumber: 'INV-003',
      totalAmount: 100,
      currency: 'EUR',
      lineItems: [
        {
          description: 'Item 1',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
          taxRate: [19, 7], // array edge case
        },
      ],
    };

    const result = normalizeExtractedData(data as any);
    expect(result.lineItems[0]!.taxRate).toBeUndefined();
  });

  it('should preserve normal line item taxRate', () => {
    const data = {
      invoiceNumber: 'INV-004',
      totalAmount: 100,
      currency: 'EUR',
      lineItems: [
        {
          description: 'Item 1',
          quantity: 1,
          unitPrice: 100,
          totalPrice: 100,
          taxRate: 19,
        },
      ],
    };

    const result = normalizeExtractedData(data as any);
    expect(result.lineItems[0]!.taxRate).toBe(19);
  });
});
