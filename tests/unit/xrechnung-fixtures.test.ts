/**
 * Comprehensive XRechnung validation fixtures.
 * Tests the full pipeline: schema → business rules → BR-DE profile rules → XML generation.
 *
 * A) Mixed VAT (7% + 19%) — must pass
 * B) Credit Notes (381) — must pass with negative values
 * C) Missing IBAN — must fail BR-DE-23-a
 * D) Missing Electronic Address — must fail PEPPOL-EN16931-R010
 */
import { describe, it, expect } from 'vitest';
import { XRechnungService } from '@/services/xrechnung/xrechnung.service';
import { XRechnungValidator } from '@/services/xrechnung/validator';
import { ValidationError } from '@/lib/errors';
import type { XRechnungInvoiceData } from '@/services/xrechnung/types';

const service = new XRechnungService();
const validator = new XRechnungValidator();

// ─── Base fixture factory ─────────────────────────────────────────────

function makeBase(overrides: Partial<XRechnungInvoiceData> = {}): XRechnungInvoiceData {
  return {
    invoiceNumber: 'TEST-BASE-001',
    invoiceDate: '2025-01-15',
    documentTypeCode: 380,
    currency: 'EUR',

    sellerName: 'Muster GmbH',
    sellerAddress: 'Hauptstrasse 12',
    sellerCity: 'Berlin',
    sellerPostalCode: '10115',
    sellerCountryCode: 'DE',
    sellerPhone: '+49 30 1234567',
    sellerEmail: 'info@muster.de',
    sellerElectronicAddress: 'info@muster.de',
    sellerElectronicAddressScheme: 'EM',
    sellerTaxId: 'DE123456789',
    sellerIban: 'DE44500105175407324931',
    sellerBic: 'INGDDEFFXXX',

    buyerName: 'Stadt Köln',
    buyerAddress: 'Rathausplatz 1',
    buyerCity: 'Köln',
    buyerPostalCode: '50667',
    buyerCountryCode: 'DE',
    buyerElectronicAddress: '0204:991-12345-12',
    buyerElectronicAddressScheme: '0204',
    buyerReference: '991-12345-12',

    lineItems: [
      {
        description: 'Standard Service',
        quantity: 1,
        unitPrice: 100,
        totalPrice: 100,
        taxRate: 19,
        taxCategoryCode: 'S',
      },
    ],
    subtotal: 100,
    taxAmount: 19,
    totalAmount: 119,
    paymentTerms: 'Net 30',
    ...overrides,
  } as XRechnungInvoiceData;
}

// ─── A) Mixed VAT (7% + 19%) — must pass ──────────────────────────────

