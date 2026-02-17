/**
 * B-02 integration regression test: Factur-X profile mapping end-to-end.
 *
 * Verifies the full chain:
 *   formatToProfileId('facturx-en16931') → 'facturx-en16931'
 *   → getProfileValidator('facturx-en16931') → FacturXEN16931ProfileValidator
 *   → validateForProfile(data, 'facturx-en16931') runs Factur-X rules (not EN16931 base)
 *
 * Before B-02 fix: formatToProfileId returned 'en16931-base' for both Factur-X formats,
 * which instantiated EN16931BaseProfileValidator instead of the Factur-X-specific ones.
 */
import { describe, it, expect } from 'vitest';
import { formatToProfileId } from '@/lib/format-utils';
import { getProfileValidator } from '@/validation/ProfileValidatorFactory';
import { validateForProfile } from '@/validation/validation-pipeline';
import type { CanonicalInvoice } from '@/types/canonical-invoice';

function makeFacturXInvoice(overrides?: Partial<CanonicalInvoice>): CanonicalInvoice {
  return {
    outputFormat: 'facturx-en16931',
    invoiceNumber: 'FX-2024-001',
    invoiceDate: '2024-07-01',
    currency: 'EUR',
    buyerReference: 'PO-2024-42',
    seller: {
      name: 'Société Française SARL',
      email: 'facturation@societe.fr',
      address: '12 Rue de la Paix',
      city: 'Paris',
      postalCode: '75002',
      countryCode: 'FR',
      vatId: 'FR12345678901',
    },
    buyer: {
      name: 'Deutsche Käufer GmbH',
      email: 'einkauf@kaeufer.de',
      address: 'Hauptstraße 10',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
    },
    payment: {
      iban: 'FR7630006000011234567890189',
      paymentTerms: 'Net 30 days',
      dueDate: '2024-07-31',
    },
    lineItems: [
      {
        description: 'Consulting',
        quantity: 10,
        unitPrice: 150,
        totalPrice: 1500,
        taxRate: 20,
        taxCategoryCode: 'S',
        unitCode: 'HUR',
      },
    ],
    totals: { subtotal: 1500, taxAmount: 300, totalAmount: 1800 },
    taxRate: 20,
    ...overrides,
  };
}

describe('B-02 integration: formatToProfileId → validator → validateForProfile', () => {
  it('formatToProfileId chains to correct Factur-X EN16931 validator', () => {
    const profileId = formatToProfileId('facturx-en16931');
    expect(profileId).toBe('facturx-en16931');

    const validator = getProfileValidator(profileId);
    expect(validator.profileId).toBe('facturx-en16931');
    expect(validator.profileName).toContain('EN 16931');
  });

  it('formatToProfileId chains to correct Factur-X BASIC validator', () => {
    const profileId = formatToProfileId('facturx-basic');
    expect(profileId).toBe('facturx-basic');

    const validator = getProfileValidator(profileId);
    expect(validator.profileId).toBe('facturx-basic');
    expect(validator.profileName).toContain('BASIC');
  });

  it('Factur-X EN16931 validator fires FX-COMMON rules (not just base EN16931)', () => {
    // Missing seller tax ID should trigger FX-COMMON-011
    const invoice = makeFacturXInvoice();
    invoice.seller = {
      ...invoice.seller,
      vatId: undefined,
      taxNumber: undefined,
      taxId: undefined,
    };

    const profileId = formatToProfileId('facturx-en16931');
    const result = validateForProfile(invoice, profileId);

    expect(result.errors.some((e) => e.ruleId.startsWith('FX-COMMON'))).toBe(true);
  });

  it('Factur-X missing seller address fails pre-validation with FX-COMMON-004', () => {
    const invoice = makeFacturXInvoice();
    // FX-COMMON-004 checks data.seller.address (the flat address string)
    invoice.seller = { ...invoice.seller, address: '' };

    const profileId = formatToProfileId('facturx-en16931');
    const result = validateForProfile(invoice, profileId);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'FX-COMMON-004')).toBe(true);
  });

  it('valid Factur-X invoice passes full chain', () => {
    const invoice = makeFacturXInvoice();
    const profileId = formatToProfileId('facturx-en16931');
    const result = validateForProfile(invoice, profileId);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
