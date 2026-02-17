/**
 * Tests for format-aware readiness checks used in the BulkUploadForm.
 *
 * Verifies that the FORMAT_FIELD_CONFIG-based readiness logic:
 * - Requires different fields for different formats
 * - Does not require XRechnung-only fields for non-XRechnung formats
 * - Correctly identifies missing fields per format
 */
import { describe, it, expect } from 'vitest';
import { FORMAT_FIELD_CONFIG, type FormatFieldConfig } from '@/lib/format-field-config';
import type { OutputFormat } from '@/types/canonical-invoice';

/** Simplified readiness check matching the BulkUploadForm logic */
function computeFormatReadiness(
  data: Record<string, unknown>,
  format: OutputFormat
): { ready: boolean; missing: string[] } {
  const config: FormatFieldConfig = FORMAT_FIELD_CONFIG[format] ?? FORMAT_FIELD_CONFIG['xrechnung-cii'];
  const missing: string[] = [];

  // Universal checks
  if (!data.sellerName) missing.push('sellerName');
  if (!(Array.isArray(data.lineItems) && (data.lineItems as any[]).length > 0)) missing.push('lineItems');
  if (!(Number(data.totalAmount) > 0)) missing.push('totalAmount');

  // Format-specific
  if (config.sellerPhone === 'required' && !data.sellerPhone && !data.sellerPhoneNumber) missing.push('sellerPhone');
  if (config.sellerEmail === 'required' && !data.sellerEmail && !data.sellerElectronicAddress) missing.push('sellerEmail');
  if (config.sellerContactName === 'required' && !data.sellerContactName) missing.push('sellerContactName');
  if (config.sellerIban === 'required' && !data.sellerIban) missing.push('sellerIban');
  if (config.sellerVatId === 'required' && !data.sellerVatId && !data.sellerTaxNumber && !data.sellerTaxId) missing.push('sellerVatId');
  if (config.sellerStreet === 'required' && !data.sellerStreet && !data.sellerAddress) missing.push('sellerStreet');
  if (config.sellerCity === 'required' && !data.sellerCity) missing.push('sellerCity');
  if (config.sellerPostalCode === 'required' && !data.sellerPostalCode) missing.push('sellerPostalCode');
  if (config.buyerStreet === 'required' && !data.buyerStreet && !data.buyerAddress) missing.push('buyerStreet');
  if (config.buyerCity === 'required' && !data.buyerCity) missing.push('buyerCity');
  if (config.buyerPostalCode === 'required' && !data.buyerPostalCode) missing.push('buyerPostalCode');
  if (config.buyerCountryCode === 'required' && !data.buyerCountryCode) missing.push('buyerCountryCode');
  if (config.buyerElectronicAddress === 'required' && !data.buyerElectronicAddress && !data.buyerEmail) missing.push('buyerElectronicAddress');
  if (config.buyerCodiceDestinatario === 'required' && !data.buyerCodiceDestinatario) missing.push('buyerCodiceDestinatario');
  if (config.paymentTerms === 'required' && !data.paymentTerms) missing.push('paymentTerms');

  return { ready: missing.length === 0, missing };
}

const MINIMAL_VALID_DATA: Record<string, unknown> = {
  sellerName: 'Seller GmbH',
  lineItems: [{ description: 'Item 1', quantity: 1, unitPrice: 100, totalPrice: 100, taxRate: 19 }],
  totalAmount: 119,
};