describe('A: Mixed VAT invoices (7% + 19%)', () => {
  const mixedFixtures: { name: string; data: XRechnungInvoiceData }[] = [
    {
      name: 'MIX-001 Goods + Books',
      data: makeBase({
        invoiceNumber: 'TEST-MIX-001',
        lineItems: [
          {
            description: 'IT Consulting Service',
            quantity: 1,
            unitPrice: 1000,
            totalPrice: 1000,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'Printed Books',
            quantity: 10,
            unitPrice: 20,
            totalPrice: 200,
            taxRate: 7,
            taxCategoryCode: 'S',
          },
        ],
        subtotal: 1200,
        taxAmount: 204, // 1000*0.19=190 + 200*0.07=14 = 204
        totalAmount: 1404,
      }),
    },
    {
      name: 'MIX-002 Software + Catering',
      data: makeBase({
        invoiceNumber: 'TEST-MIX-002',
        sellerName: 'Test Services AG',
        sellerAddress: 'Marktplatz 5',
        sellerCity: 'Hamburg',
        sellerPostalCode: '20095',
        lineItems: [
          {
            description: 'Software License',
            quantity: 1,
            unitPrice: 500,
            totalPrice: 500,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'Catering Service',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            taxRate: 7,
            taxCategoryCode: 'S',
          },
        ],
        subtotal: 600,
        taxAmount: 102, // 500*0.19=95 + 100*0.07=7 = 102
        totalAmount: 702,
      }),
    },
    {
      name: 'MIX-003 Hardware + Shipping',
      data: makeBase({
        invoiceNumber: 'TEST-MIX-003',
        lineItems: [
          {
            description: 'Laptop',
            quantity: 2,
            unitPrice: 800,
            totalPrice: 1600,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'Express Shipping',
            quantity: 1,
            unitPrice: 50,
            totalPrice: 50,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'User Manual (print)',
            quantity: 2,
            unitPrice: 15,
            totalPrice: 30,
            taxRate: 7,
            taxCategoryCode: 'S',
          },
        ],
        subtotal: 1680,
        taxAmount: 315.6, // (1600+50)*0.19=313.50 + 30*0.07=2.10 = 315.60
        totalAmount: 1995.6,
      }),
    },
    {
      name: 'MIX-004 3 items at 19% + 2 items at 7%',
      data: makeBase({
        invoiceNumber: 'TEST-MIX-004',
        lineItems: [
          {
            description: 'Desk',
            quantity: 1,
            unitPrice: 300,
            totalPrice: 300,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'Chair',
            quantity: 2,
            unitPrice: 150,
            totalPrice: 300,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'Monitor',
            quantity: 1,
            unitPrice: 400,
            totalPrice: 400,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'Technical Book',
            quantity: 3,
            unitPrice: 40,
            totalPrice: 120,
            taxRate: 7,
            taxCategoryCode: 'S',
          },
          {
            description: 'Journal Subscription',
            quantity: 1,
            unitPrice: 80,
            totalPrice: 80,
            taxRate: 7,
            taxCategoryCode: 'S',
          },
        ],
        subtotal: 1200,
        taxAmount: 204, // 1000*0.19=190 + 200*0.07=14 = 204
        totalAmount: 1404,
      }),
    },
    {
      name: 'MIX-005 Small amounts 7% + 19%',
      data: makeBase({
        invoiceNumber: 'TEST-MIX-005',
        lineItems: [
          {
            description: 'USB Cable',
            quantity: 5,
            unitPrice: 5,
            totalPrice: 25,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'Booklet',
            quantity: 2,
            unitPrice: 3,
            totalPrice: 6,
            taxRate: 7,
            taxCategoryCode: 'S',
          },
        ],
        subtotal: 31,
        taxAmount: 5.17, // 25*0.19=4.75 + 6*0.07=0.42 = 5.17
        totalAmount: 36.17,
      }),
    },
  ];

  for (const fixture of mixedFixtures) {
    it(`${fixture.name}: should generate valid XML`, async () => {
      const result = await service.generateXRechnung(fixture.data);

      expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
      expect(result.xmlContent).toContain(fixture.data.invoiceNumber);
      expect(result.validationErrors).toHaveLength(0);
      expect(['valid', 'warnings']).toContain(result.validationStatus);
    });

    it(`${fixture.name}: should pass internal validation`, () => {
      const result = validator.validateInvoiceDataSafe(fixture.data);
      expect(result.errors).toHaveLength(0);
    });

    it(`${fixture.name}: XML should contain multiple tax breakdowns`, async () => {
      const result = await service.generateXRechnung(fixture.data);
      // Should have ApplicableTradeTax entries for both 7% and 19%
      expect(result.xmlContent).toContain(
        '<ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>'
      );
      expect(result.xmlContent).toContain(
        '<ram:RateApplicablePercent>7.00</ram:RateApplicablePercent>'
      );
    });
  }
});

// ─── B) Credit Notes (381) — must pass with negative values ────────────

