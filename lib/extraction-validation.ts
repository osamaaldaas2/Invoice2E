/**
 * AI Extraction Output Validation
 *
 * FIX: Audit #016 — strict Zod schema to validate AI extraction output.
 * Rejects malformed, hallucinated, or incomplete data before it reaches storage.
 * Applied to ALL extractors (Gemini, OpenAI, Mistral) uniformly.
 *
 * @module lib/extraction-validation
 */

import { z } from 'zod';
import { logger } from '@/lib/logger';

/** Line item schema */
const LineItemSchema = z.object({
  description: z.string().min(1).max(2000),
  quantity: z.number().finite().nonnegative(),
  unitPrice: z.number().finite(),
  totalPrice: z.number().finite(),
  taxRate: z.number().finite().min(0).max(100).optional(),
  taxCategoryCode: z.string().max(10).optional(),
});

/** Allowance/charge schema */
const AllowanceChargeSchema = z
  .object({
    chargeIndicator: z.boolean().optional(),
    amount: z.number().finite().optional(),
    reason: z.string().max(500).optional(),
    taxCategoryCode: z.string().max(10).optional(),
    taxRate: z.number().finite().min(0).max(100).optional(),
  })
  .passthrough();

/** Main extraction output schema */
export const ExtractedInvoiceDataSchema = z
  .object({
    invoiceNumber: z.string().max(200).nullable(),
    invoiceDate: z.string().max(50).nullable(),
    buyerName: z.string().max(500).nullable(),
    buyerEmail: z.string().max(320).nullable(),
    buyerAddress: z.string().max(1000).nullable(),
    buyerCity: z.string().max(200).nullable().optional(),
    buyerPostalCode: z.string().max(50).nullable().optional(),
    buyerCountryCode: z.string().max(5).nullable().optional(),
    buyerTaxId: z.string().max(100).nullable(),
    buyerPhone: z.string().max(50).nullable().optional(),
    buyerVatId: z.string().max(100).nullable().optional(),
    buyerElectronicAddress: z.string().max(320).nullable().optional(),
    buyerElectronicAddressScheme: z.string().max(10).nullable().optional(),
    sellerName: z.string().max(500).nullable(),
    sellerEmail: z.string().max(320).nullable(),
    sellerAddress: z.string().max(1000).nullable(),
    sellerCity: z.string().max(200).nullable().optional(),
    sellerPostalCode: z.string().max(50).nullable().optional(),
    sellerCountryCode: z.string().max(5).nullable().optional(),
    sellerTaxId: z.string().max(100).nullable(),
    sellerVatId: z.string().max(100).nullable().optional(),
    sellerTaxNumber: z.string().max(100).nullable().optional(),
    sellerElectronicAddress: z.string().max(320).nullable().optional(),
    sellerElectronicAddressScheme: z.string().max(10).nullable().optional(),
    sellerIban: z.string().max(50).nullable().optional(),
    sellerBic: z.string().max(20).nullable().optional(),
    sellerPhone: z.string().max(50).nullable().optional(),
    bankName: z.string().max(200).nullable().optional(),
    lineItems: z.array(LineItemSchema).max(1000),
    subtotal: z.number().finite(),
    taxRate: z.number().finite().min(0).max(100).nullable().optional(),
    taxAmount: z.number().finite(),
    totalAmount: z.number().finite(),
    currency: z.string().min(1).max(10),
    paymentTerms: z.string().max(2000).nullable(),
    notes: z.string().max(5000).nullable(),
    confidence: z.number().finite().min(0).max(1).optional(),
    processingTimeMs: z.number().finite().nonnegative().optional(),
    documentTypeCode: z.coerce.string().max(10).optional(),
    buyerReference: z.string().max(500).nullable().optional(),
    sellerContactName: z.string().max(200).nullable().optional(),
    dueDate: z.string().max(50).nullable().optional(),
    allowanceCharges: z.array(AllowanceChargeSchema).max(100).optional(),
    precedingInvoiceReference: z.string().max(200).nullable().optional(),
    prepaidAmount: z.number().finite().nullable().optional(),
    billingPeriodStart: z.string().max(50).nullable().optional(),
    billingPeriodEnd: z.string().max(50).nullable().optional(),
    validationWarnings: z.array(z.string().max(500)).max(50).optional(),
  })
  .passthrough(); // Allow unknown fields but validate known ones

export interface ValidationResult {
  valid: boolean;
  data?: z.infer<typeof ExtractedInvoiceDataSchema>;
  errors?: string[];
}

/**
 * Validate AI extraction output against the strict schema.
 *
 * @param data - Raw extraction output from any AI provider
 * @param provider - Provider name for logging
 * @returns Validated data or error details
 */
export function validateExtractionOutput(data: unknown, provider: string): ValidationResult {
  const result = ExtractedInvoiceDataSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    logger.warn('AI extraction output validation failed', {
      provider,
      errorCount: errors.length,
      errors: errors.slice(0, 10), // Log first 10 errors
      audit: '#016',
    });
    return { valid: false, errors };
  }

  // Additional semantic checks
  const warnings: string[] = [];
  const validated = result.data;

  // Check: totalAmount should roughly equal subtotal + taxAmount
  if (validated.subtotal && validated.taxAmount != null && validated.totalAmount) {
    const expectedTotal = validated.subtotal + validated.taxAmount;
    const tolerance = Math.abs(expectedTotal) * 0.01 + 0.01; // 1% + 1 cent
    if (Math.abs(validated.totalAmount - expectedTotal) > tolerance) {
      warnings.push(
        `Total mismatch: ${validated.totalAmount} ≠ subtotal(${validated.subtotal}) + tax(${validated.taxAmount})`
      );
    }
  }

  // Check: line items total should roughly equal subtotal
  if (validated.lineItems.length > 0 && validated.subtotal) {
    const lineTotal = validated.lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const tolerance = Math.abs(lineTotal) * 0.02 + 0.01;
    if (Math.abs(lineTotal - validated.subtotal) > tolerance) {
      warnings.push(`Line items total(${lineTotal.toFixed(2)}) ≠ subtotal(${validated.subtotal})`);
    }
  }

  if (warnings.length > 0) {
    logger.info('AI extraction passed validation with warnings', {
      provider,
      warnings,
    });
  }

  return { valid: true, data: validated };
}
