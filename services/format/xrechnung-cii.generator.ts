/**
 * XRechnung CII format generator — wraps the existing XRechnungBuilder.
 * This is a thin adapter that delegates all work to the existing implementation.
 *
 * @module services/format/xrechnung-cii.generator
 */

import type { IFormatGenerator, GenerationResult } from './IFormatGenerator';
import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';
import type { XRechnungInvoiceData } from '@/services/xrechnung/types';
import { xrechnungBuilder } from '@/services/xrechnung/builder';
import { validateXmlStructure, xrechnungValidator } from '@/services/xrechnung/validator';
import { logger } from '@/lib/logger';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Convert CanonicalInvoice to XRechnungInvoiceData for the existing builder.
 */
function toXRechnungData(invoice: CanonicalInvoice): XRechnungInvoiceData {
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

export class XRechnungCIIGenerator implements IFormatGenerator {
  readonly formatId: OutputFormat = 'xrechnung-cii';
  readonly formatName = 'XRechnung 3.0 (CII)';
  readonly specVersion = '3.0';
  readonly specDate = '2023-07-07';

  async generate(invoice: CanonicalInvoice): Promise<GenerationResult> {
    const data = toXRechnungData(invoice);
    const xml = xrechnungBuilder.buildXml(data);
    const structValidation = await this.validate(xml);

    const allWarnings: string[] = [];
    if (!structValidation.valid) {
      allWarnings.push(...structValidation.errors.map((e) => `[XML-STRUCT] ${e}`));
    }

    const result: GenerationResult = {
      xmlContent: xml,
      fileName: `${invoice.invoiceNumber || 'invoice'}_xrechnung.xml`,
      fileSize: Buffer.byteLength(xml, 'utf8'),
      validationStatus: allWarnings.length > 0 ? 'warnings' : 'valid',
      validationErrors: [],
      validationWarnings: allWarnings,
    };

    // Run optional external KoSIT validation — same logic as the old xrechnung.service.ts
    await this.runExternalValidation(xml, invoice.invoiceNumber, result);

    return result;
  }

  async validate(xml: string): Promise<{ valid: boolean; errors: string[] }> {
    const result = validateXmlStructure(xml);
    return { valid: result.valid, errors: result.errors };
  }

  /**
   * Run external KoSIT validator if ENABLE_EXTERNAL_VALIDATION=true.
   * Appends warnings to result — never blocks generation.
   * Mirrors the behavior from the original xrechnung.service.ts.
   */
  private async runExternalValidation(
    xml: string,
    invoiceNumber: string | undefined,
    result: GenerationResult
  ): Promise<void> {
    let tmpPath: string | undefined;
    try {
      // Write XML to temp file for KoSIT validator
      const tmpDir = os.tmpdir();
      const safeName = (invoiceNumber || 'invoice').replace(/[^a-zA-Z0-9_-]/g, '_');
      tmpPath = path.join(tmpDir, `xrechnung_${safeName}_${Date.now()}.xml`);
      fs.writeFileSync(tmpPath, xml, 'utf8');

      const extResult = await xrechnungValidator.validateExternal(tmpPath);

      if (extResult.ran) {
        if (!extResult.valid) {
          result.validationWarnings.push(
            `[KOSIT-EXT] External validator: ${extResult.error || 'invalid'}`
          );
          if (result.validationStatus === 'valid') {
            result.validationStatus = 'warnings';
          }
        }
        logger.info('External validation completed', {
          invoiceNumber,
          externalValid: extResult.valid,
        });
      }
    } finally {
      if (tmpPath) {
        try {
          fs.unlinkSync(tmpPath);
        } catch (cleanupErr) {
          logger.warn('Failed to cleanup temp XML file', {
            tmpPath,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        }
      }
    }
  }
}
