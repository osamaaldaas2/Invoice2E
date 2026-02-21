/**
 * FIX: Audit V2 [F-029] — Country-specific test fixture for Netherlands (NLCIUS).
 * Includes KvK number and Dutch addressing conventions.
 */
export const dutchInvoice = {
  invoiceNumber: 'NL-2026-0001',
  issueDate: '2026-02-15',
  documentTypeCode: 380,
  currencyCode: 'EUR',
  sellerName: 'Nederlandse Bedrijf B.V.',
  sellerVatId: 'NL123456789B01',
  sellerStreet: 'Keizersgracht 100',
  sellerCity: 'Amsterdam',
  sellerPostalCode: '1015 AA',
  sellerCountryCode: 'NL',
  sellerEmail: 'info@bedrijf.nl',
  sellerKvkNumber: '12345678',
  buyerName: 'Klant Nederland B.V.',
  buyerVatId: 'NL987654321B01',
  buyerStreet: 'Oudegracht 50',
  buyerCity: 'Utrecht',
  buyerPostalCode: '3511 AB',
  buyerCountryCode: 'NL',
  buyerEmail: 'inkoop@klant.nl',
  buyerReference: 'PO-2026-100',
  lineItems: [
    {
      description: 'Adviesuren',
      quantity: 8,
      unitPrice: 125.0,
      vatRate: 21,
      vatAmount: 210.0,
      lineTotal: 1000.0,
    },
    {
      description: 'Reiskosten',
      quantity: 1,
      unitPrice: 150.0,
      vatRate: 21,
      vatAmount: 31.5,
      lineTotal: 150.0,
    },
  ],
  subtotal: 1150.0,
  taxAmount: 241.5,
  totalAmount: 1391.5,
  paymentTerms: 'Betaling binnen 30 dagen',
};
