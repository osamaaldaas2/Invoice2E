/**
 * Shared extraction normalization logic.
 * Used by all AI adapters (Gemini batch adapter, Gemini single-file service, OpenAI, Mistral)
 * to ensure consistent data normalization from raw AI responses.
 *
 * SINGLE SOURCE OF TRUTH for: tax rate normalization, IBAN normalization,
 * field defaults, and line item mapping.
 */

import type { ExtractedInvoiceData, TaxCategoryCode, AllowanceCharge } from '@/types';
import { logger } from '@/lib/logger';

/**
 * Try to parse city and postal code from a combined address string.
 * Handles common German/European formats:
 *   "Musterstraße 1, 12345 Berlin" → { postalCode: "12345", city: "Berlin" }
 *   "12345 Berlin" → { postalCode: "12345", city: "Berlin" }
 *   "D-12345 Berlin" → { postalCode: "12345", city: "Berlin" }
 */
function parseAddressComponents(address: string | null | undefined): {
  street: string | null;
  postalCode: string | null;
  city: string | null;
} {
  if (!address || !address.trim()) return { street: null, postalCode: null, city: null };

  const trimmed = address.trim();

  // Try to find a postal code (4-5 digits, optionally prefixed with country code like D-)
  // Pattern: optional "XX-" prefix, then 4-5 digits, then city name
  const postalCityMatch = trimmed.match(/(?:^|[,\n])\s*(?:[A-Z]{1,2}[- ]?)?(\d{4,5})\s+(.+?)$/m);
  if (postalCityMatch) {
    const postalCode = postalCityMatch[1]!;
    const city = postalCityMatch[2]!.replace(/[,.\s]+$/, '').trim();
    // Everything before the postal code match is the street
    const matchIndex = trimmed.indexOf(postalCityMatch[0]!);
    const beforePostal =
      matchIndex > 0
        ? trimmed
            .slice(0, matchIndex)
            .replace(/[,\s]+$/, '')
            .trim()
        : '';
    return {
      street: beforePostal || null,
      postalCode,
      city: city || null,
    };
  }

  return { street: trimmed, postalCode: null, city: null };
}

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

/** Expected IBAN lengths per country code (ISO 13616). */
const IBAN_LENGTHS: Record<string, number> = {
  DE: 22,
  AT: 20,
  CH: 21,
  FR: 27,
  IT: 27,
  ES: 24,
  NL: 18,
  BE: 16,
  LU: 20,
  PL: 28,
  GB: 22,
  SE: 24,
  DK: 18,
  NO: 15,
  FI: 18,
  PT: 25,
  IE: 22,
  CZ: 24,
  SK: 24,
  HU: 28,
  RO: 24,
  BG: 22,
  HR: 21,
  SI: 19,
  LT: 20,
  LV: 21,
  EE: 20,
  GR: 27,
  CY: 28,
  MT: 31,
  LI: 21,
};

/**
 * Validate IBAN checksum using ISO 7064 Mod 97-10.
 * Returns true if the IBAN has a valid check digit pair.
 */
