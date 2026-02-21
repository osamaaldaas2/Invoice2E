/**
 * FIX: Audit V2 [F-029] — Country-specific test fixture for Italy (FatturaPA).
 * Includes SDI code, Italian VAT format, and natura codes for exempt items.
 */
export const italianInvoice = {
  invoiceNumber: 'FT-2026-001',
  issueDate: '2026-02-15',
  documentTypeCode: 380,
  currencyCode: 'EUR',
  sellerName: 'Azienda Italiana SRL',
  sellerVatId: 'IT12345678901',
  sellerTaxId: '12345678901',
  sellerStreet: 'Via Roma 1',
  sellerCity: 'Milano',
  sellerPostalCode: '20100',
  sellerCountryCode: 'IT',
  sellerEmail: 'info@azienda.it',
  buyerName: 'Cliente Italiano SPA',
  buyerVatId: 'IT09876543210',
  buyerStreet: 'Via Garibaldi 10',
  buyerCity: 'Roma',
  buyerPostalCode: '00100',
  buyerCountryCode: 'IT',
  buyerEmail: 'acquisti@cliente.it',
  sdiCode: '0000000',
  lineItems: [
    {
      description: 'Servizio consulenza',
      quantity: 10,
      unitPrice: 150.0,
      vatRate: 22,
      vatAmount: 330.0,
      lineTotal: 1500.0,
    },
    {
      description: 'Materiale esente',
      quantity: 1,
      unitPrice: 500.0,
      vatRate: 0,
      vatAmount: 0,
      lineTotal: 500.0,
      naturaCode: 'N2.2',
    },
  ],
  subtotal: 2000.0,
  taxAmount: 330.0,
  totalAmount: 2330.0,
  paymentTerms: 'Pagamento a 30 giorni',
};
