import { describe, it, expect } from 'vitest';
import { parseJsonFromAiResponse, normalizeExtractedData } from '@/lib/extraction-normalizer';

/**
 * T1: Prompt contract alignment tests.
 * Verify parseJsonFromAiResponse handles all known AI output formats and
 * that normalizeExtractedData correctly maps the updated EXTRACTION_PROMPT fields.
 */

describe('parseJsonFromAiResponse — format variants', () => {
  const sampleJson = { invoiceNumber: 'INV-001', totalAmount: 119 };
  const sampleStr = JSON.stringify(sampleJson);

  it('parses raw JSON (direct)', () => {
    const result = parseJsonFromAiResponse(sampleStr);
    expect(result).toEqual(sampleJson);
  });

  it('parses ```json fenced code block', () => {
    const wrapped = '```json\n' + sampleStr + '\n```';
    const result = parseJsonFromAiResponse(wrapped);
    expect(result).toEqual(sampleJson);
  });

  it('parses ``` fenced code block without json label', () => {
    const wrapped = '```\n' + sampleStr + '\n```';
    const result = parseJsonFromAiResponse(wrapped);
    expect(result).toEqual(sampleJson);
  });

  it('parses embedded JSON with extra text (balanced brace extraction)', () => {
    const wrapped = 'Here is the extracted data:\n' + sampleStr + '\n\nI hope this helps!';
    const result = parseJsonFromAiResponse(wrapped);
    expect(result).toEqual(sampleJson);
  });

  it('throws on invalid / no JSON', () => {
    expect(() => parseJsonFromAiResponse('no json here')).toThrow('No valid JSON found');
  });

  it('throws on empty string', () => {
    expect(() => parseJsonFromAiResponse('')).toThrow();
  });

  it('handles JSON with leading/trailing whitespace', () => {
    const result = parseJsonFromAiResponse('   \n' + sampleStr + '\n   ');
    expect(result).toEqual(sampleJson);
  });
});

describe('normalizeExtractedData — full prompt contract', () => {
  /**
   * Representative AI response matching the updated EXTRACTION_PROMPT.
   * Includes all new EN 16931 fields (electronic addresses, VAT IDs, etc.)
   */
  const representativeAiResponse: Record<string, unknown> = {
    invoiceNumber: 'RE-2024-0042',
    invoiceDate: '2024-06-15',
    documentTypeCode: 380,

    buyerName: 'Käufer GmbH',
    buyerAddress: 'Hauptstr. 10',
    buyerCity: 'Berlin',
    buyerPostalCode: '10115',
    buyerCountryCode: 'DE',
    buyerTaxId: 'DE111222333',
    buyerVatId: 'DE111222333',
    buyerPhone: '+49 30 12345',
    buyerReference: '04011000-12345-67',
    buyerEmail: 'buyer@example.de',
    buyerElectronicAddress: 'buyer@example.de',
    buyerElectronicAddressScheme: 'EM',

    sellerName: 'Verkäufer AG',
    sellerAddress: 'Marktplatz 5',
    sellerCity: 'Munich',
    sellerPostalCode: '80331',
    sellerCountryCode: 'DE',
    sellerTaxId: 'DE999888777',
    sellerVatId: 'DE999888777',
    sellerTaxNumber: '143/123/12345',
    sellerPhone: '+49 89 54321',
    sellerEmail: 'seller@example.de',
    sellerElectronicAddress: 'seller@example.de',
    sellerElectronicAddressScheme: 'EM',

    sellerIban: 'DE89 3704 0044 0532 0130 00',
    sellerBic: 'COBADEFFXXX',
    bankName: 'Commerzbank',

    currency: 'EUR',
    paymentTerms: 'Net 30 days',
    notes: 'Thank you for your business',

    lineItems: [
      {
        description: 'Widget A',
        quantity: 2,
        unitPrice: 50,
        totalPrice: 100,
        taxRate: 19,
        taxCategoryCode: 'S',
      },
      {
        description: 'Service B',
        quantity: 1,
        unitPrice: 50,
        totalPrice: 50,
        taxRate: 7,
        taxCategoryCode: 'S',
      },
    ],

    subtotal: 150,
    taxAmount: 22.5,
    totalAmount: 172.5,
    confidence: 0.95,
  };

  it('maps all core prompt fields correctly', () => {
    const result = normalizeExtractedData(representativeAiResponse);

    expect(result.invoiceNumber).toBe('RE-2024-0042');
    expect(result.invoiceDate).toBe('2024-06-15');
    expect(result.documentTypeCode).toBe(380);

    expect(result.buyerName).toBe('Käufer GmbH');
    expect(result.buyerAddress).toBe('Hauptstr. 10');
    expect(result.buyerCity).toBe('Berlin');
    expect(result.buyerPostalCode).toBe('10115');
    expect(result.buyerCountryCode).toBe('DE');
    expect(result.buyerPhone).toBe('+49 30 12345');
    expect(result.buyerReference).toBe('04011000-12345-67');

    expect(result.sellerName).toBe('Verkäufer AG');
    expect(result.sellerAddress).toBe('Marktplatz 5');
    expect(result.sellerCity).toBe('Munich');
    expect(result.sellerPostalCode).toBe('80331');
    expect(result.sellerCountryCode).toBe('DE');
    expect(result.sellerPhone).toBe('+49 89 54321');

    expect(result.sellerIban).toBe('DE89370400440532013000'); // IBAN normalized
    expect(result.sellerBic).toBe('COBADEFFXXX');
    expect(result.bankName).toBe('Commerzbank');

    expect(result.currency).toBe('EUR');
    expect(result.paymentTerms).toBe('Net 30 days');
    expect(result.notes).toBe('Thank you for your business');
    expect(result.confidence).toBe(0.95);
  });

  it('maps electronic address fields (BT-49, BT-34) from prompt output', () => {
    const result = normalizeExtractedData(representativeAiResponse);

    expect(result.buyerElectronicAddress).toBe('buyer@example.de');
    expect(result.buyerElectronicAddressScheme).toBe('EM');
    expect(result.sellerElectronicAddress).toBe('seller@example.de');
    expect(result.sellerElectronicAddressScheme).toBe('EM');
  });

  it('maps VAT IDs (BT-31, BT-32, BT-48) from prompt output', () => {
    const result = normalizeExtractedData(representativeAiResponse);

    expect(result.sellerVatId).toBe('DE999888777');
    expect(result.sellerTaxNumber).toBe('143/123/12345');
    expect(result.buyerVatId).toBe('DE111222333');
  });

  it('maps line items with per-item tax rates and category codes', () => {
    const result = normalizeExtractedData(representativeAiResponse);

    expect(result.lineItems).toHaveLength(2);
    expect(result.lineItems[0]).toMatchObject({
      description: 'Widget A',
      quantity: 2,
      unitPrice: 50,
      totalPrice: 100,
      taxRate: 19,
      taxCategoryCode: 'S',
    });
    expect(result.lineItems[1]).toMatchObject({
      description: 'Service B',
      quantity: 1,
      unitPrice: 50,
      totalPrice: 50,
      taxRate: 7,
      taxCategoryCode: 'S',
    });
  });

  it('maps monetary totals from prompt output', () => {
    const result = normalizeExtractedData(representativeAiResponse);

    expect(result.subtotal).toBe(150);
    expect(result.taxAmount).toBe(22.5);
    expect(result.totalAmount).toBe(172.5);
  });
});
