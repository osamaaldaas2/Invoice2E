/**
 * Maps various invoice data shapes to the CanonicalInvoice model.
 * Handles ExtractedInvoiceData, XRechnungInvoiceData, and raw Record<string, unknown>.
 *
 * @module services/format/canonical-mapper
 */

import type { ExtractedInvoiceData, TaxCategoryCode, DocumentTypeCode } from '@/types';
import type {
  CanonicalInvoice,
  OutputFormat,
  PartyInfo,
  PaymentInfo,
  CanonicalLineItem,
  CanonicalAllowanceCharge,
} from '@/types/canonical-invoice';
import type { XRechnungInvoiceData } from '@/services/xrechnung/types';
import { isEuVatId } from '@/lib/extraction-normalizer';
import { roundMoney, sumMoney } from '@/lib/monetary';
import { logger } from '@/lib/logger';

type InputData = ExtractedInvoiceData | XRechnungInvoiceData | Record<string, unknown>;

/**
 * Safely extract a string value from unknown data.
 */
function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/**
 * Safely extract a number value from unknown data.
 */
function num(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Safely extract an optional number.
 */
function optNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map input invoice data to CanonicalInvoice.
 *
 * Handles the seller tax ID splitting logic (sellerTaxId → sellerVatId/sellerTaxNumber)
 * that currently lives in the convert route, and electronic address fallback logic.
 */
export function toCanonicalInvoice(
  data: InputData,
  outputFormat: OutputFormat = 'xrechnung-cii'
): CanonicalInvoice {
  const d = data as Record<string, unknown>;

  // Resolve seller tax identifiers (BT-31 / BT-32)
  const rawSellerTaxId = str(d.sellerTaxId);
  let sellerVatId = str(d.sellerVatId);
  let sellerTaxNumber = str(d.sellerTaxNumber);
  if (!sellerVatId && !sellerTaxNumber && rawSellerTaxId) {
    if (isEuVatId(rawSellerTaxId)) {
      sellerVatId = rawSellerTaxId;
    } else {
      sellerTaxNumber = rawSellerTaxId;
    }
  }

  // Build seller party
  const seller: PartyInfo = {
    name: str(d.sellerName) || '',
    email: str(d.sellerEmail),
    address: str(d.sellerAddress),
    city: str(d.sellerCity),
    postalCode: str(d.sellerPostalCode),
    countryCode: str(d.sellerCountryCode),
    phone: str(d.sellerPhoneNumber) || str(d.sellerPhone),
    vatId: sellerVatId,
    taxNumber: sellerTaxNumber,
    taxId: rawSellerTaxId,
    electronicAddress: str(d.sellerElectronicAddress) || str(d.sellerEmail),
    electronicAddressScheme:
      str(d.sellerElectronicAddressScheme) || (str(d.sellerEmail) ? 'EM' : null),
    contactName: str(d.sellerContactName) || str(d.sellerContact),
    taxRegime: str(d.sellerTaxRegime) || str(d.taxRegime),
  };

  // Build buyer party
  const buyer: PartyInfo = {
    name: str(d.buyerName) || '',
    email: str(d.buyerEmail),
    address: str(d.buyerAddress),
    city: str(d.buyerCity),
    postalCode: str(d.buyerPostalCode),
    countryCode: str(d.buyerCountryCode),
    phone: str(d.buyerPhone),
    vatId: str(d.buyerVatId),
    taxId: str(d.buyerTaxId),
    electronicAddress: str(d.buyerElectronicAddress) || str(d.buyerEmail),
    electronicAddressScheme:
      str(d.buyerElectronicAddressScheme) || (str(d.buyerEmail) ? 'EM' : null),
    contactName: null,
  };

  // Build payment info
  const payment: PaymentInfo = {
    iban: str(d.sellerIban),
    bic: str(d.sellerBic),
    bankName: str(d.bankName),
    paymentTerms: str(d.paymentTerms),
    dueDate: str(d.dueDate) || str(d.paymentDueDate),
    prepaidAmount: optNum(d.prepaidAmount),
  };

  // Map line items
  const rawItems = Array.isArray(d.lineItems) ? d.lineItems : [];
  const lineItems: CanonicalLineItem[] = rawItems.map((item: Record<string, unknown>) => ({
    description: str(item.description) || str(item.name) || '',
    quantity: num(item.quantity) || 1,
    unitPrice: num(item.unitPrice),
    totalPrice:
      num(item.totalPrice) ||
      num(item.lineTotal) ||
      num(item.unitPrice) * (num(item.quantity) || 1),
    taxRate: optNum(item.taxRate) ?? optNum(item.vatRate) ?? undefined,
    taxCategoryCode: (item.taxCategoryCode as TaxCategoryCode | undefined) || undefined,
    unitCode: str(item.unitCode) || undefined,
  }));

  // Map allowance charges
  const rawAC = Array.isArray(d.allowanceCharges) ? d.allowanceCharges : [];
  const allowanceCharges: CanonicalAllowanceCharge[] = rawAC.map((ac: Record<string, unknown>) => ({
    chargeIndicator: !!ac.chargeIndicator,
    amount: num(ac.amount),
    baseAmount: optNum(ac.baseAmount),
    percentage: optNum(ac.percentage),
    reason: str(ac.reason),
    reasonCode: str(ac.reasonCode),
    taxRate: optNum(ac.taxRate),
    taxCategoryCode: (ac.taxCategoryCode as TaxCategoryCode | null) || null,
  }));

  const canonical: CanonicalInvoice = {
    outputFormat,
    invoiceNumber: str(d.invoiceNumber) || '',
    invoiceDate: str(d.invoiceDate) || new Date().toISOString().split('T')[0] || '',
    documentTypeCode: (d.documentTypeCode as DocumentTypeCode) || undefined,
    currency: str(d.currency) || 'EUR',
    buyerReference: str(d.buyerReference),
    notes: str(d.notes),
    precedingInvoiceReference: str(d.precedingInvoiceReference),
    billingPeriodStart: str(d.billingPeriodStart),
    billingPeriodEnd: str(d.billingPeriodEnd),
    seller,
    buyer,
    payment,
    lineItems,
    totals: {
      subtotal: num(d.subtotal),
      taxAmount: num(d.taxAmount),
      totalAmount: num(d.totalAmount),
    },
    allowanceCharges: allowanceCharges.length > 0 ? allowanceCharges : undefined,
    taxRate: optNum(d.taxRate) ?? optNum(d.vatRate),
    confidence: optNum(d.confidence) ?? undefined,
    processingTimeMs: optNum(d.processingTimeMs) ?? undefined,
  };

  return preprocessGrossToNet(canonical);
}

/**
 * Detect gross-priced (VAT-inclusive) invoices and convert line items +
 * allowances/charges to net amounts. Both CII and UBL generators then
 * receive clean net data, eliminating the need for format-specific gross
 * detection.
 *
 * Detection heuristic: when line totals minus allowances plus charges do NOT
 * match the provided subtotal, but dividing by (1 + commonRate) does, the
 * invoice is gross-priced.
 *
 * Only fires when allowances/charges are present (the typical scenario for
 * German gross-priced invoices with discounts).
 */
export function preprocessGrossToNet(invoice: CanonicalInvoice): CanonicalInvoice {
  const items = invoice.lineItems;
  const allowanceCharges = invoice.allowanceCharges ?? [];

  const grossAllowances = sumMoney(
    allowanceCharges.filter((ac) => !ac.chargeIndicator).map((ac) => ac.amount)
  );
  const grossCharges = sumMoney(
    allowanceCharges.filter((ac) => ac.chargeIndicator).map((ac) => ac.amount)
  );
  if (grossAllowances <= 0 && grossCharges <= 0) return invoice;

  const grossLineTotal = sumMoney(items.map((item) => item.totalPrice));
  const grossAfterAdjustments = roundMoney(grossLineTotal - grossAllowances + grossCharges);
  const providedSubtotal = invoice.totals.subtotal;

  if (Math.abs(grossAfterAdjustments - providedSubtotal) <= 0.05) return invoice;

  const commonRates = [0.19, 0.07, 0.2, 0.21, 0.1, 0.05];
  let detectedRate: number | null = null;
  for (const rate of commonRates) {
    if (Math.abs(roundMoney(grossAfterAdjustments / (1 + rate)) - providedSubtotal) < 0.05) {
      detectedRate = rate;
      break;
    }
  }

  if (detectedRate === null) return invoice;

  logger.info('Canonical mapper: Gross-priced invoice detected, converting to net', {
    detectedRate: `${(detectedRate * 100).toFixed(0)}%`,
    grossLineTotal,
    grossAllowances,
    providedSubtotal,
  });

  const netItems: CanonicalLineItem[] = items.map((item) => {
    const taxRate = item.taxRate ?? detectedRate! * 100;
    const divisor = 1 + taxRate / 100;
    return {
      ...item,
      unitPrice: roundMoney(item.unitPrice / divisor),
      totalPrice: roundMoney(item.totalPrice / divisor),
    };
  });

  const netAllowanceCharges: CanonicalAllowanceCharge[] = allowanceCharges.map((ac) => {
    const taxRate = ac.taxRate ?? detectedRate! * 100;
    const divisor = 1 + taxRate / 100;
    return {
      ...ac,
      amount: roundMoney(ac.amount / divisor),
    };
  });

  // Rounding adjustment: ensure net line total - net allowances + net charges = subtotal
  const netLineTotal = sumMoney(netItems.map((it) => it.totalPrice));
  const netAllowanceTotal = sumMoney(
    netAllowanceCharges.filter((ac) => !ac.chargeIndicator).map((ac) => ac.amount)
  );
  const netChargeTotal = sumMoney(
    netAllowanceCharges.filter((ac) => ac.chargeIndicator).map((ac) => ac.amount)
  );
  const netTaxBasis = roundMoney(netLineTotal - netAllowanceTotal + netChargeTotal);
  const roundingDiff = roundMoney(providedSubtotal - netTaxBasis);

  if (Math.abs(roundingDiff) > 0 && Math.abs(roundingDiff) <= 0.05 && netItems.length > 0) {
    const largestIdx = netItems.reduce(
      (maxIdx, item, idx) => (item.totalPrice > netItems[maxIdx]!.totalPrice ? idx : maxIdx),
      0
    );
    netItems[largestIdx]!.totalPrice = roundMoney(netItems[largestIdx]!.totalPrice + roundingDiff);
  }

  return {
    ...invoice,
    lineItems: netItems,
    allowanceCharges: netAllowanceCharges.length > 0 ? netAllowanceCharges : undefined,
  };
}
