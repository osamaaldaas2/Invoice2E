/**
 * Round-Trip Validation Tests — S5-T3
 * Generate XML → parse back key fields → compare to input CanonicalInvoice.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';

// Formats that produce parseable XML (not PDF-primary)
const ROUNDTRIP_FORMATS: OutputFormat[] = [
  'xrechnung-cii', 'xrechnung-ubl', 'peppol-bis', 'fatturapa', 'ksef',
];

function makeRoundtripInvoice(outputFormat: OutputFormat): CanonicalInvoice {
  return {
    outputFormat,
    invoiceNumber: 'RT-2024-042',
    invoiceDate: '2024-11-15',
    currency: 'EUR',
    documentTypeCode: 380,
    buyerReference: '04011000-12345-03',
    notes: null,
    precedingInvoiceReference: null,
    billingPeriodStart: null,
    billingPeriodEnd: null,
    seller: {
      name: 'Roundtrip Seller GmbH',
      email: 'rt@seller.de',
      address: 'Roundtripstr. 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
      vatId: 'DE123456789',
      taxNumber: '30/123/45678',
      contactName: 'RT Contact',
      phone: '+49 30 7777777',
      electronicAddress: '0204:rt-seller',
      electronicAddressScheme: '0204',
    },
    buyer: {
      name: 'Roundtrip Buyer B.V.',
      email: 'rt@buyer.nl',
      address: 'RTweg 99',
      city: 'Amsterdam',
      postalCode: '1015 AA',
      countryCode: 'NL',
      vatId: 'NL987654321B01',
      electronicAddress: '0190:00000000000000000003',
      electronicAddressScheme: '0190',
    },
    payment: {
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      paymentTerms: 'Net 30',
      dueDate: '2024-12-15',
    },
    lineItems: [
      {
        description: 'RT Service',
        quantity: 8,
        unitPrice: 125,
        totalPrice: 1000,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'HUR',
      },
    ],
    totals: {
      subtotal: 1000,
      taxAmount: 190,
      totalAmount: 1190,
    },
    taxRate: 19,
  };
}

// ─── XML extraction helpers ──────────────────────────────────────────────────

function tag(xml: string, pattern: RegExp): string | null {
  const m = xml.match(pattern);
  return m?.[1]?.trim() ?? null;
}

interface ExtractedFields {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string | null;
  totalAmount: number | null;
  taxAmount: number | null;
  sellerName: string | null;
  buyerName: string | null;
}

function extractCII(xml: string): ExtractedFields {
  // Invoice number — <ram:ID> inside <rsm:ExchangedDocument> (not ExchangedDocumentContext)
  const docSection = xml.match(/<rsm:ExchangedDocument>([\s\S]*?)<\/rsm:ExchangedDocument>/);
  const invoiceNumber = docSection ? tag(docSection[1]!, /<ram:ID>([^<]+)<\/ram:ID>/) : null;

  // Date
  const invoiceDate = tag(xml, /<ram:IssueDateTime>[\s\S]*?<udt:DateTimeString[^>]*>(\d{8})<\/udt:DateTimeString>/);

  // Currency
  const currency = tag(xml, /currencyID="([^"]+)"/);

  // Totals
  const totalAmount = tag(xml, /<ram:DuePayableAmount>([^<]+)<\/ram:DuePayableAmount>/)
    || tag(xml, /<ram:GrandTotalAmount>([^<]+)<\/ram:GrandTotalAmount>/);
  const taxAmount = tag(xml, /<ram:TaxTotalAmount[^>]*>([^<]+)<\/ram:TaxTotalAmount>/);

  // Seller / Buyer
  const sellerSection = xml.match(/<ram:SellerTradeParty>([\s\S]*?)<\/ram:SellerTradeParty>/);
  const sellerName = sellerSection ? tag(sellerSection[1]!, /<ram:Name>([^<]+)<\/ram:Name>/) : null;

  const buyerSection = xml.match(/<ram:BuyerTradeParty>([\s\S]*?)<\/ram:BuyerTradeParty>/);
  const buyerName = buyerSection ? tag(buyerSection[1]!, /<ram:Name>([^<]+)<\/ram:Name>/) : null;

  return {
    invoiceNumber,
    invoiceDate: invoiceDate ? `${invoiceDate.slice(0, 4)}-${invoiceDate.slice(4, 6)}-${invoiceDate.slice(6, 8)}` : null,
    currency,
    totalAmount: totalAmount ? parseFloat(totalAmount) : null,
    taxAmount: taxAmount ? parseFloat(taxAmount) : null,
    sellerName,
    buyerName,
  };
}

function extractUBL(xml: string): ExtractedFields {
  const invoiceNumber = tag(xml, /<cbc:ID>([^<]+)<\/cbc:ID>/);
  const invoiceDate = tag(xml, /<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/);
  const currency = tag(xml, /<cbc:DocumentCurrencyCode>([^<]+)<\/cbc:DocumentCurrencyCode>/);

  const totalAmount = tag(xml, /<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/)
    || tag(xml, /<cbc:TaxInclusiveAmount[^>]*>([^<]+)<\/cbc:TaxInclusiveAmount>/);
  const taxAmount = tag(xml, /<cbc:TaxAmount[^>]*>([^<]+)<\/cbc:TaxAmount>/);

  const supplierSection = xml.match(/<cac:AccountingSupplierParty>([\s\S]*?)<\/cac:AccountingSupplierParty>/);
  const sellerName = supplierSection
    ? (tag(supplierSection[1]!, /<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/)
      || tag(supplierSection[1]!, /<cbc:Name>([^<]+)<\/cbc:Name>/))
    : null;

  const customerSection = xml.match(/<cac:AccountingCustomerParty>([\s\S]*?)<\/cac:AccountingCustomerParty>/);
  const buyerName = customerSection
    ? (tag(customerSection[1]!, /<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/)
      || tag(customerSection[1]!, /<cbc:Name>([^<]+)<\/cbc:Name>/))
    : null;

  return {
    invoiceNumber,
    invoiceDate,
    currency,
    totalAmount: totalAmount ? parseFloat(totalAmount) : null,
    taxAmount: taxAmount ? parseFloat(taxAmount) : null,
    sellerName,
    buyerName,
  };
}

function extractFatturaPA(xml: string): ExtractedFields {
  const invoiceNumber = tag(xml, /<Numero>([^<]+)<\/Numero>/);
  const invoiceDate = tag(xml, /<Data>([^<]+)<\/Data>/);
  const currency = tag(xml, /<Divisa>([^<]+)<\/Divisa>/);
  const totalAmount = tag(xml, /<ImportoTotaleDocumento>([^<]+)<\/ImportoTotaleDocumento>/);

  // Tax amount — sum from DatiRiepilogo
  const taxMatches = xml.matchAll(/<Imposta>([^<]+)<\/Imposta>/g);
  let taxSum = 0;
  for (const m of taxMatches) taxSum += parseFloat(m[1] ?? '0');

  // Seller (CedentePrestatore)
  const sellerSection = xml.match(/<CedentePrestatore>([\s\S]*?)<\/CedentePrestatore>/);
  const sellerName = sellerSection ? tag(sellerSection[1]!, /<Denominazione>([^<]+)<\/Denominazione>/) : null;

  // Buyer (CessionarioCommittente)
  const buyerSection = xml.match(/<CessionarioCommittente>([\s\S]*?)<\/CessionarioCommittente>/);
  const buyerName = buyerSection ? tag(buyerSection[1]!, /<Denominazione>([^<]+)<\/Denominazione>/) : null;

  return {
    invoiceNumber,
    invoiceDate,
    currency,
    totalAmount: totalAmount ? parseFloat(totalAmount) : null,
    taxAmount: taxSum || null,
    sellerName,
    buyerName,
  };
}

function extractKSeF(xml: string): ExtractedFields {
  const invoiceNumber = tag(xml, /<NrFaktury>([^<]+)<\/NrFaktury>/)
    || tag(xml, /<P_2>([^<]+)<\/P_2>/);
  const invoiceDate = tag(xml, /<P_1>([^<]+)<\/P_1>/);
  const currency = tag(xml, /<KodWaluty>([^<]+)<\/KodWaluty>/);
  const totalAmount = tag(xml, /<P_15>([^<]+)<\/P_15>/);
  // KSeF tax: total - net (P_15 - sum of P_11)
  // Or look for tax-specific tags
  const taxAmount = tag(xml, /<P_14_1>([^<]+)<\/P_14_1>/)
    || (() => {
      const total = tag(xml, /<P_15>([^<]+)<\/P_15>/);
      const lineNets = [...xml.matchAll(/<P_11>([^<]+)<\/P_11>/g)];
      if (total && lineNets.length > 0) {
        const netSum = lineNets.reduce((s, m) => s + parseFloat(m[1] ?? '0'), 0);
        return String(parseFloat(total) - netSum);
      }
      return null;
    })();

  const sellerName = tag(xml, /<NazwaHandlowa>([^<]+)<\/NazwaHandlowa>/)
    || tag(xml, /<Podmiot1>[\s\S]*?<Nazwa>([^<]+)<\/Nazwa>/);

  // Buyer — Podmiot2
  const buyerSection = xml.match(/<Podmiot2>([\s\S]*?)<\/Podmiot2>/);
  const buyerName = buyerSection
    ? tag(buyerSection[1]!, /<Nazwa>([^<]+)<\/Nazwa>/)
    : null;

  return {
    invoiceNumber,
    invoiceDate,
    currency,
    totalAmount: totalAmount ? parseFloat(totalAmount) : null,
    taxAmount: taxAmount ? parseFloat(taxAmount) : null,
    sellerName,
    buyerName,
  };
}

function extractFields(xml: string, formatId: OutputFormat): ExtractedFields {
  if (formatId === 'xrechnung-cii') return extractCII(xml);
  if (formatId === 'xrechnung-ubl' || formatId === 'peppol-bis') return extractUBL(xml);
  if (formatId === 'fatturapa') return extractFatturaPA(xml);
  if (formatId === 'ksef') return extractKSeF(xml);
  throw new Error(`No extractor for ${formatId}`);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Round-Trip Validation', () => {
  beforeAll(() => {
    GeneratorFactory.clear();
  });

  describe.each(ROUNDTRIP_FORMATS)('format: %s', (formatId: OutputFormat) => {
    let fields: ExtractedFields;

    beforeAll(async () => {
      const gen = GeneratorFactory.create(formatId);
      const invoice = makeRoundtripInvoice(formatId);
      const result = await gen.generate(invoice);
      fields = extractFields(result.xmlContent, formatId);
    });

    it('invoice number round-trips', () => {
      expect(fields.invoiceNumber).toContain('RT-2024-042');
    });

    it('invoice date round-trips', () => {
      expect(fields.invoiceDate).toBe('2024-11-15');
    });

    it('currency round-trips', () => {
      expect(fields.currency).toBe('EUR');
    });

    it('total amount round-trips', () => {
      expect(fields.totalAmount).toBeCloseTo(1190, 0);
    });

    it('tax amount round-trips', () => {
      expect(fields.taxAmount).toBeCloseTo(190, 0);
    });

    it('seller name round-trips', () => {
      expect(fields.sellerName).toContain('Roundtrip Seller');
    });

    it('buyer name round-trips', () => {
      expect(fields.buyerName).toContain('Roundtrip Buyer');
    });
  });
});
