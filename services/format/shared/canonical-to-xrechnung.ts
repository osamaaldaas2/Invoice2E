/**
 * Shared mapping from CanonicalInvoice to XRechnungInvoiceData.
 * Used by both XRechnung CII and Factur-X generators to avoid duplication.
 *
 * @module services/format/shared/canonical-to-xrechnung
 */

import type { CanonicalInvoice } from '@/types/canonical-invoice';
import type { XRechnungInvoiceData } from '@/services/xrechnung/types';

/**
 * Convert CanonicalInvoice to XRechnungInvoiceData for the existing CII builder.
 */
export function toXRechnungData(invoice: CanonicalInvoice): XRechnungInvoiceData {
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    documentTypeCode: invoice.documentTypeCode,
    currency: invoice.currency,
    buyerReference: invoice.buyerReference,
    notes: invoice.notes,
    precedingInvoiceReference: invoice.precedingInvoiceReference,
    billingPeriodStart: invoice.billingPeriodStart,
    billingPeriodEnd: invoice.billingPeriodEnd,
    // Seller
    sellerName: invoice.seller.name,
    sellerEmail: invoice.seller.email,
    sellerAddress: invoice.seller.address,
    sellerCity: invoice.seller.city,
    sellerPostalCode: invoice.seller.postalCode,
    sellerCountryCode: invoice.seller.countryCode,
    sellerVatId: invoice.seller.vatId,
    sellerTaxNumber: invoice.seller.taxNumber,
    sellerTaxId: invoice.seller.taxId,
    sellerElectronicAddress: invoice.seller.electronicAddress,
    sellerElectronicAddressScheme: invoice.seller.electronicAddressScheme,
    sellerContactName: invoice.seller.contactName,
    sellerPhone: invoice.seller.phone,
    sellerIban: invoice.payment.iban,
    sellerBic: invoice.payment.bic,
    // Buyer
    buyerName: invoice.buyer.name,
    buyerEmail: invoice.buyer.email,
    buyerAddress: invoice.buyer.address,
    buyerCity: invoice.buyer.city,
    buyerPostalCode: invoice.buyer.postalCode,
    buyerCountryCode: invoice.buyer.countryCode,
    buyerVatId: invoice.buyer.vatId,
    buyerTaxId: invoice.buyer.taxId,
    buyerElectronicAddress: invoice.buyer.electronicAddress,
    buyerElectronicAddressScheme: invoice.buyer.electronicAddressScheme,
    // Line items
    lineItems: invoice.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      taxRate: item.taxRate,
      taxCategoryCode: item.taxCategoryCode,
      unitCode: item.unitCode,
    })),
    // Totals
    subtotal: invoice.totals.subtotal,
    taxRate: invoice.taxRate,
    taxAmount: invoice.totals.taxAmount,
    totalAmount: invoice.totals.totalAmount,
    // Payment
    paymentTerms: invoice.payment.paymentTerms,
    paymentDueDate: invoice.payment.dueDate,
    dueDate: invoice.payment.dueDate,
    prepaidAmount: invoice.payment.prepaidAmount,
    // Allowances/charges
    allowanceCharges: invoice.allowanceCharges?.map((ac) => ({
      chargeIndicator: ac.chargeIndicator,
      amount: ac.amount,
      baseAmount: ac.baseAmount ?? undefined,
      percentage: ac.percentage ?? undefined,
      reason: ac.reason ?? undefined,
      reasonCode: ac.reasonCode ?? undefined,
      taxRate: ac.taxRate ?? undefined,
      taxCategoryCode: ac.taxCategoryCode ?? undefined,
    })),
  };
}
