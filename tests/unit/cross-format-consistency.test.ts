/**
 * Cross-Format Consistency Tests — S5-T4
 * Same CanonicalInvoice → generate in ALL XML formats → parse back key values → verify identical business data.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';

const ALL_FORMATS: OutputFormat[] = [
  'xrechnung-cii',
  'xrechnung-ubl',
  'peppol-bis',
  'facturx-en16931',
  'facturx-basic',
  'fatturapa',
  'ksef',
  'nlcius',
  'cius-ro',
];

function makeConsistencyInvoice(outputFormat: OutputFormat): CanonicalInvoice {
  return {
    outputFormat,
    invoiceNumber: 'CONSIST-2024-007',
    invoiceDate: '2024-09-01',
    currency: 'EUR',
    documentTypeCode: 380,
    buyerReference: '04011000-12345-03',
    notes: null,
    precedingInvoiceReference: null,
    billingPeriodStart: null,
    billingPeriodEnd: null,
    seller: {
      name: 'Consistency Seller GmbH',
      email: 'seller@consist.de',
      address: 'Testweg 1',
      city: 'Berlin',
      postalCode: '10115',
      countryCode: 'DE',
      vatId: 'DE123456789',
      taxNumber: '30/123/45678',
      contactName: 'Test Contact',
      phone: '+49 30 1111111',
      electronicAddress: '0204:consist-seller',
      electronicAddressScheme: '0204',
    },
    buyer: {
      name: 'Consistency Buyer NV',
      email: 'buyer@consist.nl',
      address: 'Buyerlaan 10',
      city: 'Rotterdam',
      postalCode: '3011 AA',
      countryCode: 'NL',
      vatId: 'NL987654321B01',
      electronicAddress: '0190:00000000000000000002',
      electronicAddressScheme: '0190',
    },
    payment: {
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      paymentTerms: 'Net 30',
      dueDate: '2024-10-01',
    },
    lineItems: [
      {
        description: 'Service A',
        quantity: 5,
        unitPrice: 200,
        totalPrice: 1000,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'HUR',
      },
      {
        description: 'Product B',
        quantity: 10,
        unitPrice: 50,
        totalPrice: 500,
        taxRate: 19,
        taxCategoryCode: 'S',
        unitCode: 'C62',
      },
    ],
    totals: {
      subtotal: 1500,
      taxAmount: 285,
      totalAmount: 1785,
    },
    taxRate: 19,
  };
}

// ─── Simple XML extractors ──────────────────────────────────────────────────

function extractTag(xml: string, tagPattern: RegExp): string | null {
  const m = xml.match(tagPattern);
  return m?.[1]?.trim() ?? null;
}

function extractInvoiceNumber(xml: string, _formatId: OutputFormat): string | null {
  // CII-based (xrechnung-cii, facturx)
  if (xml.includes('CrossIndustryInvoice') || xml.includes('rsm:')) {
    const m = xml.match(/<rsm:ExchangedDocument>[\s\S]*?<ram:ID>([^<]+)<\/ram:ID>/);
    return m?.[1]?.trim() ?? null;
  }
  // UBL-based (xrechnung-ubl, peppol-bis, nlcius, cius-ro)
  if (xml.includes('<cbc:ID>')) {
    return extractTag(xml, /<cbc:ID>([^<]+)<\/cbc:ID>/);
  }
  // FatturaPA
  if (xml.includes('FatturaElettronica')) {
    return extractTag(xml, /<Numero>([^<]+)<\/Numero>/);
  }
  // KSeF
  if (xml.includes('Faktura')) {
    return (
      extractTag(xml, /<NrFaktury>([^<]+)<\/NrFaktury>/) || extractTag(xml, /<P_2>([^<]+)<\/P_2>/)
    );
  }
  return null;
}

function extractSellerName(xml: string, _formatId: OutputFormat): string | null {
  // CII
  if (xml.includes('CrossIndustryInvoice') || xml.includes('rsm:')) {
    const m = xml.match(/<ram:SellerTradeParty>[\s\S]*?<ram:Name>([^<]+)<\/ram:Name>/);
    return m ? m[1]!.trim() : null;
  }
  // UBL
  if (xml.includes('AccountingSupplierParty')) {
    const m = xml.match(
      /<cac:AccountingSupplierParty>[\s\S]*?<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/
    );
    if (m) return m[1]!.trim();
    const m2 = xml.match(/<cac:AccountingSupplierParty>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/);
    return m2 ? m2[1]!.trim() : null;
  }
  // FatturaPA
  if (xml.includes('FatturaElettronica')) {
    return extractTag(xml, /<Denominazione>([^<]+)<\/Denominazione>/);
  }
  // KSeF — FA(3) uses DaneIdentyfikacyjne > Nazwa (no NazwaHandlowa)
  return (
    extractTag(xml, /<NazwaHandlowa>([^<]+)<\/NazwaHandlowa>/) ||
    extractTag(xml, /<PelnaNazwa>([^<]+)<\/PelnaNazwa>/) ||
    extractTag(xml, /<Podmiot1>[\s\S]*?<Nazwa>([^<]+)<\/Nazwa>/)
  );
}

function extractBuyerName(xml: string, _formatId: OutputFormat): string | null {
  // CII
  if (xml.includes('CrossIndustryInvoice') || xml.includes('rsm:')) {
    const m = xml.match(/<ram:BuyerTradeParty>[\s\S]*?<ram:Name>([^<]+)<\/ram:Name>/);
    return m ? m[1]!.trim() : null;
  }
  // UBL
  if (xml.includes('AccountingCustomerParty')) {
    const m = xml.match(
      /<cac:AccountingCustomerParty>[\s\S]*?<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/
    );
    if (m) return m[1]!.trim();
    const m2 = xml.match(/<cac:AccountingCustomerParty>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/);
    return m2 ? m2[1]!.trim() : null;
  }
  // FatturaPA
  if (xml.includes('CessionarioCommittente')) {
    const m = xml.match(/<CessionarioCommittente>[\s\S]*?<Denominazione>([^<]+)<\/Denominazione>/);
    return m ? m[1]!.trim() : null;
  }
  // KSeF
  const ksefBuyer = xml.match(/<Podmiot2>[\s\S]*?<Nazwa>([^<]+)<\/Nazwa>/);
  return ksefBuyer?.[1]?.trim() ?? null;
}

function extractCurrency(xml: string, _formatId: OutputFormat): string | null {
  // CII
  if (xml.includes('CrossIndustryInvoice') || xml.includes('rsm:')) {
    return extractTag(xml, /currencyID="([^"]+)"/);
  }
  // UBL
  if (xml.includes('cbc:DocumentCurrencyCode')) {
    return extractTag(xml, /<cbc:DocumentCurrencyCode>([^<]+)<\/cbc:DocumentCurrencyCode>/);
  }
  // FatturaPA
  if (xml.includes('Divisa')) {
    return extractTag(xml, /<Divisa>([^<]+)<\/Divisa>/);
  }
  // KSeF
  return extractTag(xml, /<KodWaluty>([^<]+)<\/KodWaluty>/);
}

function extractTotalAmount(xml: string, _formatId: OutputFormat): number | null {
  let val: string | null = null;
  // CII
  if (xml.includes('CrossIndustryInvoice') || xml.includes('rsm:')) {
    val =
      extractTag(xml, /<ram:DuePayableAmount>([^<]+)<\/ram:DuePayableAmount>/) ||
      extractTag(xml, /<ram:GrandTotalAmount>([^<]+)<\/ram:GrandTotalAmount>/);
  }
  // UBL
  else if (xml.includes('cbc:PayableAmount') || xml.includes('cbc:TaxInclusiveAmount')) {
    val =
      extractTag(xml, /<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/) ||
      extractTag(xml, /<cbc:TaxInclusiveAmount[^>]*>([^<]+)<\/cbc:TaxInclusiveAmount>/);
  }
  // FatturaPA
  else if (xml.includes('ImportoTotaleDocumento')) {
    val = extractTag(xml, /<ImportoTotaleDocumento>([^<]+)<\/ImportoTotaleDocumento>/);
  }
  // KSeF
  else {
    val = extractTag(xml, /<P_15>([^<]+)<\/P_15>/);
  }
  return val ? parseFloat(val) : null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Cross-Format Consistency', () => {
  const results: Map<OutputFormat, { xml: string }> = new Map();

  beforeAll(async () => {
    GeneratorFactory.clear();
    for (const fmt of ALL_FORMATS) {
      const gen = GeneratorFactory.create(fmt);
      const result = await gen.generate(makeConsistencyInvoice(fmt));
      results.set(fmt, { xml: result.xmlContent });
    }
  });

  it('all formats generate successfully', () => {
    expect(results.size).toBe(ALL_FORMATS.length);
    for (const [, r] of results) {
      expect(r.xml.length).toBeGreaterThan(0);
    }
  });

  describe('invoice number consistency', () => {
    it.each(ALL_FORMATS)('%s contains correct invoice number', (fmt: OutputFormat) => {
      const xml = results.get(fmt)!.xml;
      const num = extractInvoiceNumber(xml, fmt);
      expect(num).toContain('CONSIST-2024-007');
    });
  });

  describe('seller name consistency', () => {
    it.each(ALL_FORMATS)('%s contains correct seller name', (fmt: OutputFormat) => {
      const xml = results.get(fmt)!.xml;
      const name = extractSellerName(xml, fmt);
      expect(name).toContain('Consistency Seller');
    });
  });

  describe('buyer name consistency', () => {
    it.each(ALL_FORMATS)('%s contains correct buyer name', (fmt: OutputFormat) => {
      const xml = results.get(fmt)!.xml;
      const name = extractBuyerName(xml, fmt);
      expect(name).toContain('Consistency Buyer');
    });
  });

  describe('currency consistency', () => {
    it.each(ALL_FORMATS)('%s has EUR currency', (fmt: OutputFormat) => {
      const xml = results.get(fmt)!.xml;
      const cur = extractCurrency(xml, fmt);
      expect(cur).toBe('EUR');
    });
  });

  describe('total amount consistency', () => {
    it.each(ALL_FORMATS)('%s has correct total amount', (fmt: OutputFormat) => {
      const xml = results.get(fmt)!.xml;
      const total = extractTotalAmount(xml, fmt);
      expect(total).toBeCloseTo(1785, 0);
    });
  });

  describe('line item count in XML', () => {
    it.each(ALL_FORMATS)('%s has 2 line items in XML', (fmt: OutputFormat) => {
      const xml = results.get(fmt)!.xml;
      // Count line item markers based on format
      let count: number;
      if (xml.includes('CrossIndustryInvoice') || xml.includes('rsm:')) {
        count = (xml.match(/<ram:IncludedSupplyChainTradeLineItem>/g) || []).length;
      } else if (xml.includes('cac:InvoiceLine') || xml.includes('cac:CreditNoteLine')) {
        count =
          (xml.match(/<cac:InvoiceLine>/g) || []).length +
          (xml.match(/<cac:CreditNoteLine>/g) || []).length;
      } else if (xml.includes('DettaglioLinee')) {
        count = (xml.match(/<DettaglioLinee>/g) || []).length;
      } else {
        // KSeF or other — count line item patterns
        count = (xml.match(/<FakturaWiersz>/g) || []).length || (xml.match(/<P_7>/g) || []).length;
      }
      expect(count).toBe(2);
    });
  });

  it('Factur-X formats embed XML in PDF', async () => {
    for (const fmt of ['facturx-en16931', 'facturx-basic'] as OutputFormat[]) {
      const gen = GeneratorFactory.create(fmt);
      const result = await gen.generate(makeConsistencyInvoice(fmt));
      expect(result.pdfContent).toBeInstanceOf(Buffer);
      // The XML should also be available separately
      expect(result.xmlContent.length).toBeGreaterThan(100);
    }
  });
});