describe('Format-aware readiness checks', () => {
  describe('XRechnung CII requires XRechnung-specific fields', () => {
    it('reports missing IBAN, phone, email, contactName', () => {
      const { missing } = computeFormatReadiness(MINIMAL_VALID_DATA, 'xrechnung-cii');
      expect(missing).toContain('sellerIban');
      expect(missing).toContain('sellerPhone');
      expect(missing).toContain('sellerEmail');
      expect(missing).toContain('sellerContactName');
      expect(missing).toContain('paymentTerms');
    });

    it('is ready when all XRechnung fields are provided', () => {
      const data = {
        ...MINIMAL_VALID_DATA,
        sellerEmail: 'seller@example.de',
        sellerPhone: '+49 89 12345',
        sellerContactName: 'Max',
        sellerIban: 'DE89370400440532013000',
        sellerVatId: 'DE123456789',
        sellerStreet: 'Str. 1',
        sellerCity: 'Berlin',
        sellerPostalCode: '10115',
        sellerCountryCode: 'DE',
        buyerStreet: 'Käuferstr. 1',
        buyerCity: 'Berlin',
        buyerPostalCode: '10115',
        buyerCountryCode: 'DE',
        buyerElectronicAddress: 'buyer@example.de',
        paymentTerms: 'Net 30',
      };
      const { ready, missing } = computeFormatReadiness(data, 'xrechnung-cii');
      expect(missing).toHaveLength(0);
      expect(ready).toBe(true);
    });
  });

  describe('KSeF does NOT require XRechnung-specific fields', () => {
    it('does not require IBAN', () => {
      const { missing } = computeFormatReadiness(MINIMAL_VALID_DATA, 'ksef');
      expect(missing).not.toContain('sellerIban');
    });

    it('does not require seller phone/email/contactName', () => {
      const { missing } = computeFormatReadiness(MINIMAL_VALID_DATA, 'ksef');
      expect(missing).not.toContain('sellerPhone');
      expect(missing).not.toContain('sellerEmail');
      expect(missing).not.toContain('sellerContactName');
    });

    it('does not require payment terms', () => {
      const { missing } = computeFormatReadiness(MINIMAL_VALID_DATA, 'ksef');
      expect(missing).not.toContain('paymentTerms');
    });
  });

  describe('Peppol BIS requires electronic addresses', () => {
    it('requires buyerElectronicAddress', () => {
      const { missing } = computeFormatReadiness(
        { ...MINIMAL_VALID_DATA, sellerVatId: 'BE0123456789' },
        'peppol-bis'
      );
      expect(missing).toContain('buyerElectronicAddress');
    });

    it('does not require IBAN (optional for Peppol)', () => {
      const { missing } = computeFormatReadiness(MINIMAL_VALID_DATA, 'peppol-bis');
      expect(missing).not.toContain('sellerIban');
    });
  });

  describe('FatturaPA requires Italian-specific fields', () => {
    it('requires buyerCodiceDestinatario', () => {
      const { missing } = computeFormatReadiness(MINIMAL_VALID_DATA, 'fatturapa');
      expect(missing).toContain('buyerCodiceDestinatario');
    });

    it('does not require seller phone/email (hidden for FatturaPA)', () => {
      const { missing } = computeFormatReadiness(MINIMAL_VALID_DATA, 'fatturapa');
      expect(missing).not.toContain('sellerPhone');
      expect(missing).not.toContain('sellerEmail');
    });
  });

  describe('NLCIUS requires Dutch-specific fields', () => {
    it('requires payment terms', () => {
      const { missing } = computeFormatReadiness(MINIMAL_VALID_DATA, 'nlcius');
      expect(missing).toContain('paymentTerms');
    });

    it('requires buyer electronic address', () => {
      const { missing } = computeFormatReadiness(MINIMAL_VALID_DATA, 'nlcius');
      expect(missing).toContain('buyerElectronicAddress');
    });
  });

  describe('Formats produce different missing field counts', () => {
    it('XRechnung has more missing fields than KSeF for same data', () => {
      const xr = computeFormatReadiness(MINIMAL_VALID_DATA, 'xrechnung-cii');
      const ks = computeFormatReadiness(MINIMAL_VALID_DATA, 'ksef');
      expect(xr.missing.length).toBeGreaterThan(ks.missing.length);
    });
  });
});
