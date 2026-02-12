import { describe, it, expect } from 'vitest';

/**
 * P1: Verify that 'Auto' / empty taxCategoryCode never reaches the backend payload.
 * This mirrors the mapping logic in useInvoiceReviewForm.ts onSubmit handler.
 */

// Extract the same mapping logic used in the submit handler
function sanitizeTaxCategoryCode(raw: string | undefined | null): string | undefined {
  return raw && raw !== 'Auto' ? raw : undefined;
}

function sanitizeTaxRate(raw: number | string | undefined | null): number | undefined {
  return raw !== '' && raw !== null && raw !== undefined ? Number(raw) : undefined;
}

function mapLineItems(
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    taxRate: number | string;
    taxCategoryCode: string;
  }>
) {
  return items.map((item) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
    taxRate: sanitizeTaxRate(item.taxRate),
    taxCategoryCode: sanitizeTaxCategoryCode(item.taxCategoryCode),
  }));
}

describe('Invoice Review Payload Sanitization', () => {
  describe('P1: taxCategoryCode never sends "Auto" to backend', () => {
    it('should map empty string to undefined', () => {
      expect(sanitizeTaxCategoryCode('')).toBeUndefined();
    });

    it('should map literal "Auto" to undefined', () => {
      expect(sanitizeTaxCategoryCode('Auto')).toBeUndefined();
    });

    it('should map null to undefined', () => {
      expect(sanitizeTaxCategoryCode(null)).toBeUndefined();
    });

    it('should map undefined to undefined', () => {
      expect(sanitizeTaxCategoryCode(undefined)).toBeUndefined();
    });

    it('should preserve valid UNCL5305 codes', () => {
      expect(sanitizeTaxCategoryCode('S')).toBe('S');
      expect(sanitizeTaxCategoryCode('Z')).toBe('Z');
      expect(sanitizeTaxCategoryCode('E')).toBe('E');
      expect(sanitizeTaxCategoryCode('AE')).toBe('AE');
      expect(sanitizeTaxCategoryCode('K')).toBe('K');
      expect(sanitizeTaxCategoryCode('G')).toBe('G');
    });
  });

  describe('P1: taxRate nullable handling', () => {
    it('should map empty string to undefined', () => {
      expect(sanitizeTaxRate('')).toBeUndefined();
    });

    it('should map null to undefined', () => {
      expect(sanitizeTaxRate(null)).toBeUndefined();
    });

    it('should map undefined to undefined', () => {
      expect(sanitizeTaxRate(undefined)).toBeUndefined();
    });

    it('should preserve numeric tax rates', () => {
      expect(sanitizeTaxRate(19)).toBe(19);
      expect(sanitizeTaxRate(7)).toBe(7);
      expect(sanitizeTaxRate(0)).toBe(0);
    });

    it('should convert string tax rates to numbers', () => {
      expect(sanitizeTaxRate('19')).toBe(19);
      expect(sanitizeTaxRate('7.5')).toBe(7.5);
    });
  });

  describe('P1: full lineItems mapping', () => {
    it('should strip Auto taxCategoryCode and empty taxRate from payload', () => {
      const items = [
        {
          description: 'Item 1',
          quantity: 2,
          unitPrice: 50,
          totalPrice: 100,
          taxRate: 19,
          taxCategoryCode: 'S',
        },
        {
          description: 'Item 2',
          quantity: 1,
          unitPrice: 30,
          totalPrice: 30,
          taxRate: '' as string | number,
          taxCategoryCode: '',
        },
        {
          description: 'Item 3',
          quantity: 1,
          unitPrice: 20,
          totalPrice: 20,
          taxRate: 7,
          taxCategoryCode: 'Auto',
        },
      ];

      const mapped = mapLineItems(items);
      expect(mapped).toHaveLength(3);

      // Item 1: valid taxRate + valid taxCategoryCode → preserved
      expect(mapped[0]!.taxRate).toBe(19);
      expect(mapped[0]!.taxCategoryCode).toBe('S');

      // Item 2: empty taxRate → undefined, empty taxCategoryCode → undefined
      expect(mapped[1]!.taxRate).toBeUndefined();
      expect(mapped[1]!.taxCategoryCode).toBeUndefined();

      // Item 3: valid taxRate, literal 'Auto' taxCategoryCode → undefined
      expect(mapped[2]!.taxRate).toBe(7);
      expect(mapped[2]!.taxCategoryCode).toBeUndefined();
    });

    it('should ensure no lineItem has taxCategoryCode === "Auto"', () => {
      const items = [
        {
          description: 'A',
          quantity: 1,
          unitPrice: 10,
          totalPrice: 10,
          taxRate: '' as string | number,
          taxCategoryCode: 'Auto',
        },
        {
          description: 'B',
          quantity: 1,
          unitPrice: 20,
          totalPrice: 20,
          taxRate: 19,
          taxCategoryCode: '',
        },
      ];

      const mapped = mapLineItems(items);
      const hasAuto = mapped.some((item) => item.taxCategoryCode === 'Auto');
      expect(hasAuto).toBe(false);
    });
  });
});
