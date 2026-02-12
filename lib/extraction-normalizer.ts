/**
 * Shared extraction normalization logic.
 * Used by all AI adapters (DeepSeek, Gemini batch adapter, Gemini single-file service)
 * to ensure consistent data normalization from raw AI responses.
 *
 * SINGLE SOURCE OF TRUTH for: tax rate normalization, IBAN normalization,
 * field defaults, and line item mapping.
 */

import type { ExtractedInvoiceData, TaxCategoryCode } from '@/types';
import { logger } from '@/lib/logger';

/**
 * Parse a monetary/numeric string that may use European locale formatting.
 * Handles: '5.508,99' → 5508.99, '1234.56' → 1234.56, '1,234.56' → 1234.56.
 * Returns NaN if the value is not a valid number (never silently returns 0).
 */
export function safeNumberStrict(value: unknown): number {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number') return value;
  const s = String(value).trim();
  if (!s) return NaN;

  // Detect European format: digits with dots as thousands separators and comma as decimal
  // Pattern: optional minus, digits, optional dot-groups, comma, decimal digits
  // e.g. "5.508,99" or "1.234.567,89"
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+(,\d+)$/.test(s)) {
    // European: dots are thousands separators, comma is decimal
    const normalized = s.replace(/\./g, '').replace(',', '.');
    return Number(normalized);
  }

  // Standard: just use Number()
  const n = Number(s);
  return n;
}

/**
 * Normalize IBAN: remove whitespace, uppercase, validate basic structure.
 */
export function normalizeIban(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, '').toUpperCase();
  if (!text) return null;
  if (text.length >= 15 && text.length <= 34 && /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(text)) {
    return text;
  }
  logger.warn('Invalid IBAN format detected', { iban: text.substring(0, 4) + '...' });
  return text;
}

/**
 * Normalize a tax rate value:
 * - Converts decimal (0.19) to percentage (19)
 * - Rejects unrealistic rates (> 30%)
 * Returns NaN if the rate is invalid/absent.
 */
export function normalizeTaxRate(rawRate: unknown): number {
  if (rawRate === null || rawRate === undefined || rawRate === '') return NaN;
  let rate = Number(rawRate);
  if (isNaN(rate)) return NaN;
  if (rate > 0 && rate < 1) {
    rate = Math.round(rate * 10000) / 100;
  }
  if (rate > 30) return NaN;
  return rate;
}

/**
 * Parse JSON from an AI response, handling code blocks, raw JSON, and
 * balanced-brace extraction.
 */
export function parseJsonFromAiResponse(content: string): unknown {
  const cleanContent = content.trim();

  // Try direct parse
  try {
    return JSON.parse(cleanContent);
  } catch {
    /* continue */
  }

  // Try stripping ```json code blocks
  const codeBlockMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      /* continue */
    }
  }

  // Balanced brace extraction
  const firstBrace = cleanContent.indexOf('{');
  if (firstBrace !== -1) {
    let depth = 0;
    let lastBrace = -1;
    for (let i = firstBrace; i < cleanContent.length; i++) {
      if (cleanContent[i] === '{') depth++;
      if (cleanContent[i] === '}') depth--;
      if (depth === 0) {
        lastBrace = i;
        break;
      }
    }
    if (lastBrace !== -1) {
      return JSON.parse(cleanContent.substring(firstBrace, lastBrace + 1));
    }
  }

  throw new Error('No valid JSON found in AI response');
}

const VALID_TAX_CATEGORY_CODES: ReadonlySet<string> = new Set([
  'S',
  'Z',
  'E',
  'AE',
  'K',
  'G',
  'O',
  'L',
]);

/**
 * Normalize a tax category code from AI output.
 * Returns a valid UNCL5305 code or undefined if not recognized.
 */
