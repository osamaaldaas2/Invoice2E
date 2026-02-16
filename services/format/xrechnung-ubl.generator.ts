/**
 * XRechnung UBL format generator — wraps the existing UBLService.
 * This is a thin adapter that delegates all work to the existing implementation.
 * 
 * @module services/format/xrechnung-ubl.generator
 */

import type { IFormatGenerator, GenerationResult } from './IFormatGenerator';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';
import type { UBLInvoiceData } from '@/services/ubl.service';
import { ublService } from '@/services/ubl.service';

/**
 * Convert CanonicalInvoice to UBLInvoiceData for the existing UBL service.
 */
function toUBLData(invoice: CanonicalInvoice): UBLInvoiceData {
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.payment.dueDate || undefined,
    currency: invoice.currency,
    // Seller
    sellerName: invoice.seller.name,
    sellerEmail: invoice.seller.email || '',
    sellerPhone: invoice.seller.phone || undefined,
    sellerContactName: invoice.seller.contactName || undefined,
    sellerTaxId: invoice.seller.taxId || invoice.seller.vatId || invoice.seller.taxNumber || '',
    sellerVatId: invoice.seller.vatId || undefined,
    sellerTaxNumber: invoice.seller.taxNumber || undefined,
    sellerAddress: invoice.seller.address || undefined,
    sellerCity: invoice.seller.city || undefined,
    sellerPostalCode: invoice.seller.postalCode || undefined,
    sellerCountryCode: invoice.seller.countryCode || '',
    sellerElectronicAddress: invoice.seller.electronicAddress || undefined,
    sellerElectronicAddressScheme: invoice.seller.electronicAddressScheme || undefined,
    sellerIban: invoice.payment.iban || undefined,
    sellerBic: invoice.payment.bic || undefined,
    // Buyer
    buyerName: invoice.buyer.name,
    buyerEmail: invoice.buyer.email || undefined,
    buyerAddress: invoice.buyer.address || undefined,
    buyerCity: invoice.buyer.city || undefined,
    buyerPostalCode: invoice.buyer.postalCode || undefined,
    buyerCountryCode: invoice.buyer.countryCode || '',
    buyerReference: invoice.buyerReference || undefined,
    buyerVatId: invoice.buyer.vatId || undefined,
    buyerElectronicAddress: invoice.buyer.electronicAddress || undefined,
    buyerElectronicAddressScheme: invoice.buyer.electronicAddressScheme || undefined,
    // Line items
    lineItems: invoice.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      unitCode: item.unitCode,
      taxPercent: item.taxRate,
      taxCategoryCode: item.taxCategoryCode,
    })),
    // Totals
    subtotal: invoice.totals.subtotal,
    taxAmount: invoice.totals.taxAmount,
    totalAmount: invoice.totals.totalAmount,
    // Optional
    notes: invoice.notes || undefined,
    paymentTerms: invoice.payment.paymentTerms || undefined,
    documentTypeCode: invoice.documentTypeCode,
    precedingInvoiceReference: invoice.precedingInvoiceReference || undefined,
    prepaidAmount: invoice.payment.prepaidAmount ?? undefined,
    billingPeriodStart: invoice.billingPeriodStart || undefined,
    billingPeriodEnd: invoice.billingPeriodEnd || undefined,
    allowanceCharges: invoice.allowanceCharges?.map((ac) => ({
      chargeIndicator: ac.chargeIndicator,
      amount: ac.amount,
      reason: ac.reason || undefined,
      reasonCode: ac.reasonCode || undefined,
      taxRate: ac.taxRate ?? undefined,
      taxCategoryCode: ac.taxCategoryCode || undefined,
      percentage: ac.percentage ?? undefined,
      baseAmount: ac.baseAmount ?? undefined,
    })),
  };
}

export class XRechnungUBLGenerator implements IFormatGenerator {
  readonly formatId: OutputFormat = 'xrechnung-ubl';
  readonly formatName = 'XRechnung 3.0 (UBL)';

  async generate(invoice: CanonicalInvoice): Promise<GenerationResult> {
    const data = toUBLData(invoice);
    const xml = await ublService.generate(data);
    const validation = await this.validate(xml);

    return {
      xmlContent: xml,
      fileName: `${invoice.invoiceNumber || 'invoice'}_ubl.xml`,
      fileSize: new TextEncoder().encode(xml).length,
      validationStatus: validation.valid ? 'valid' : 'warnings',
      validationErrors: validation.errors,
      validationWarnings: [],
    };
  }

  async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    return ublService.validate(xml);
  }
}
