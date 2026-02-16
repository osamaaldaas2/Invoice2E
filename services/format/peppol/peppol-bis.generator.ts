/**
 * PEPPOL BIS 3.0 format generator — UBL 2.1 based.
 * Reuses UBLService with PEPPOL-specific identifiers and validation.
 *
 * @module services/format/peppol/peppol-bis.generator
 */

import type { IFormatGenerator, GenerationResult } from '../IFormatGenerator';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';
import type { UBLInvoiceData } from '@/services/ubl.service';
import { ublService } from '@/services/ubl.service';

const PEPPOL_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
const PEPPOL_PROFILE_ID =
  'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';
const XRECHNUNG_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';

function toUBLData(invoice: CanonicalInvoice): UBLInvoiceData {
  return {
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.payment.dueDate || undefined,
    currency: invoice.currency,
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
    lineItems: invoice.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      unitCode: item.unitCode,
      taxPercent: item.taxRate,
      taxCategoryCode: item.taxCategoryCode,
    })),
    subtotal: invoice.totals.subtotal,
    taxAmount: invoice.totals.taxAmount,
    totalAmount: invoice.totals.totalAmount,
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

function replaceCustomizationId(xml: string): string {
  return xml.replace(
    `<cbc:CustomizationID>${XRECHNUNG_CUSTOMIZATION_ID}</cbc:CustomizationID>`,
    `<cbc:CustomizationID>${PEPPOL_CUSTOMIZATION_ID}</cbc:CustomizationID>`,
  );
}

export class PeppolBISGenerator implements IFormatGenerator {
  readonly formatId: OutputFormat = 'peppol-bis';
  readonly formatName = 'PEPPOL BIS Billing 3.0';

  async generate(invoice: CanonicalInvoice): Promise<GenerationResult> {
    const data = toUBLData(invoice);
    let xml = await ublService.generate(data);
    xml = replaceCustomizationId(xml);

    const validation = await this.validate(xml);

    return {
      xmlContent: xml,
      fileName: `${invoice.invoiceNumber || 'invoice'}_peppol.xml`,
      fileSize: new TextEncoder().encode(xml).length,
      validationStatus: validation.valid ? 'valid' : 'warnings',
      validationErrors: validation.errors,
      validationWarnings: [],
    };
  }

  async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const isCreditNote = xml.includes('<CreditNote ') || xml.includes('<CreditNote>');

    const requiredElements = [
      'CustomizationID',
      'ProfileID',
      'ID',
      'IssueDate',
      isCreditNote ? 'CreditNoteTypeCode' : 'InvoiceTypeCode',
      'DocumentCurrencyCode',
      'AccountingSupplierParty',
      'AccountingCustomerParty',
      'LegalMonetaryTotal',
      isCreditNote ? 'CreditNoteLine' : 'InvoiceLine',
      'PaymentMeans',
    ];

    for (const element of requiredElements) {
      if (!xml.includes(element)) {
        errors.push(`Missing required element: ${element}`);
      }
    }

    if (!xml.includes(PEPPOL_CUSTOMIZATION_ID)) {
      errors.push('Missing PEPPOL BIS 3.0 customization ID');
    }

    if (!xml.includes(PEPPOL_PROFILE_ID)) {
      errors.push('Missing PEPPOL BIS profile ID');
    }

    if (!xml.includes('EndpointID')) {
      errors.push('Missing EndpointID — mandatory for PEPPOL BIS (BT-34 seller, BT-49 buyer)');
    }

    return { valid: errors.length === 0, errors };
  }
}