export function normalizeTaxCategoryCode(
  raw: unknown,
  taxRate?: number
): TaxCategoryCode | undefined {
  if (raw !== null && raw !== undefined && raw !== '') {
    const code = String(raw).trim().toUpperCase();
    if (VALID_TAX_CATEGORY_CODES.has(code)) {
      return code as TaxCategoryCode;
    }
  }
  // Derive from rate when no explicit code is given
  if (taxRate !== undefined && !isNaN(taxRate)) {
    return taxRate > 0 ? 'S' : 'E';
  }
  return undefined;
}

/**
 * Detect whether a tax ID looks like an EU VAT ID (starts with 2-letter country code + digits).
 */
export function isEuVatId(taxId: string | null | undefined): boolean {
  if (!taxId) return false;
  // EU VAT IDs: 2-letter country code followed by alphanumeric characters (e.g. DE123456789, ATU12345678)
  return /^[A-Z]{2}[A-Z0-9]/.test(taxId.trim().toUpperCase());
}

/**
 * Normalize raw AI-extracted data into a standardized ExtractedInvoiceData object.
 */
export function normalizeExtractedData(data: Record<string, unknown>): ExtractedInvoiceData {
  const rawSubtotal = safeNumberStrict(data.subtotal);
  const subtotal = isNaN(rawSubtotal) ? 0 : rawSubtotal;

  const rawTotal = safeNumberStrict(data.totalAmount);
  if (isNaN(rawTotal)) {
    logger.warn('totalAmount is not a valid number, defaulting to 0', { raw: data.totalAmount });
  }
  const totalAmount = isNaN(rawTotal) ? 0 : rawTotal;

  // Tax amount
  const rawTaxAmount = safeNumberStrict(data.taxAmount);
  const hasTaxAmount =
    data.taxAmount !== null && data.taxAmount !== undefined && data.taxAmount !== '';
  const taxAmount =
    hasTaxAmount && !isNaN(rawTaxAmount) && !(rawTaxAmount === 0 && totalAmount > subtotal + 0.01)
      ? rawTaxAmount
      : totalAmount > subtotal
        ? Math.round((totalAmount - subtotal) * 100) / 100
        : 0;

  // Tax rate — only use what AI explicitly provided (T3: no implicit derivation)
  const parsedTaxRate = normalizeTaxRate(data.taxRate);

  // Line items (support both "lineItems" and legacy "items" key)
  const rawItems = Array.isArray(data.lineItems)
    ? data.lineItems
    : Array.isArray(data.items)
      ? data.items
      : [];

  return {
    invoiceNumber: (data.invoiceNumber as string) || null,
    invoiceDate: (data.invoiceDate as string) || null,
    buyerName: (data.buyerName as string) || null,
    buyerEmail: (data.buyerEmail as string) || null,
    buyerAddress: (data.buyerAddress as string) || null,
    buyerCity: (data.buyerCity as string) || null,
    buyerPostalCode: data.buyerPostalCode != null ? String(data.buyerPostalCode) : null,
    buyerCountryCode: (data.buyerCountryCode as string) || null,
    buyerTaxId: (data.buyerTaxId as string) || null,
    buyerPhone: (data.buyerPhone as string) || null,
    sellerName: (data.sellerName as string) || null,
    sellerEmail: (data.sellerEmail as string) || null,
    sellerAddress: (data.sellerAddress as string) || null,
    sellerCity: (data.sellerCity as string) || null,
    sellerPostalCode: data.sellerPostalCode != null ? String(data.sellerPostalCode) : null,
    sellerCountryCode: (data.sellerCountryCode as string) || null,
    sellerTaxId: (data.sellerTaxId as string) || null,
    sellerIban: normalizeIban(data.sellerIban),
    sellerBic: (data.sellerBic as string) || null,
    sellerPhone: (data.sellerPhone as string) || null,
    bankName: (data.bankName as string) || null,
    lineItems: rawItems.map((item: Record<string, unknown>) => {
      // T3: Use only the per-item rate from AI; do NOT fallback to invoice-level rate
      const itemTaxRate = normalizeTaxRate(item?.taxRate);
      const resolvedRate = !isNaN(itemTaxRate) ? itemTaxRate : undefined;
      const qty = safeNumberStrict(item?.quantity);
      const up = safeNumberStrict(item?.unitPrice);
      const tp = safeNumberStrict(item?.totalPrice);
      return {
        description: (item?.description as string) || '',
        quantity: isNaN(qty) ? 1 : qty,
        unitPrice: isNaN(up) ? 0 : up,
        totalPrice: isNaN(tp) ? 0 : tp,
        taxRate: resolvedRate,
        taxCategoryCode: normalizeTaxCategoryCode(item?.taxCategoryCode, resolvedRate),
      };
    }),
    subtotal,
    taxRate: !isNaN(parsedTaxRate) ? parsedTaxRate : undefined,
    taxAmount,
    totalAmount,
    currency: (data.currency as string) || 'EUR',
    paymentTerms: (data.paymentTerms as string) || null,
    notes: (data.notes as string) || null,
    confidence: Number(data.confidence) || 0.7,
    // EN 16931 new fields (additive, all optional)
    ...normalizeVatIds(data),
    ...normalizeElectronicAddresses(data),
    documentTypeCode: normalizeDocumentTypeCode(data.documentTypeCode),
    buyerReference: (data.buyerReference as string) || null,
  };
}

