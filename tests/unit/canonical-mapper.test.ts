import { describe, it, expect } from 'vitest';
import { toCanonicalInvoice } from '@/services/format/canonical-mapper';

function createMinimalInput() {
  return {
    invoiceNumber: 'INV-001',
    invoiceDate: '2024-01-30',
    sellerName: 'Seller AG',
    sellerEmail: 'seller@example.de',
    buyerName: 'Buyer GmbH',
    buyerEmail: 'buyer@example.de',
    lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100, totalPrice: 100 }],
    subtotal: 100,
    taxAmount: 19,
    totalAmount: 119,
    currency: 'EUR',
  };
}

describe('toCanonicalInvoice', () => {
  it('maps basic fields', () => {
    const result = toCanonicalInvoice(createMinimalInput());
    expect(result.invoiceNumber).toBe('INV-001');
    expect(result.invoiceDate).toBe('2024-01-30');
    expect(result.currency).toBe('EUR');
    expect(result.outputFormat).toBe('xrechnung-cii');
  });

  it('respects outputFormat parameter', () => {
    const result = toCanonicalInvoice(createMinimalInput(), 'xrechnung-ubl');
    expect(result.outputFormat).toBe('xrechnung-ubl');
  });

  it('maps seller party', () => {
    const input = {
      ...createMinimalInput(),
      sellerAddress: 'Str. 1',
      sellerCity: 'Berlin',
      sellerPostalCode: '10115',
    };
    const result = toCanonicalInvoice(input);
    expect(result.seller.name).toBe('Seller AG');
    expect(result.seller.address).toBe('Str. 1');
    expect(result.seller.city).toBe('Berlin');
    expect(result.seller.postalCode).toBe('10115');
  });

  it('defaults country code to DE', () => {
    const result = toCanonicalInvoice(createMinimalInput());
    expect(result.seller.countryCode).toBe('DE');
    expect(result.buyer.countryCode).toBe('DE');
  });

  it('splits EU VAT ID from sellerTaxId', () => {
    const input = { ...createMinimalInput(), sellerTaxId: 'DE123456789' };
    const result = toCanonicalInvoice(input);
    expect(result.seller.vatId).toBe('DE123456789');
    expect(result.seller.taxNumber).toBeNull();
  });

  it('splits German tax number from sellerTaxId', () => {
    const input = { ...createMinimalInput(), sellerTaxId: '123/456/78901' };
    const result = toCanonicalInvoice(input);
    expect(result.seller.taxNumber).toBe('123/456/78901');
    expect(result.seller.vatId).toBeNull();
  });

  it('preserves explicit sellerVatId and sellerTaxNumber', () => {
    const input = {
      ...createMinimalInput(),
      sellerVatId: 'DE111111111',
      sellerTaxNumber: '111/222/33333',
      sellerTaxId: 'DE999999999',
    };
    const result = toCanonicalInvoice(input);
    expect(result.seller.vatId).toBe('DE111111111');
    expect(result.seller.taxNumber).toBe('111/222/33333');
  });

  it('falls back electronicAddress to email', () => {
    const result = toCanonicalInvoice(createMinimalInput());
    expect(result.seller.electronicAddress).toBe('seller@example.de');
    expect(result.seller.electronicAddressScheme).toBe('EM');
    expect(result.buyer.electronicAddress).toBe('buyer@example.de');
  });

  it('uses EM scheme for email addresses in peppol-bis format', () => {
    const result = toCanonicalInvoice(createMinimalInput(), 'peppol-bis');
    expect(result.seller.electronicAddressScheme).toBe('EM');
    expect(result.buyer.electronicAddressScheme).toBe('EM');
  });

  it('uses EM scheme for email addresses in nlcius format', () => {
    const result = toCanonicalInvoice(createMinimalInput(), 'nlcius');
    expect(result.seller.electronicAddressScheme).toBe('EM');
    expect(result.buyer.electronicAddressScheme).toBe('EM');
  });

  it('uses EM scheme for email addresses in cius-ro format', () => {
    const result = toCanonicalInvoice(createMinimalInput(), 'cius-ro');
    expect(result.seller.electronicAddressScheme).toBe('EM');
    expect(result.buyer.electronicAddressScheme).toBe('EM');
  });

  it('preserves explicit non-EM scheme for peppol-bis format', () => {
    const input = {
      ...createMinimalInput(),
      sellerElectronicAddress: '0204:991-01234-56',
      sellerElectronicAddressScheme: '0204',
    };
    const result = toCanonicalInvoice(input, 'peppol-bis');
    expect(result.seller.electronicAddressScheme).toBe('0204');
  });

  it('maps line items', () => {
    const input = {
      ...createMinimalInput(),
      lineItems: [
        {
          description: 'Item A',
          quantity: 2,
          unitPrice: 50,
          totalPrice: 100,
          taxRate: 19,
          unitCode: 'C62',
        },
      ],
    };
    const result = toCanonicalInvoice(input);
    expect(result.lineItems).toHaveLength(1);
    const item = result.lineItems[0]!;
    expect(item.description).toBe('Item A');
    expect(item.quantity).toBe(2);
    expect(item.unitPrice).toBe(50);
    expect(item.totalPrice).toBe(100);
    expect(item.taxRate).toBe(19);
    expect(item.unitCode).toBe('C62');
  });

  it('computes totalPrice from quantity * unitPrice when missing', () => {
    const input = {
      ...createMinimalInput(),
      lineItems: [{ description: 'X', quantity: 3, unitPrice: 10 }],
    };
    const result = toCanonicalInvoice(input);
    expect(result.lineItems[0]!.totalPrice).toBe(30);
  });

  it('maps totals', () => {
    const result = toCanonicalInvoice(createMinimalInput());
    expect(result.totals.subtotal).toBe(100);
    expect(result.totals.taxAmount).toBe(19);
    expect(result.totals.totalAmount).toBe(119);
  });

  it('maps payment info', () => {
    const input = {
      ...createMinimalInput(),
      sellerIban: 'DE89370400440532013000',
      sellerBic: 'COBADEFFXXX',
      paymentTerms: 'Net 30',
      dueDate: '2024-02-28',
    };
    const result = toCanonicalInvoice(input);
    expect(result.payment.iban).toBe('DE89370400440532013000');
    expect(result.payment.bic).toBe('COBADEFFXXX');
    expect(result.payment.paymentTerms).toBe('Net 30');
    expect(result.payment.dueDate).toBe('2024-02-28');
  });

  it('maps allowance charges', () => {
    const input = {
      ...createMinimalInput(),
      allowanceCharges: [{ chargeIndicator: false, amount: 10, reason: 'Discount' }],
    };
    const result = toCanonicalInvoice(input);
    expect(result.allowanceCharges).toHaveLength(1);
    const ac = result.allowanceCharges![0]!;
    expect(ac.chargeIndicator).toBe(false);
    expect(ac.amount).toBe(10);
    expect(ac.reason).toBe('Discount');
  });

  it('returns undefined allowanceCharges when empty', () => {
    const result = toCanonicalInvoice(createMinimalInput());
    expect(result.allowanceCharges).toBeUndefined();
  });

  it('handles missing optional fields gracefully', () => {
    const input = {
      invoiceNumber: 'X',
      sellerName: 'S',
      buyerName: 'B',
      lineItems: [{ description: 'I', unitPrice: 1 }],
      totalAmount: 1,
    };
    const result = toCanonicalInvoice(input as Record<string, unknown>);
    expect(result.invoiceNumber).toBe('X');
    expect(result.currency).toBe('EUR');
    expect(result.lineItems[0]!.quantity).toBe(1);
  });
});
