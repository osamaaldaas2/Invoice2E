import { NextRequest, NextResponse } from 'next/server';
import { invoiceDbService } from '@/services/invoice.db.service';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { createUserScopedClient } from '@/lib/supabase.server';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';
import { toCanonicalInvoice } from '@/services/format/canonical-mapper';
import { validateForProfile } from '@/validation/validation-pipeline';
import { formatToProfileId } from '@/lib/format-utils';
import { detectFormatFromData } from '@/lib/format-field-config';
import { FORMAT_FIELD_CONFIG, type FormatFieldConfig } from '@/lib/format-field-config';
import { recomputeTotals, type MonetaryLineItem, type MonetaryAllowanceCharge } from '@/lib/monetary-validator';
import { roundMoney, moneyEqual } from '@/lib/monetary';
import type { OutputFormat } from '@/types/canonical-invoice';

/**
 * POST /api/invoices/batch-validate
 *
 * Format-aware validation: reads output_format from DB per extraction,
 * maps to CanonicalInvoice, and validates using the full profile pipeline.
 * Returns format-specific errors/warnings per extraction.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitId = `${getRequestIdentifier(request)}:batch-validate:${user.id}`;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'api');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
        { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
      );
    }

    const body = await request.json();
    const { extractionIds } = body;

    if (!Array.isArray(extractionIds) || extractionIds.length === 0 || extractionIds.length > 500) {
      return NextResponse.json(
        { success: false, error: 'extractionIds array required (1-500)' },
        { status: 400 }
      );
    }

    const userClient = await createUserScopedClient(user.id);
    const results: Array<{
      extractionId: string;
      invoiceNumber: string;
      errors: string[];
      warnings: string[];
      missingFields: string[];
      valid: boolean;
      outputFormat: string;
    }> = [];

    for (const extractionId of extractionIds) {
      try {
        const extraction = await invoiceDbService.getExtractionById(extractionId, userClient);
        if (extraction.userId !== user.id) continue;

        const data = extraction.extractionData as Record<string, unknown>;

        // Determine output format: DB column > extractionData field > auto-detect > default
        const outputFormat: OutputFormat =
          (extraction.outputFormat as OutputFormat) ||
          (data.outputFormat as OutputFormat) ||
          detectFormatFromData(data as Record<string, unknown>) ||
          'xrechnung-cii';

        // Auto-recompute totals from line items to fix AI extraction rounding errors
        const rawItems = Array.isArray(data.lineItems) ? data.lineItems as Record<string, unknown>[]
          : Array.isArray(data.line_items) ? data.line_items as Record<string, unknown>[] : [];

        const dataCopy = { ...data };
        if (rawItems.length > 0) {
          dataCopy.lineItems = rawItems;
          const monetaryLines: MonetaryLineItem[] = rawItems.map((item: Record<string, unknown>) => ({
            netAmount: roundMoney(Number(item.totalPrice ?? item.lineTotal ?? 0) || (Number(item.unitPrice || 0) * Number(item.quantity || 1))),
            taxRate: Number(item.taxRate ?? item.vatRate ?? data.taxRate ?? 19),
            taxCategoryCode: item.taxCategoryCode as string | undefined,
          }));

          const acList = Array.isArray(data.allowanceCharges) ? data.allowanceCharges as any[] : [];

          const monetaryAC: MonetaryAllowanceCharge[] = acList.map((ac: any) => ({
            chargeIndicator: Boolean(ac.chargeIndicator),
            amount: Number(ac.amount) || 0,
            taxRate: ac.taxRate != null ? Number(ac.taxRate) : undefined,
            taxCategoryCode: ac.taxCategoryCode as string | undefined,
          }));
          const recomputed = recomputeTotals(monetaryLines, monetaryAC);

          const storedSubtotal = Number(data.subtotal) || 0;
          const storedTaxAmount = Number(data.taxAmount) || 0;
          const storedTotal = Number(data.totalAmount) || 0;

          if (!moneyEqual(storedSubtotal, recomputed.subtotal, 0.02)) {
            dataCopy.subtotal = recomputed.subtotal;
          }
          if (!moneyEqual(storedTaxAmount, recomputed.taxAmount, 0.02)) {
            dataCopy.taxAmount = recomputed.taxAmount;
          }
          if (!moneyEqual(storedTotal, recomputed.totalAmount, 0.02)) {
            const storedSum = roundMoney(Number(dataCopy.subtotal) + Number(dataCopy.taxAmount));
            if (!moneyEqual(storedTotal, storedSum, 0.02)) {
              dataCopy.totalAmount = recomputed.totalAmount;
            }
          }
        }

        // Map to canonical and validate for the selected profile
        const canonical = toCanonicalInvoice(dataCopy, outputFormat);
        const profileId = formatToProfileId(outputFormat);
        const validationResult = validateForProfile(canonical, profileId);

        const errors = validationResult.errors.map(e => `[${e.ruleId}] ${e.message}`);
        const warnings = (validationResult.warnings ?? []).map(w => `[${w.ruleId}] ${w.message}`);

        // Determine missing fields based on format-specific requirements
        const missingFields = computeMissingFields(data, outputFormat);

        results.push({
          extractionId,
          invoiceNumber: String(data.invoiceNumber || `Invoice ${results.length + 1}`),
          errors,
          warnings,
          missingFields,
          valid: errors.length === 0,
          outputFormat,
        });
      } catch (err) {
        logger.warn('Batch validation failed for extraction', {
          extractionId,
          error: err instanceof Error ? err.message : String(err),
        });
        results.push({
          extractionId,
          invoiceNumber: 'Unknown',
          errors: ['Failed to validate extraction'],
          warnings: [],
          missingFields: [],
          valid: false,
          outputFormat: 'xrechnung-cii',
        });
      }
    }

    const allValid = results.every(r => r.valid);
    const errorCount = results.filter(r => !r.valid).length;

    return NextResponse.json({
      success: true,
      data: {
        allValid,
        total: results.length,
        errorCount,
        results,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Batch validation error', { includeSuccess: true });
  }
}

/**
 * Compute missing applyable fields based on format-specific field requirements.
 * Uses FORMAT_FIELD_CONFIG to check which fields are 'required' for the given format.
 */
