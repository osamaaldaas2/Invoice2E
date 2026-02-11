/**
 * Shared extraction normalization logic.
 * Used by all AI adapters (DeepSeek, Gemini batch adapter, Gemini single-file service)
 * to ensure consistent data normalization from raw AI responses.
 *
 * SINGLE SOURCE OF TRUTH for: tax rate normalization, IBAN normalization,
 * field defaults, and line item mapping.
 */

import type { ExtractedInvoiceData } from '@/types';
import { logger } from '@/lib/logger';

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

/**
 * Normalize raw AI-extracted data into a standardized ExtractedInvoiceData object.
 */
export function normalizeExtractedData(data: Record<string, unknown>): ExtractedInvoiceData {
  const subtotal = Number(data.subtotal) || 0;
  const totalAmount = Number(data.totalAmount) || 0;

  // Tax amount
  const rawTaxAmount = Number(data.taxAmount);
  const hasTaxAmount =
    data.taxAmount !== null && data.taxAmount !== undefined && data.taxAmount !== '';
  const taxAmount =
    hasTaxAmount && !isNaN(rawTaxAmount) && !(rawTaxAmount === 0 && totalAmount > subtotal + 0.01)
      ? rawTaxAmount
      : totalAmount > subtotal
        ? Math.round((totalAmount - subtotal) * 100) / 100
        : 0;

  // Tax rate
  const parsedTaxRate = normalizeTaxRate(data.taxRate);
  const derivedTaxRate = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 0;
  const fallbackTaxRate = !isNaN(parsedTaxRate) ? parsedTaxRate : derivedTaxRate;

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
      let itemTaxRate = normalizeTaxRate(item?.taxRate);
      if (isNaN(itemTaxRate)) {
        itemTaxRate = fallbackTaxRate;
      }
      return {
        description: (item?.description as string) || '',
        quantity: Number(item?.quantity) || 1,
        unitPrice: Number(item?.unitPrice) || 0,
        totalPrice: Number(item?.totalPrice) || 0,
        taxRate: !isNaN(itemTaxRate) ? itemTaxRate : 0,
      };
    }),
    subtotal,
    taxRate: !isNaN(parsedTaxRate) ? parsedTaxRate : derivedTaxRate,
    taxAmount,
    totalAmount,
    currency: (data.currency as string) || 'EUR',
    paymentTerms: (data.paymentTerms as string) || null,
    notes: (data.notes as string) || null,
    confidence: Number(data.confidence) || 0.7,
  };
}
