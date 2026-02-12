import { describe, it, expect } from 'vitest';
import {
  normalizeTaxCategoryCode,
  isEuVatId,
  normalizeExtractedData,
} from '@/lib/extraction-normalizer';

describe('extraction-normalizer EN 16931 extensions', () => {
  describe('normalizeTaxCategoryCode', () => {
    it('accepts valid uppercase codes', () => {
      expect(normalizeTaxCategoryCode('S')).toBe('S');
      expect(normalizeTaxCategoryCode('Z')).toBe('Z');
      expect(normalizeTaxCategoryCode('E')).toBe('E');
      expect(normalizeTaxCategoryCode('AE')).toBe('AE');
      expect(normalizeTaxCategoryCode('K')).toBe('K');
      expect(normalizeTaxCategoryCode('G')).toBe('G');
    });

    it('normalizes lowercase to uppercase', () => {
      expect(normalizeTaxCategoryCode('s')).toBe('S');
      expect(normalizeTaxCategoryCode('ae')).toBe('AE');
    });

    it('returns undefined for invalid codes', () => {
      expect(normalizeTaxCategoryCode('X')).toBeUndefined();
      expect(normalizeTaxCategoryCode('INVALID')).toBeUndefined();
    });

    it('derives S from positive tax rate when no code given', () => {
      expect(normalizeTaxCategoryCode(null, 19)).toBe('S');
    });

    it('derives E from zero tax rate when no code given', () => {
      expect(normalizeTaxCategoryCode(null, 0)).toBe('E');
    });

    it('returns undefined when no code and no rate', () => {
      expect(normalizeTaxCategoryCode(null)).toBeUndefined();
    });
  });

  describe('isEuVatId', () => {
    it('detects DE VAT ID', () => {
      expect(isEuVatId('DE123456789')).toBe(true);
    });

    it('detects AT VAT ID', () => {
      expect(isEuVatId('ATU12345678')).toBe(true);
    });

    it('rejects local German tax number', () => {
      expect(isEuVatId('123/456/78901')).toBe(false);
    });

    it('handles null/undefined', () => {
      expect(isEuVatId(null)).toBe(false);
      expect(isEuVatId(undefined)).toBe(false);
    });

    it('handles lowercase', () => {
      expect(isEuVatId('de123456789')).toBe(true);
    });
  });

  describe('normalizeExtractedData — new EN 16931 fields', () => {
    const baseData: Record<string, unknown> = {
      invoiceNumber: 'INV-001',
      invoiceDate: '2024-01-01',
      buyerName: 'Buyer',
      sellerName: 'Seller',
      lineItems: [
        { description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19 },
      ],
      subtotal: 100,
      taxAmount: 19,
      totalAmount: 119,
      currency: 'EUR',
    };

    it('derives sellerVatId from sellerTaxId when it looks like EU VAT', () => {
      const data = normalizeExtractedData({ ...baseData, sellerTaxId: 'DE123456789' });
      expect(data.sellerVatId).toBe('DE123456789');
      expect(data.sellerTaxNumber).toBeNull();
    });

    it('derives sellerTaxNumber from sellerTaxId when it is a local number', () => {
      const data = normalizeExtractedData({ ...baseData, sellerTaxId: '123/456/78901' });
      expect(data.sellerVatId).toBeNull();
      expect(data.sellerTaxNumber).toBe('123/456/78901');
    });

    it('preserves explicitly provided sellerVatId and sellerTaxNumber', () => {
      const data = normalizeExtractedData({
        ...baseData,
        sellerTaxId: 'DE123456789',
        sellerVatId: 'DE999999999',
        sellerTaxNumber: '12/34/567',
      });
      expect(data.sellerVatId).toBe('DE999999999');
      expect(data.sellerTaxNumber).toBe('12/34/567');
    });

    it('derives buyerVatId from buyerTaxId when it looks like EU VAT', () => {
      const data = normalizeExtractedData({ ...baseData, buyerTaxId: 'FR12345678901' });
      expect(data.buyerVatId).toBe('FR12345678901');
    });

    it('normalizes documentTypeCode', () => {
      const data = normalizeExtractedData({ ...baseData, documentTypeCode: 381 });
      expect(data.documentTypeCode).toBe(381);
    });

    it('ignores invalid documentTypeCode', () => {
      const data = normalizeExtractedData({ ...baseData, documentTypeCode: 999 });
      expect(data.documentTypeCode).toBeUndefined();
    });

    it('normalizes buyerReference', () => {
      const data = normalizeExtractedData({ ...baseData, buyerReference: '04011000-12345-67' });
      expect(data.buyerReference).toBe('04011000-12345-67');
    });

    it('normalizes taxCategoryCode per line item', () => {
      const data = normalizeExtractedData({
        ...baseData,
        lineItems: [
          {
            description: 'Standard',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'Reverse',
            quantity: 1,
            unitPrice: 50,
            totalPrice: 50,
            taxRate: 0,
            taxCategoryCode: 'AE',
          },
        ],
      });
      expect(data.lineItems[0]?.taxCategoryCode).toBe('S');
      expect(data.lineItems[1]?.taxCategoryCode).toBe('AE');
    });

    it('derives taxCategoryCode from rate when not provided', () => {
      const data = normalizeExtractedData({
        ...baseData,
        lineItems: [
          { description: 'Taxed', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19 },
          { description: 'Exempt', quantity: 1, unitPrice: 50, totalPrice: 50, taxRate: 0 },
        ],
      });
      expect(data.lineItems[0]?.taxCategoryCode).toBe('S');
      expect(data.lineItems[1]?.taxCategoryCode).toBe('E');
    });

    it('derives buyerElectronicAddress from buyerEmail when not explicitly set', () => {
      const data = normalizeExtractedData({ ...baseData, buyerEmail: 'buyer@test.de' });
      expect(data.buyerElectronicAddress).toBe('buyer@test.de');
      expect(data.buyerElectronicAddressScheme).toBe('EM');
    });

    it('preserves explicit buyerElectronicAddress over buyerEmail', () => {
      const data = normalizeExtractedData({
        ...baseData,
        buyerEmail: 'buyer@test.de',
        buyerElectronicAddress: 'custom@peppol.eu',
        buyerElectronicAddressScheme: 'GLN',
      });
      expect(data.buyerElectronicAddress).toBe('custom@peppol.eu');
      expect(data.buyerElectronicAddressScheme).toBe('GLN');
    });

    it('derives sellerElectronicAddress from sellerEmail when not explicitly set', () => {
      const data = normalizeExtractedData({ ...baseData, sellerEmail: 'seller@test.de' });
      expect(data.sellerElectronicAddress).toBe('seller@test.de');
      expect(data.sellerElectronicAddressScheme).toBe('EM');
    });

    it('sets electronic addresses to null when no email and no explicit address', () => {
      const data = normalizeExtractedData({ ...baseData });
      expect(data.buyerElectronicAddress).toBeNull();
      expect(data.buyerElectronicAddressScheme).toBeNull();
      expect(data.sellerElectronicAddress).toBeNull();
      expect(data.sellerElectronicAddressScheme).toBeNull();
    });
  });

  describe('T3: tax rate derivation policy', () => {
    const t3Base: Record<string, unknown> = {
      invoiceNumber: 'INV-T3',
      invoiceDate: '2024-01-01',
      buyerName: 'Buyer',
      sellerName: 'Seller',
      lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
      subtotal: 100,
      taxAmount: 19,
      totalAmount: 119,
      currency: 'EUR',
    };

    it('does NOT derive invoice-level taxRate from taxAmount/subtotal', () => {
      const data = normalizeExtractedData({ ...t3Base });
      expect(data.taxRate).toBeUndefined();
    });

    it('preserves explicit invoice-level taxRate from AI', () => {
      const data = normalizeExtractedData({ ...t3Base, taxRate: 19 });
      expect(data.taxRate).toBe(19);
    });

    it('does NOT cascade invoice-level rate to line items missing per-item taxRate', () => {
      const data = normalizeExtractedData({
        ...t3Base,
        taxRate: 19,
        lineItems: [{ description: 'No rate', quantity: 1, unitPrice: 100, totalPrice: 100 }],
      });
      expect(data.lineItems[0]?.taxRate).toBeUndefined();
    });

    it('preserves explicit per-item taxRate', () => {
      const data = normalizeExtractedData({
        ...t3Base,
        lineItems: [
          { description: 'Standard', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19 },
          { description: 'Reduced', quantity: 1, unitPrice: 50, totalPrice: 50, taxRate: 7 },
        ],
      });
      expect(data.lineItems[0]?.taxRate).toBe(19);
      expect(data.lineItems[1]?.taxRate).toBe(7);
    });

    it('sets taxCategoryCode to undefined when no taxRate is available', () => {
      const data = normalizeExtractedData({
        ...t3Base,
        lineItems: [{ description: 'No rate', quantity: 1, unitPrice: 100, totalPrice: 100 }],
      });
      expect(data.lineItems[0]?.taxCategoryCode).toBeUndefined();
    });
  });
});
