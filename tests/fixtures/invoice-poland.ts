/**
 * FIX: Audit V2 [F-029] — Country-specific test fixture for Poland (KSeF).
 * Includes NIP format and Polish addressing conventions.
 */
export const polishInvoice = {
  invoiceNumber: 'FV/2026/02/001',
  issueDate: '2026-02-15',
  documentTypeCode: 380,
  currencyCode: 'PLN',
  sellerName: 'Firma Polska Sp. z o.o.',
  sellerVatId: 'PL1234567890',
  sellerTaxId: '1234567890',
  sellerStreet: 'ul. Marszałkowska 1',
  sellerCity: 'Warszawa',
  sellerPostalCode: '00-001',
  sellerCountryCode: 'PL',
  sellerEmail: 'biuro@firma.pl',
  buyerName: 'Klient Polski S.A.',
  buyerVatId: 'PL0987654321',
  buyerStreet: 'ul. Długa 10',
  buyerCity: 'Kraków',
  buyerPostalCode: '31-001',
  buyerCountryCode: 'PL',
  buyerEmail: 'zamowienia@klient.pl',
  lineItems: [
    {
      description: 'Usługa doradztwa',
      quantity: 5,
      unitPrice: 200.0,
      vatRate: 23,
      vatAmount: 230.0,
      lineTotal: 1000.0,
    },
    {
      description: 'Licencja oprogramowania',
      quantity: 1,
      unitPrice: 3000.0,
      vatRate: 23,
      vatAmount: 690.0,
      lineTotal: 3000.0,
    },
  ],
  subtotal: 4000.0,
  taxAmount: 920.0,
  totalAmount: 4920.0,
  paymentTerms: 'Termin płatności: 14 dni',
};