describe('B: Credit Notes (documentTypeCode 381)', () => {
  const creditFixtures: { name: string; data: XRechnungInvoiceData }[] = [
    {
      name: 'CN-001 Simple refund (19%)',
      data: makeBase({
        invoiceNumber: 'TEST-CN-001',
        documentTypeCode: 381,
        precedingInvoiceReference: 'INV-2025-001',
        lineItems: [
          {
            description: 'Refund IT Service',
            quantity: 1,
            unitPrice: -100,
            totalPrice: -100,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
        ],
        subtotal: -100,
        taxAmount: -19,
        totalAmount: -119,
        paymentTerms: 'Immediate',
      }),
    },
    {
      name: 'CN-002 Multi-line refund (mixed rates)',
      data: makeBase({
        invoiceNumber: 'TEST-CN-002',
        documentTypeCode: 381,
        precedingInvoiceReference: 'INV-2025-002',
        lineItems: [
          {
            description: 'Refund Software',
            quantity: 1,
            unitPrice: -200,
            totalPrice: -200,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
          {
            description: 'Refund Book',
            quantity: 1,
            unitPrice: -50,
            totalPrice: -50,
            taxRate: 7,
            taxCategoryCode: 'S',
          },
        ],
        subtotal: -250,
        taxAmount: -41.5, // -200*0.19=-38 + -50*0.07=-3.50 = -41.50
        totalAmount: -291.5,
        paymentTerms: 'Immediate',
      }),
    },
    {
      name: 'CN-003 Partial refund (19%)',
      data: makeBase({
        invoiceNumber: 'TEST-CN-003',
        documentTypeCode: 381,
        precedingInvoiceReference: 'INV-2025-003',
        lineItems: [
          {
            description: 'Partial Refund Consulting',
            quantity: 1,
            unitPrice: -500,
            totalPrice: -500,
            taxRate: 19,
            taxCategoryCode: 'S',
          },
        ],
        subtotal: -500,
        taxAmount: -95,
        totalAmount: -595,
        paymentTerms: 'Immediate',
      }),
    },
  ];

  for (const fixture of creditFixtures) {
    it(`${fixture.name}: should pass validation (381 allows negative totals)`, () => {
      const result = validator.validateInvoiceDataSafe(fixture.data);
      // Credit notes should not fail SCHEMA-005 (totalAmount must be > 0) because docType is 381
      const schemaErrors = result.errors.filter((e) => e.ruleId === 'SCHEMA-005');
      expect(schemaErrors).toHaveLength(0);
    });

    it(`${fixture.name}: should generate valid XML with TypeCode 381`, async () => {
      const result = await service.generateXRechnung(fixture.data);
      expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
      expect(result.xmlContent).toContain(fixture.data.invoiceNumber);
      expect(result.validationErrors).toHaveLength(0);
    });
  }
});

// ─── C) Missing IBAN — must fail BR-DE-23-a ────────────────────────────

describe('C: Missing IBAN (should fail BR-DE-23-a)', () => {
  const noIbanFixtures: { name: string; data: XRechnungInvoiceData }[] = [
    {
      name: 'NOIBAN-001 Empty IBAN',
      data: makeBase({
        invoiceNumber: 'TEST-NOIBAN-001',
        sellerName: 'Fail GmbH',
        sellerIban: '',
      }),
    },
    {
      name: 'NOIBAN-002 Null IBAN',
      data: makeBase({
        invoiceNumber: 'TEST-NOIBAN-002',
        sellerIban: null,
      }),
    },
    {
      name: 'NOIBAN-003 Undefined IBAN',
      data: makeBase({
        invoiceNumber: 'TEST-NOIBAN-003',
        sellerIban: undefined,
      }),
    },
  ];

  for (const fixture of noIbanFixtures) {
    it(`${fixture.name}: internal validation should report BR-DE-23-a error`, () => {
      const result = validator.validateInvoiceDataSafe(fixture.data);
      const ibanErrors = result.errors.filter((e) => e.ruleId === 'BR-DE-23-a');
      expect(ibanErrors.length).toBeGreaterThanOrEqual(1);
      expect(ibanErrors[0]!.message).toContain('IBAN');
    });

    it(`${fixture.name}: generateXRechnung should throw ValidationError`, async () => {
      await expect(service.generateXRechnung(fixture.data)).rejects.toThrow(ValidationError);
    });
  }
});

// ─── D) Missing Electronic Address — must fail PEPPOL-EN16931-R010 ──────

describe('D: Missing Buyer Electronic Address (should fail PEPPOL-EN16931-R010)', () => {
  const noEndpointFixtures: { name: string; data: XRechnungInvoiceData }[] = [
    {
      name: 'NOENDPOINT-001 No buyer electronic address',
      data: makeBase({
        invoiceNumber: 'TEST-NOENDPOINT-001',
        buyerElectronicAddress: '',
        buyerElectronicAddressScheme: undefined,
        buyerEmail: undefined,
      }),
    },
    {
      name: 'NOENDPOINT-002 Null buyer electronic address',
      data: makeBase({
        invoiceNumber: 'TEST-NOENDPOINT-002',
        buyerElectronicAddress: null,
        buyerElectronicAddressScheme: null,
      }),
    },
    {
      name: 'NOENDPOINT-003 No seller electronic address',
      data: makeBase({
        invoiceNumber: 'TEST-NOENDPOINT-003',
        sellerElectronicAddress: '',
        sellerElectronicAddressScheme: undefined,
        sellerEmail: '',
      }),
    },
  ];

  for (const fixture of noEndpointFixtures) {
    it(`${fixture.name}: internal validation should report electronic address error`, () => {
      const result = validator.validateInvoiceDataSafe(fixture.data);
      const endpointErrors = result.errors.filter(
        (e) => e.ruleId === 'PEPPOL-EN16931-R010' || e.ruleId === 'BR-DE-SELLER-EADDR'
      );
      expect(endpointErrors.length).toBeGreaterThanOrEqual(1);
    });

    it(`${fixture.name}: generateXRechnung should throw ValidationError`, async () => {
      await expect(service.generateXRechnung(fixture.data)).rejects.toThrow(ValidationError);
    });
  }
});

// ─── F) Zero-rated (Z) and Reverse charge (AE) — must pass with correct XML ──

describe('F: Zero-rated (Z) and Reverse charge (AE)', () => {
  const zeroRatedZ = makeBase({
    invoiceNumber: 'ZERORATED-Z-001',
    documentTypeCode: 380,
    lineItems: [
      {
        description: 'Exported machinery parts',
        quantity: 5,
        unitPrice: 200,
        totalPrice: 1000,
        taxRate: 0,
        taxCategoryCode: 'Z',
      },
      {
        description: 'Technical documentation',
        quantity: 1,
        unitPrice: 150,
        totalPrice: 150,
        taxRate: 0,
        taxCategoryCode: 'Z',
      },
    ],
    subtotal: 1150,
    taxAmount: 0,
    totalAmount: 1150,
  });

  const reverseChargeAE = makeBase({
    invoiceNumber: 'REVERSE-AE-001',
    documentTypeCode: 380,
    sellerName: 'TechSupply GmbH',
    sellerAddress: 'Industriestraße 8',
    sellerCity: 'München',
    sellerPostalCode: '80331',
    sellerCountryCode: 'DE',
    sellerTaxId: 'DE987654321',
    buyerName: 'EuroCorp B.V.',
    buyerAddress: 'Keizersgracht 100',
    buyerCity: 'Amsterdam',
    buyerPostalCode: '1015 AA',
    buyerCountryCode: 'NL',
    buyerVatId: 'NL123456789B01',
    lineItems: [
      {
        description: 'Cloud infrastructure setup',
        quantity: 1,
        unitPrice: 5000,
        totalPrice: 5000,
        taxRate: 0,
        taxCategoryCode: 'AE',
      },
      {
        description: 'Annual support contract',
        quantity: 1,
        unitPrice: 2400,
        totalPrice: 2400,
        taxRate: 0,
        taxCategoryCode: 'AE',
      },
    ],
    subtotal: 7400,
    taxAmount: 0,
    totalAmount: 7400,
  });

  // --- F1: Zero-rated (Z) ---

  it('F1 ZERORATED-Z-001: should pass internal validation', () => {
    const result = validator.validateInvoiceDataSafe(zeroRatedZ);
    expect(result.errors).toHaveLength(0);
  });

  it('F1 ZERORATED-Z-001: should generate valid XML', async () => {
    const result = await service.generateXRechnung(zeroRatedZ);
    expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
    expect(result.xmlContent).toContain('ZERORATED-Z-001');
    expect(result.validationErrors).toHaveLength(0);
    expect(['valid', 'warnings']).toContain(result.validationStatus);
  });

  it('F1 ZERORATED-Z-001: XML should contain CategoryCode Z', async () => {
    const result = await service.generateXRechnung(zeroRatedZ);
    expect(result.xmlContent).toContain('<ram:CategoryCode>Z</ram:CategoryCode>');
  });

  it('F1 ZERORATED-Z-001: XML should contain ExemptionReason for Z', async () => {
    const result = await service.generateXRechnung(zeroRatedZ);
    expect(result.xmlContent).toContain(
      '<ram:ExemptionReason>Zero rated goods</ram:ExemptionReason>'
    );
  });

  it('F1 ZERORATED-Z-001: XML should contain RateApplicablePercent 0.00', async () => {
    const result = await service.generateXRechnung(zeroRatedZ);
    expect(result.xmlContent).toContain(
      '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>'
    );
  });

  it('F1 ZERORATED-Z-001: XML should have TaxTotalAmount = 0 and GrandTotal = subtotal', async () => {
    const result = await service.generateXRechnung(zeroRatedZ);
    // Tax calculated amount should be 0
    expect(result.xmlContent).toContain('<ram:CalculatedAmount>0.00</ram:CalculatedAmount>');
    // Grand total should equal the subtotal (1150)
    expect(result.xmlContent).toContain('<ram:GrandTotalAmount>1150.00</ram:GrandTotalAmount>');
    expect(result.xmlContent).toContain(
      '<ram:TaxBasisTotalAmount>1150.00</ram:TaxBasisTotalAmount>'
    );
    expect(result.xmlContent).toContain(
      '<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>'
    );
  });

  // --- F2: Reverse charge (AE) ---

  it('F2 REVERSE-AE-001: should pass internal validation', () => {
    const result = validator.validateInvoiceDataSafe(reverseChargeAE);
    expect(result.errors).toHaveLength(0);
  });

  it('F2 REVERSE-AE-001: should generate valid XML', async () => {
    const result = await service.generateXRechnung(reverseChargeAE);
    expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
    expect(result.xmlContent).toContain('REVERSE-AE-001');
    expect(result.validationErrors).toHaveLength(0);
    expect(['valid', 'warnings']).toContain(result.validationStatus);
  });

  it('F2 REVERSE-AE-001: XML should contain CategoryCode AE', async () => {
    const result = await service.generateXRechnung(reverseChargeAE);
    expect(result.xmlContent).toContain('<ram:CategoryCode>AE</ram:CategoryCode>');
  });

  it('F2 REVERSE-AE-001: XML should contain ExemptionReason for AE', async () => {
    const result = await service.generateXRechnung(reverseChargeAE);
    expect(result.xmlContent).toContain(
      '<ram:ExemptionReason>Reverse charge - Loss of tax liability of the buyer applies</ram:ExemptionReason>'
    );
  });

  it('F2 REVERSE-AE-001: XML should contain RateApplicablePercent 0.00', async () => {
    const result = await service.generateXRechnung(reverseChargeAE);
    expect(result.xmlContent).toContain(
      '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>'
    );
  });

  it('F2 REVERSE-AE-001: XML should have TaxTotalAmount = 0 and GrandTotal = subtotal', async () => {
    const result = await service.generateXRechnung(reverseChargeAE);
    expect(result.xmlContent).toContain('<ram:CalculatedAmount>0.00</ram:CalculatedAmount>');
    expect(result.xmlContent).toContain('<ram:GrandTotalAmount>7400.00</ram:GrandTotalAmount>');
    expect(result.xmlContent).toContain(
      '<ram:TaxBasisTotalAmount>7400.00</ram:TaxBasisTotalAmount>'
    );
    expect(result.xmlContent).toContain(
      '<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>'
    );
  });

  it('F2 REVERSE-AE-001: XML should contain buyer VAT ID', async () => {
    const result = await service.generateXRechnung(reverseChargeAE);
    expect(result.xmlContent).toContain('NL123456789B01');
  });
});

// ─── G) VAT Category Matrix: K, G, O, L — must pass with correct XML ────

describe('G: Intra-community (K), Export (G), Not subject (O), Canary Islands (L)', () => {
  // --- K: Intra-community supply (DE → FR) ---
  const intraCommunityK = makeBase({
    invoiceNumber: 'INTRA-K-001',
    documentTypeCode: 380,
    sellerName: 'Europarts GmbH',
    sellerAddress: 'Hafenstraße 22',
    sellerCity: 'Hamburg',
    sellerPostalCode: '20457',
    sellerCountryCode: 'DE',
    sellerTaxId: 'DE111222333',
    buyerName: 'Acme Industries SARL',
    buyerAddress: '15 Rue de la Paix',
    buyerCity: 'Paris',
    buyerPostalCode: '75002',
    buyerCountryCode: 'FR',
    buyerVatId: 'FR12345678901',
    lineItems: [
      {
        description: 'Intra-EU goods supply',
        quantity: 10,
        unitPrice: 120,
        totalPrice: 1200,
        taxRate: 0,
        taxCategoryCode: 'K',
      },
      {
        description: 'Freight cost (included in supply)',
        quantity: 1,
        unitPrice: 150,
        totalPrice: 150,
        taxRate: 0,
        taxCategoryCode: 'K',
      },
    ],
    subtotal: 1350,
    taxAmount: 0,
    totalAmount: 1350,
  });

  // --- G: Export outside EU (DE → CH) ---
  const exportG = makeBase({
    invoiceNumber: 'EXPORT-G-001',
    documentTypeCode: 380,
    sellerName: 'Deutsche Maschinen AG',
    sellerAddress: 'Werkstraße 5',
    sellerCity: 'Stuttgart',
    sellerPostalCode: '70173',
    sellerCountryCode: 'DE',
    sellerTaxId: 'DE444555666',
    buyerName: 'SwissTech AG',
    buyerAddress: 'Bahnhofstrasse 10',
    buyerCity: 'Zürich',
    buyerPostalCode: '8001',
    buyerCountryCode: 'CH',
    lineItems: [
      {
        description: 'Exported machinery',
        quantity: 1,
        unitPrice: 8000,
        totalPrice: 8000,
        taxRate: 0,
        taxCategoryCode: 'G',
      },
      {
        description: 'Export packaging',
        quantity: 1,
        unitPrice: 200,
        totalPrice: 200,
        taxRate: 0,
        taxCategoryCode: 'G',
      },
    ],
    subtotal: 8200,
    taxAmount: 0,
    totalAmount: 8200,
  });

  // --- O: Not subject to VAT (DE → DE, outside scope) ---
  const notSubjectO = makeBase({
    invoiceNumber: 'NOTSUBJ-O-001',
    documentTypeCode: 380,
    lineItems: [
      {
        description: 'Public fee (outside VAT scope)',
        quantity: 1,
        unitPrice: 300,
        totalPrice: 300,
        taxRate: 0,
        taxCategoryCode: 'O',
      },
      {
        description: 'Administrative charge (outside VAT scope)',
        quantity: 1,
        unitPrice: 50,
        totalPrice: 50,
        taxRate: 0,
        taxCategoryCode: 'O',
      },
    ],
    subtotal: 350,
    taxAmount: 0,
    totalAmount: 350,
  });

  // --- L: Canary Islands IGIC (DE → ES) ---
  const canaryL = makeBase({
    invoiceNumber: 'CANARY-L-001',
    documentTypeCode: 380,
    buyerName: 'Isla Supplies S.L.',
    buyerAddress: 'Calle Mayor 8',
    buyerCity: 'Las Palmas',
    buyerPostalCode: '35001',
    buyerCountryCode: 'ES',
    lineItems: [
      {
        description: 'Supply to Canary Islands (IGIC area)',
        quantity: 5,
        unitPrice: 100,
        totalPrice: 500,
        taxRate: 0,
        taxCategoryCode: 'L',
      },
      {
        description: 'Transport to Canary Islands',
        quantity: 1,
        unitPrice: 80,
        totalPrice: 80,
        taxRate: 0,
        taxCategoryCode: 'L',
      },
    ],
    subtotal: 580,
    taxAmount: 0,
    totalAmount: 580,
  });

  // ── INTRA-K-001 ──

  it('INTRA-K-001: should pass internal validation', () => {
    const result = validator.validateInvoiceDataSafe(intraCommunityK);
    expect(result.errors).toHaveLength(0);
  });

  it('INTRA-K-001: should generate valid XML', async () => {
    const result = await service.generateXRechnung(intraCommunityK);
    expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
    expect(result.xmlContent).toContain('INTRA-K-001');
    expect(result.validationErrors).toHaveLength(0);
    expect(['valid', 'warnings']).toContain(result.validationStatus);
  });

  it('INTRA-K-001: XML should contain CategoryCode K', async () => {
    const result = await service.generateXRechnung(intraCommunityK);
    expect(result.xmlContent).toContain('<ram:CategoryCode>K</ram:CategoryCode>');
  });

  it('INTRA-K-001: XML should contain ExemptionReason for K', async () => {
    const result = await service.generateXRechnung(intraCommunityK);
    expect(result.xmlContent).toContain(
      '<ram:ExemptionReason>Intra-community supply</ram:ExemptionReason>'
    );
  });

  it('INTRA-K-001: XML should contain RateApplicablePercent 0.00', async () => {
    const result = await service.generateXRechnung(intraCommunityK);
    expect(result.xmlContent).toContain(
      '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>'
    );
  });

  it('INTRA-K-001: XML should have TaxTotalAmount = 0 and GrandTotal = subtotal', async () => {
    const result = await service.generateXRechnung(intraCommunityK);
    expect(result.xmlContent).toContain('<ram:CalculatedAmount>0.00</ram:CalculatedAmount>');
    expect(result.xmlContent).toContain('<ram:GrandTotalAmount>1350.00</ram:GrandTotalAmount>');
    expect(result.xmlContent).toContain(
      '<ram:TaxBasisTotalAmount>1350.00</ram:TaxBasisTotalAmount>'
    );
    expect(result.xmlContent).toContain(
      '<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>'
    );
  });

  it('INTRA-K-001: XML should contain buyer VAT ID', async () => {
    const result = await service.generateXRechnung(intraCommunityK);
    expect(result.xmlContent).toContain('FR12345678901');
  });

  // ── EXPORT-G-001 ──

  it('EXPORT-G-001: should pass internal validation', () => {
    const result = validator.validateInvoiceDataSafe(exportG);
    expect(result.errors).toHaveLength(0);
  });

  it('EXPORT-G-001: should generate valid XML', async () => {
    const result = await service.generateXRechnung(exportG);
    expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
    expect(result.xmlContent).toContain('EXPORT-G-001');
    expect(result.validationErrors).toHaveLength(0);
    expect(['valid', 'warnings']).toContain(result.validationStatus);
  });

  it('EXPORT-G-001: XML should contain CategoryCode G', async () => {
    const result = await service.generateXRechnung(exportG);
    expect(result.xmlContent).toContain('<ram:CategoryCode>G</ram:CategoryCode>');
  });

  it('EXPORT-G-001: XML should contain ExemptionReason for G', async () => {
    const result = await service.generateXRechnung(exportG);
    expect(result.xmlContent).toContain(
      '<ram:ExemptionReason>Export outside the EU</ram:ExemptionReason>'
    );
  });

  it('EXPORT-G-001: XML should contain RateApplicablePercent 0.00', async () => {
    const result = await service.generateXRechnung(exportG);
    expect(result.xmlContent).toContain(
      '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>'
    );
  });

  it('EXPORT-G-001: XML should have TaxTotalAmount = 0 and GrandTotal = subtotal', async () => {
    const result = await service.generateXRechnung(exportG);
    expect(result.xmlContent).toContain('<ram:CalculatedAmount>0.00</ram:CalculatedAmount>');
    expect(result.xmlContent).toContain('<ram:GrandTotalAmount>8200.00</ram:GrandTotalAmount>');
    expect(result.xmlContent).toContain(
      '<ram:TaxBasisTotalAmount>8200.00</ram:TaxBasisTotalAmount>'
    );
    expect(result.xmlContent).toContain(
      '<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>'
    );
  });

  // ── NOTSUBJ-O-001 ──

  it('NOTSUBJ-O-001: should pass internal validation', () => {
    const result = validator.validateInvoiceDataSafe(notSubjectO);
    expect(result.errors).toHaveLength(0);
  });

  it('NOTSUBJ-O-001: should generate valid XML', async () => {
    const result = await service.generateXRechnung(notSubjectO);
    expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
    expect(result.xmlContent).toContain('NOTSUBJ-O-001');
    expect(result.validationErrors).toHaveLength(0);
    expect(['valid', 'warnings']).toContain(result.validationStatus);
  });

  it('NOTSUBJ-O-001: XML should contain CategoryCode O', async () => {
    const result = await service.generateXRechnung(notSubjectO);
    expect(result.xmlContent).toContain('<ram:CategoryCode>O</ram:CategoryCode>');
  });

  it('NOTSUBJ-O-001: XML should contain ExemptionReason for O', async () => {
    const result = await service.generateXRechnung(notSubjectO);
    expect(result.xmlContent).toContain(
      '<ram:ExemptionReason>Not subject to VAT</ram:ExemptionReason>'
    );
  });

  it('NOTSUBJ-O-001: XML should contain RateApplicablePercent 0.00', async () => {
    const result = await service.generateXRechnung(notSubjectO);
    expect(result.xmlContent).toContain(
      '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>'
    );
  });

  it('NOTSUBJ-O-001: XML should have TaxTotalAmount = 0 and GrandTotal = subtotal', async () => {
    const result = await service.generateXRechnung(notSubjectO);
    expect(result.xmlContent).toContain('<ram:CalculatedAmount>0.00</ram:CalculatedAmount>');
    expect(result.xmlContent).toContain('<ram:GrandTotalAmount>350.00</ram:GrandTotalAmount>');
    expect(result.xmlContent).toContain(
      '<ram:TaxBasisTotalAmount>350.00</ram:TaxBasisTotalAmount>'
    );
    expect(result.xmlContent).toContain(
      '<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>'
    );
  });

  // ── CANARY-L-001 ──

  it('CANARY-L-001: should pass internal validation', () => {
    const result = validator.validateInvoiceDataSafe(canaryL);
    expect(result.errors).toHaveLength(0);
  });

  it('CANARY-L-001: should generate valid XML', async () => {
    const result = await service.generateXRechnung(canaryL);
    expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
    expect(result.xmlContent).toContain('CANARY-L-001');
    expect(result.validationErrors).toHaveLength(0);
    expect(['valid', 'warnings']).toContain(result.validationStatus);
  });

  it('CANARY-L-001: XML should contain CategoryCode L', async () => {
    const result = await service.generateXRechnung(canaryL);
    expect(result.xmlContent).toContain('<ram:CategoryCode>L</ram:CategoryCode>');
  });

  it('CANARY-L-001: XML should contain ExemptionReason for L', async () => {
    const result = await service.generateXRechnung(canaryL);
    expect(result.xmlContent).toContain(
      '<ram:ExemptionReason>Canary Islands general indirect tax</ram:ExemptionReason>'
    );
  });

  it('CANARY-L-001: XML should contain RateApplicablePercent 0.00', async () => {
    const result = await service.generateXRechnung(canaryL);
    expect(result.xmlContent).toContain(
      '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>'
    );
  });

  it('CANARY-L-001: XML should have TaxTotalAmount = 0 and GrandTotal = subtotal', async () => {
    const result = await service.generateXRechnung(canaryL);
    expect(result.xmlContent).toContain('<ram:CalculatedAmount>0.00</ram:CalculatedAmount>');
    expect(result.xmlContent).toContain('<ram:GrandTotalAmount>580.00</ram:GrandTotalAmount>');
    expect(result.xmlContent).toContain(
      '<ram:TaxBasisTotalAmount>580.00</ram:TaxBasisTotalAmount>'
    );
    expect(result.xmlContent).toContain(
      '<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>'
    );
  });
});

// ─── E) Edge cases ──────────────────────────────────────────────────────

describe('E: Edge cases', () => {
  it('Zero-rate line item with taxCategoryCode E (exempt)', async () => {
    const data = makeBase({
      invoiceNumber: 'TEST-EDGE-EXEMPT',
      lineItems: [
        {
          description: 'Tax-exempt service',
          quantity: 1,
          unitPrice: 500,
          totalPrice: 500,
          taxRate: 0,
          taxCategoryCode: 'E',
        },
      ],
      subtotal: 500,
      taxAmount: 0,
      totalAmount: 500,
    });
    const result = await service.generateXRechnung(data);
    expect(result.xmlContent).toContain('rsm:CrossIndustryInvoice');
    expect(result.xmlContent).toContain(
      '<ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>'
    );
  });

  it('Invoice without buyerReference should still pass (warning only per BR-DE-15)', () => {
    const data = makeBase({
      invoiceNumber: 'TEST-EDGE-NOREF',
      buyerReference: undefined,
    });
    const result = validator.validateInvoiceDataSafe(data);
    // BR-DE-15 should be a warning, not an error
    const brDe15Errors = result.errors.filter((e) => e.ruleId === 'BR-DE-15');
    expect(brDe15Errors).toHaveLength(0);
    // Warning emitted only when both buyerReference AND invoiceNumber are missing
    // Since invoiceNumber is present, no warning expected
    const brDe15Warnings = result.warnings.filter((w) => w.ruleId === 'BR-DE-15');
    expect(brDe15Warnings).toHaveLength(0);
  });

  it('Missing seller contact should fail BR-DE-2', () => {
    const data = makeBase({
      invoiceNumber: 'TEST-EDGE-NOCONTACT',
      sellerContactName: undefined,
      sellerContact: undefined,
      sellerPhone: undefined,
    });
    const result = validator.validateInvoiceDataSafe(data);
    const brDe2 = result.errors.filter((e) => e.ruleId === 'BR-DE-2');
    expect(brDe2.length).toBeGreaterThanOrEqual(1);
    expect(brDe2[0]!.message).toContain('phone');
  });

  it('Monetary mismatch should fail BR-CO-15', () => {
    const data = makeBase({
      invoiceNumber: 'TEST-EDGE-MISMATCH',
      subtotal: 100,
      taxAmount: 19,
      totalAmount: 200, // Wrong: should be 119
    });
    const result = validator.validateInvoiceDataSafe(data);
    const brCo15 = result.errors.filter((e) => e.ruleId === 'BR-CO-15');
    expect(brCo15.length).toBeGreaterThanOrEqual(1);
  });
});