/**
 * Normalize seller/buyer VAT IDs and tax numbers.
 * Derives sellerVatId/sellerTaxNumber from sellerTaxId when AI doesn't provide them separately.
 */
function normalizeVatIds(data: Record<string, unknown>) {
  const sellerTaxId = (data.sellerTaxId as string) || null;
  let sellerVatId = (data.sellerVatId as string) || null;
  let sellerTaxNumber = (data.sellerTaxNumber as string) || null;

  // Auto-derive from sellerTaxId if AI didn't split them
  if (!sellerVatId && !sellerTaxNumber && sellerTaxId) {
    if (isEuVatId(sellerTaxId)) {
      sellerVatId = sellerTaxId;
    } else {
      sellerTaxNumber = sellerTaxId;
    }
  }

  const buyerTaxId = (data.buyerTaxId as string) || null;
  let buyerVatId = (data.buyerVatId as string) || null;
  if (!buyerVatId && buyerTaxId && isEuVatId(buyerTaxId)) {
    buyerVatId = buyerTaxId;
  }

  return { sellerVatId, sellerTaxNumber, buyerVatId };
}

/**
 * Derive buyer/seller electronic addresses (BT-49, BT-34) from email when not explicitly set.
 * Preserves explicit electronicAddress; falls back to email with scheme 'EM'.
 */
function normalizeElectronicAddresses(data: Record<string, unknown>) {
  const buyerEmail = (data.buyerEmail as string) || null;
  const buyerEAddr = (data.buyerElectronicAddress as string)?.trim() || buyerEmail;
  const sellerEmail = (data.sellerEmail as string) || null;
  const sellerEAddr = (data.sellerElectronicAddress as string)?.trim() || sellerEmail;

  return {
    buyerElectronicAddress: buyerEAddr || null,
    buyerElectronicAddressScheme: buyerEAddr
      ? (data.buyerElectronicAddressScheme as string) || 'EM'
      : null,
    sellerElectronicAddress: sellerEAddr || null,
    sellerElectronicAddressScheme: sellerEAddr
      ? (data.sellerElectronicAddressScheme as string) || 'EM'
      : null,
  };
}

/**
 * Normalize document type code to a valid EN 16931 value.
 */
function normalizeDocumentTypeCode(raw: unknown): 380 | 381 | 384 | 389 | undefined {
  if (raw === null || raw === undefined) return undefined;
  const code = Number(raw);
  if ([380, 381, 384, 389].includes(code)) return code as 380 | 381 | 384 | 389;
  return undefined;
}
