/**
 * Tests for format-aware batch validation.
 *
 * Verifies that different output formats enforce different field requirements:
 * - KSeF does NOT require IBAN/email/phone
 * - XRechnung DOES require IBAN/email/phone
 * - Peppol requires electronic address + EAS scheme
 * - FatturaPA requires CodiceDestinatario
 */
import { describe, it, expect } from 'vitest';
import { validateForProfile } from '@/validation/validation-pipeline';
import { formatToProfileId } from '@/lib/format-utils';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

/** Minimal valid invoice for EN 16931 base (all formats inherit from this) */
function createBaseInvoice(overrides: Partial<CanonicalInvoice> = {}): CanonicalInvoice {
  return {
    outputFormat: 'xrechnung-cii',
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-01-30',
    currency: 'EUR',
    buyer: {
      name: 'Buyer GmbH',
      email: 'buyer@example.de',
      electronicAddress: 'buyer@example.de',
      electronicAddressScheme: 'EM',
      address: 'Käuferstr. 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
    },
    seller: {
      name: 'Seller AG',
      email: 'seller@example.de',
      electronicAddress: 'seller@example.de',
      electronicAddressScheme: 'EM',
      address: 'Verkäuferstr. 2',
      city: 'Munich',
      postalCode: '80331',
      countryCode: 'DE',
      taxId: 'DE123456789',
      vatId: 'DE123456789',
      contactName: 'Max Mustermann',
      phone: '+49 89 12345',
    },
    payment: {
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      paymentTerms: 'Net 30',
    },
    lineItems: [
      { description: 'Widget A', quantity: 2, unitPrice: 50, totalPrice: 100, taxRate: 19 },
    ],
    totals: {
      subtotal: 100,
      taxAmount: 19,
      totalAmount: 119,
    },
    ...overrides,
  };
}

describe('Format-aware batch validation', () => {
  describe('KSeF (Poland)', () => {
    it('does NOT require IBAN when format is ksef', () => {
      const invoice = createBaseInvoice({
        outputFormat: 'ksef',
        payment: { paymentTerms: 'Net 30' }, // No IBAN
        seller: {
          name: 'Sprzedawca Sp. z o.o.',
          address: 'ul. Przykładowa 1',
          city: 'Warszawa',
          postalCode: '00-001',
          countryCode: 'PL',
          vatId: '1234567890', // NIP
          electronicAddress: 'seller@example.pl',
          electronicAddressScheme: 'EM',
        },
        buyer: {
          name: 'Nabywca S.A.',
          countryCode: 'PL',
        },
      });

      const result = validateForProfile(invoice, formatToProfileId('ksef'));
      // Should NOT have IBAN-related errors
      const ibanErrors = result.errors.filter((e) => e.ruleId.includes('IBAN') || e.ruleId === 'BR-DE-23-a');
      expect(ibanErrors).toHaveLength(0);
    });

    it('does NOT require seller email/phone when format is ksef', () => {
      const invoice = createBaseInvoice({
        outputFormat: 'ksef',
        seller: {
          name: 'Sprzedawca Sp. z o.o.',
          address: 'ul. Przykładowa 1',
          city: 'Warszawa',
          postalCode: '00-001',
          countryCode: 'PL',
          vatId: '1234567890',
          electronicAddress: 'seller@example.pl',
          electronicAddressScheme: 'EM',
          // No email, no phone, no contactName
        },
        buyer: {
          name: 'Nabywca S.A.',
          countryCode: 'PL',
        },
      });

      const result = validateForProfile(invoice, formatToProfileId('ksef'));
      // Should NOT have BR-DE-2 (seller contact) errors
      const contactErrors = result.errors.filter(
        (e) => e.ruleId === 'BR-DE-2' || e.ruleId === 'BR-DE-5' || e.ruleId === 'BR-DE-6'
      );
      expect(contactErrors).toHaveLength(0);
    });
  });

  describe('XRechnung (Germany)', () => {
    it('DOES require IBAN when format is xrechnung-cii', () => {
      const invoice = createBaseInvoice({
        outputFormat: 'xrechnung-cii',
        payment: { paymentTerms: 'Net 30' }, // No IBAN
      });

      const result = validateForProfile(invoice, formatToProfileId('xrechnung-cii'));
      // Should have IBAN-related error
      const ibanErrors = result.errors.filter(
        (e) => e.message.toLowerCase().includes('iban') || e.ruleId === 'BR-DE-23-a'
      );
      expect(ibanErrors.length).toBeGreaterThan(0);
    });

    it('DOES require seller phone/email when format is xrechnung-cii', () => {
      const invoice = createBaseInvoice({
        outputFormat: 'xrechnung-cii',
        seller: {
          name: 'Seller AG',
          address: 'Verkäuferstr. 2',
          city: 'Munich',
          postalCode: '80331',
          countryCode: 'DE',
          vatId: 'DE123456789',
          electronicAddress: 'seller@example.de',
          electronicAddressScheme: 'EM',
          // No phone, no email, no contactName
        },
      });

      const result = validateForProfile(invoice, formatToProfileId('xrechnung-cii'));
      // Should have BR-DE-2 (seller contact) error
      const contactErrors = result.errors.filter((e) => e.ruleId === 'BR-DE-2');
      expect(contactErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Peppol BIS', () => {
    it('requires electronic address + scheme for seller', () => {
      const invoice = createBaseInvoice({
        outputFormat: 'peppol-bis',
        seller: {
          name: 'Peppol Seller',
          address: 'Main St 1',
          city: 'Brussels',
          postalCode: '1000',
          countryCode: 'BE',
          vatId: 'BE0123456789',
          // No electronicAddress or electronicAddressScheme
        },
        buyer: {
          name: 'Peppol Buyer',
          countryCode: 'BE',
          electronicAddress: '0208:0123456789',
          electronicAddressScheme: '0208',
        },
      });

      const result = validateForProfile(invoice, formatToProfileId('peppol-bis'));
      // Should have electronic address-related error for seller
      const eaErrors = result.errors.filter(
        (e) =>
          e.message.toLowerCase().includes('electronic') ||
          e.ruleId.includes('BT-34')
      );
      expect(eaErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Different formats produce different validation results', () => {
    it('XRechnung-specific BR-DE rules only fire for XRechnung profile', () => {
      // Invoice missing XRechnung-required fields: IBAN, phone, email, contactName
      const invoice = createBaseInvoice({
        seller: {
          name: 'Minimal Seller',
          address: 'Street 1',
          city: 'City',
          postalCode: '12345',
          countryCode: 'DE',
          vatId: 'DE123456789',
          electronicAddress: 'seller@example.de',
          electronicAddressScheme: 'EM',
          // Deliberately missing: phone, email, contactName
        },
        payment: { paymentTerms: 'Net 30' }, // Deliberately missing: IBAN
      });

      const xrechnungResult = validateForProfile(
        { ...invoice, outputFormat: 'xrechnung-cii' },
        formatToProfileId('xrechnung-cii')
      );

      const ksefResult = validateForProfile(
        { ...invoice, outputFormat: 'ksef' },
        formatToProfileId('ksef')
      );

      // XRechnung should have BR-DE-* errors that KSeF does not
      const xrBrDeErrors = xrechnungResult.errors.filter((e) => e.ruleId.startsWith('BR-DE'));
      const ksefBrDeErrors = ksefResult.errors.filter((e) => e.ruleId.startsWith('BR-DE'));

      expect(xrBrDeErrors.length).toBeGreaterThan(0);
      expect(ksefBrDeErrors.length).toBe(0);
    });
  });
});