function computeMissingFields(data: Record<string, unknown>, outputFormat: OutputFormat): string[] {
  const config: FormatFieldConfig = FORMAT_FIELD_CONFIG[outputFormat] ?? FORMAT_FIELD_CONFIG['xrechnung-cii'];
  const missing: string[] = [];

  // Map config keys to data keys and check presence
  const fieldChecks: Array<{ configKey: keyof FormatFieldConfig; dataKey: string }> = [
    { configKey: 'sellerPhone', dataKey: 'sellerPhone' },
    { configKey: 'sellerEmail', dataKey: 'sellerEmail' },
    { configKey: 'sellerContactName', dataKey: 'sellerContactName' },
    { configKey: 'sellerIban', dataKey: 'sellerIban' },
    { configKey: 'sellerVatId', dataKey: 'sellerVatId' },
    { configKey: 'sellerStreet', dataKey: 'sellerStreet' },
    { configKey: 'sellerCity', dataKey: 'sellerCity' },
    { configKey: 'sellerPostalCode', dataKey: 'sellerPostalCode' },
    { configKey: 'sellerCountryCode', dataKey: 'sellerCountryCode' },
    { configKey: 'buyerStreet', dataKey: 'buyerStreet' },
    { configKey: 'buyerCity', dataKey: 'buyerCity' },
    { configKey: 'buyerPostalCode', dataKey: 'buyerPostalCode' },
    { configKey: 'buyerCountryCode', dataKey: 'buyerCountryCode' },
    { configKey: 'buyerVatId', dataKey: 'buyerVatId' },
    { configKey: 'buyerReference', dataKey: 'buyerReference' },
    { configKey: 'buyerElectronicAddress', dataKey: 'buyerElectronicAddress' },
    { configKey: 'paymentTerms', dataKey: 'paymentTerms' },
  ];

  for (const { configKey, dataKey } of fieldChecks) {
    const visibility = config[configKey as keyof Omit<FormatFieldConfig, 'hints'>];
    if (visibility === 'required') {
      const val = data[dataKey];
      // Also check with sellerPhone vs sellerPhoneNumber variant
      const altKey = dataKey === 'sellerPhone' ? 'sellerPhoneNumber' : null;
      const altVal = altKey ? data[altKey] : null;
      // For sellerStreet, also check sellerAddress
      const altKey2 = dataKey === 'sellerStreet' ? 'sellerAddress' : dataKey === 'buyerStreet' ? 'buyerAddress' : null;
      const altVal2 = altKey2 ? data[altKey2] : null;

      if (!val && !altVal && !altVal2) {
        missing.push(dataKey);
      }
    }
  }

  // Special: sellerVatId OR sellerTaxNumber (at least one) for formats that require it
  if (config.sellerVatId === 'required' && missing.includes('sellerVatId')) {
    if (data.sellerTaxNumber || data.sellerTaxId) {
      // Has an alternative tax ID — remove from missing
      const idx = missing.indexOf('sellerVatId');
      if (idx >= 0) missing.splice(idx, 1);
    }
  }

  return [...new Set(missing)];
}