export function validateIbanChecksum(iban: string): boolean {
  if (iban.length < 5 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  // Move first 4 chars to end, replace letters with numbers (A=10..Z=35)
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  // Compute mod 97 using successive chunks (number can be 50+ digits)
  let remainder = 0;
  for (let i = 0; i < digits.length; i++) {
    remainder = (remainder * 10 + Number(digits[i])) % 97;
  }
  return remainder === 1;
}

/**
 * Normalize IBAN: remove whitespace, uppercase, validate structure + checksum.
 */
export function normalizeIban(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, '').toUpperCase();
  if (!text) return null;

  if (text.length < 15 || text.length > 34 || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(text)) {
    logger.warn('Invalid IBAN format detected — rejecting', { iban: text.substring(0, 4) + '...' });
    return null;
  }

  // Country-specific length check
  const country = text.slice(0, 2);
  const expectedLen = IBAN_LENGTHS[country];
  if (expectedLen && text.length !== expectedLen) {
    logger.warn('IBAN length mismatch — possible AI extraction error', {
      country,
      expected: expectedLen,
      actual: text.length,
      iban: text.substring(0, 4) + '***',
    });
  }

  // Checksum validation (mod 97)
  if (!validateIbanChecksum(text)) {
    logger.warn('IBAN checksum invalid — likely misread digits', {
      iban: text.substring(0, 4) + '***',
      length: text.length,
    });
  }

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
  const hasSubtotal = !isNaN(rawSubtotal);
  const subtotal = hasSubtotal ? rawSubtotal : 0;

  const rawTotal = safeNumberStrict(data.totalAmount);
  if (isNaN(rawTotal)) {
    logger.warn('totalAmount is not a valid number, defaulting to 0', { raw: data.totalAmount });
  }
  const totalAmount = isNaN(rawTotal) ? 0 : rawTotal;

  // Tax amount — only derive from subtotal when AI actually provided one (C3 fix)
  const rawTaxAmount = safeNumberStrict(data.taxAmount);
  const hasTaxAmount =
    data.taxAmount !== null && data.taxAmount !== undefined && data.taxAmount !== '';
  const taxAmount =
    hasTaxAmount &&
    !isNaN(rawTaxAmount) &&
    !(rawTaxAmount === 0 && hasSubtotal && totalAmount > subtotal + 0.01)
      ? rawTaxAmount
      : hasSubtotal && totalAmount > subtotal
        ? Math.round((totalAmount - subtotal) * 100) / 100
        : 0;

  // Tax rate — only use what AI explicitly provided (T3: no implicit derivation)
  // FIX: Mistral sometimes returns taxRate as array (e.g., [19, 7] for mixed rates)
  // Convert to null — mixed-rate invoices should use per-line-item rates only
  const rawTaxRate = Array.isArray(data.taxRate) ? null : data.taxRate;
  const parsedTaxRate = normalizeTaxRate(rawTaxRate);

  // Line items (support both "lineItems" and legacy "items" key)
  const rawItems = Array.isArray(data.lineItems)
    ? data.lineItems
    : Array.isArray(data.items)
      ? data.items
      : [];

  const result: ExtractedInvoiceData = {
    invoiceNumber: (data.invoiceNumber as string) || null,
    invoiceDate: (data.invoiceDate as string) || null,
    // Fallback: parse address components from combined address string if city/postalCode missing
    ...(() => {
      let buyerAddr = (data.buyerAddress as string) || (data.buyerStreet as string) || null;
      let buyerCityVal = (data.buyerCity as string) || null;
      let buyerPostal = data.buyerPostalCode != null ? String(data.buyerPostalCode) : null;
      if ((!buyerCityVal || !buyerPostal) && buyerAddr) {
        const parsed = parseAddressComponents(buyerAddr);
        if (!buyerCityVal && parsed.city) buyerCityVal = parsed.city;
        if (!buyerPostal && parsed.postalCode) buyerPostal = parsed.postalCode;
        if (parsed.street && parsed.street !== buyerAddr) buyerAddr = parsed.street;
      }
      let sellerAddr = (data.sellerAddress as string) || (data.sellerStreet as string) || null;
      let sellerCityVal = (data.sellerCity as string) || null;
      let sellerPostal = data.sellerPostalCode != null ? String(data.sellerPostalCode) : null;
      if ((!sellerCityVal || !sellerPostal) && sellerAddr) {
        const parsed = parseAddressComponents(sellerAddr);
        if (!sellerCityVal && parsed.city) sellerCityVal = parsed.city;
        if (!sellerPostal && parsed.postalCode) sellerPostal = parsed.postalCode;
        if (parsed.street && parsed.street !== sellerAddr) sellerAddr = parsed.street;
      }
      return {
        buyerAddress: buyerAddr,
        buyerCity: buyerCityVal,
        buyerPostalCode: buyerPostal,
        sellerAddress: sellerAddr,
        sellerCity: sellerCityVal,
        sellerPostalCode: sellerPostal,
      };
    })(),
    buyerName: (data.buyerName as string) || null,
    buyerEmail: (data.buyerEmail as string) || null,
    buyerCountryCode: (data.buyerCountryCode as string) || null,
    buyerTaxId: (data.buyerTaxId as string) || null,
    buyerPhone: (data.buyerPhone as string) || null,
    sellerName: (data.sellerName as string) || null,
    sellerEmail: (data.sellerEmail as string) || null,
    sellerCountryCode: (data.sellerCountryCode as string) || null,
    sellerTaxId: (data.sellerTaxId as string) || null,
    sellerIban: normalizeIban(data.sellerIban),
    sellerBic: (data.sellerBic as string) || null,
    sellerPhone: (data.sellerPhone as string) || null,
    bankName: (data.bankName as string) || null,
    lineItems: rawItems.map((item: Record<string, unknown>, index: number) => {
      // T3: Use only the per-item rate from AI; do NOT fallback to invoice-level rate
      // FIX: Handle array taxRate on line items too (Mistral edge case)
      const rawItemRate = Array.isArray(item?.taxRate) ? null : item?.taxRate;
      const itemTaxRate = normalizeTaxRate(rawItemRate);
      const resolvedRate = !isNaN(itemTaxRate) ? itemTaxRate : undefined;
      const qty = safeNumberStrict(item?.quantity);
      const up = safeNumberStrict(item?.unitPrice);
      const tp = safeNumberStrict(item?.totalPrice);

      // F2: Semantic guard - detect GROSS-probable cases
      if (!isNaN(qty) && !isNaN(up) && !isNaN(tp) && qty > 0 && up > 0) {
        const expectedNet = qty * up;
        const deviation = Math.abs(tp - expectedNet);
        const deviationPercent = expectedNet > 0 ? deviation / expectedNet : 0;

        // Check if totalPrice significantly differs from qty × unitPrice
        if (deviation > 0.05 && deviationPercent > 0.01) {
          // Check if it matches GROSS (net + tax)
          if (resolvedRate !== undefined && resolvedRate > 0) {
            const possibleGross = expectedNet * (1 + resolvedRate / 100);
            const deviationFromGross = Math.abs(tp - possibleGross);

            if (deviationFromGross < 0.02) {
              // Very likely GROSS instead of NET
              logger.warn('Line item totalPrice appears to be GROSS (includes VAT)', {
                lineIndex: index,
                totalPrice: tp,
                expectedNet: Math.round(expectedNet * 100) / 100,
                taxRate: resolvedRate,
                possibleGross: Math.round(possibleGross * 100) / 100,
                note: 'EN 16931 requires NET line totals. Check extraction prompt.',
              });
            }
          }
        }
      }

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
    currency: (() => {
      const raw = data.currency as string;
      if (!raw) {
        logger.warn('Currency not extracted from invoice, defaulting to EUR');
      }
      return raw || 'EUR';
    })(),
    paymentTerms: (data.paymentTerms as string) || null,
    notes: (data.notes as string) || null,
    // FIX: Audit V2 [F-009] — normalize AI confidence to 0-1 range
    confidence: (() => {
      const raw = Number(data.confidence);
      if (isNaN(raw) || raw < 0) return 0.7;
      if (raw > 1 && raw <= 100) return raw / 100;
      if (raw > 100) {
        logger.warn('AI confidence exceeds 100, defaulting to 0.7', { rawConfidence: raw });
        return 0.7;
      }
      return raw;
    })(),
    // EN 16931 new fields (additive, all optional)
    ...normalizeVatIds(data),
    ...normalizeElectronicAddresses(data),
    documentTypeCode: normalizeDocumentTypeCode(data.documentTypeCode),
    buyerReference: (data.buyerReference as string) || null,
    // v2 prompt fields
    sellerContactName: (data.sellerContactName as string) || null,
    dueDate: (data.dueDate as string) || null,
    // Document-level allowances and charges (BG-20 / BG-21)
    allowanceCharges: normalizeAllowanceCharges(data.allowanceCharges),
  };

  // FIX-031: Detect and convert gross (VAT-inclusive) prices to net.
  // EN 16931 requires all line item prices to be NET (before VAT).
  // Heuristic: if sum(lines) - sum(allowances) + sum(charges) ≈ totalAmount
  // WITHOUT adding tax, then prices are gross (already include VAT).
  // In a net-priced invoice, that sum would be the tax basis, and
  // taxBasis + taxAmount ≈ totalAmount.
  if (result.totalAmount > 0 && result.taxAmount > 0) {
    const lineTotal = result.lineItems.reduce((s, li) => s + li.totalPrice, 0);
    const allowanceSum = (result.allowanceCharges || [])
      .filter((ac) => !ac.chargeIndicator)
      .reduce((s, ac) => s + ac.amount, 0);
    const chargeSum = (result.allowanceCharges || [])
      .filter((ac) => ac.chargeIndicator)
      .reduce((s, ac) => s + ac.amount, 0);

    const basis = lineTotal - allowanceSum + chargeSum;
    const grossMatch = Math.abs(basis - result.totalAmount) < 1;
    const netMatch = Math.abs(basis + result.taxAmount - result.totalAmount) < 1;

    if (grossMatch && !netMatch) {
      logger.info('Gross pricing detected — converting line items and allowances to NET', {
        lineTotal: Math.round(lineTotal * 100) / 100,
        totalAmount: result.totalAmount,
        taxAmount: result.taxAmount,
      });

      // Convert line items: net = gross / (1 + taxRate/100)
      for (let i = 0; i < result.lineItems.length; i++) {
        const item = result.lineItems[i]!;
        const rate = item.taxRate ?? 0;
        if (rate > 0) {
          const factor = 1 + rate / 100;
          item.unitPrice = Math.round((item.unitPrice / factor) * 100) / 100;
          item.totalPrice = Math.round((item.totalPrice / factor) * 100) / 100;
        } else if (item.taxRate === undefined) {
          logger.warn(
            'Gross pricing detected but line item has no taxRate — cannot convert to NET',
            {
              lineIndex: i,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            }
          );
        }
      }

      // Convert allowances/charges
      for (const ac of result.allowanceCharges || []) {
        const rate = ac.taxRate ?? 0;
        if (rate > 0) {
          const factor = 1 + rate / 100;
          ac.amount = Math.round((ac.amount / factor) * 100) / 100;
          if (ac.baseAmount) {
            ac.baseAmount = Math.round((ac.baseAmount / factor) * 100) / 100;
          }
        }
      }

      // Recalculate subtotal as actual net (totalAmount − taxAmount)
      result.subtotal = Math.round((result.totalAmount - result.taxAmount) * 100) / 100;
    }
  }

  return result;
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
 * Normalize document-level allowances and charges from AI output.
 * Returns empty array if none found (backward-compatible).
 */
function normalizeAllowanceCharges(raw: unknown): AllowanceCharge[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return raw
    .map((item: Record<string, unknown>) => {
      if (!item || typeof item !== 'object') return null;

      const amount = safeNumberStrict(item.amount);
      if (isNaN(amount) || amount < 0) return null;

      const percentage = safeNumberStrict(item.percentage);
      const baseAmount = safeNumberStrict(item.baseAmount);
      const taxRate = normalizeTaxRate(item.taxRate);

      return {
        chargeIndicator: item.chargeIndicator === true,
        amount,
        baseAmount: isNaN(baseAmount) ? null : baseAmount,
        percentage: isNaN(percentage) ? null : percentage,
        reason: (item.reason as string) || null,
        reasonCode: (item.reasonCode as string) || null,
        taxRate: isNaN(taxRate) ? null : taxRate,
        taxCategoryCode:
          normalizeTaxCategoryCode(item.taxCategoryCode, isNaN(taxRate) ? undefined : taxRate) ??
          null,
      } as AllowanceCharge;
    })
    .filter((item): item is AllowanceCharge => item !== null);
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
