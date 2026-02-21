/**
 * FIX: Audit V2 [F-029] — Country-specific test fixture for Romania (CIUS-RO).
 * Includes CUI/CIF number and Romanian addressing conventions.
 */
export const romanianInvoice = {
  invoiceNumber: 'RO-2026-0001',
  issueDate: '2026-02-15',
  documentTypeCode: 380,
  currencyCode: 'RON',
  sellerName: 'Companie Românească SRL',
  sellerVatId: 'RO12345678',
  sellerTaxId: '12345678',
  sellerStreet: 'Strada Victoriei 10',
  sellerCity: 'București',
  sellerPostalCode: '010061',
  sellerCountryCode: 'RO',
  sellerEmail: 'office@companie.ro',
  buyerName: 'Client România SA',
  buyerVatId: 'RO87654321',
  buyerStreet: 'Bulevardul Unirii 5',
  buyerCity: 'Cluj-Napoca',
  buyerPostalCode: '400001',
  buyerCountryCode: 'RO',
  buyerEmail: 'achizitii@client.ro',
  buyerReference: 'CMD-2026-050',
  lineItems: [
    {
      description: 'Servicii de consultanță IT',
      quantity: 20,
      unitPrice: 100.0,
      vatRate: 19,
      vatAmount: 380.0,
      lineTotal: 2000.0,
    },
    {
      description: 'Echipament informatic',
      quantity: 2,
      unitPrice: 1500.0,
      vatRate: 19,
      vatAmount: 570.0,
      lineTotal: 3000.0,
    },
  ],
  subtotal: 5000.0,
  taxAmount: 950.0,
  totalAmount: 5950.0,
  paymentTerms: 'Plata în 30 de zile',
};
