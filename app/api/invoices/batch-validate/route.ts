import { NextRequest, NextResponse } from 'next/server';
import { invoiceDbService } from '@/services/invoice.db.service';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { createUserScopedClient } from '@/lib/supabase.server';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { xrechnungValidator } from '@/services/xrechnung/validator';
import { logger } from '@/lib/logger';
import type { XRechnungInvoiceData } from '@/services/xrechnung/types';
import { recomputeTotals, type MonetaryLineItem, type MonetaryAllowanceCharge } from '@/lib/monetary-validator';
import { roundMoney, moneyEqual } from '@/lib/monetary';

/**
 * POST /api/invoices/batch-validate
 *
 * Validates extraction data using the **real** XRechnung validation pipeline
 * (EN 16931 compliance checks including BR-CO-10, BR-CO-14-SUM, PEPPOL rules).
 *
 * This uses `validateInvoiceDataSafe()` — which returns structured results
 * WITHOUT throwing — so we can report all errors per invoice.
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
    }> = [];

    for (const extractionId of extractionIds) {
      try {
        const extraction = await invoiceDbService.getExtractionById(extractionId, userClient);
        if (extraction.userId !== user.id) continue;

        const data = extraction.extractionData as Record<string, unknown>;

        // Map extraction data to XRechnungInvoiceData for the real validator
        const invoiceData: XRechnungInvoiceData = {
          invoiceNumber: String(data.invoiceNumber || ''),
          invoiceDate: String(data.invoiceDate || ''),
          sellerName: String(data.sellerName || ''),
          sellerEmail: (data.sellerEmail as string) || null,
          sellerPhone: (data.sellerPhone as string) || (data.sellerPhoneNumber as string) || null,
          sellerAddress: (data.sellerAddress as string) || (data.sellerStreet as string) || null,
          sellerCity: (data.sellerCity as string) || null,
          sellerPostalCode: (data.sellerPostalCode as string) || null,
          sellerCountryCode: (data.sellerCountryCode as string) || 'DE',
          sellerTaxId: (data.sellerTaxId as string) || null,
          sellerTaxNumber: (data.sellerTaxNumber as string) || null,
          sellerVatId: (data.sellerVatId as string) || null,
          sellerIban: (data.sellerIban as string) || null,
          sellerBic: (data.sellerBic as string) || null,
          sellerContactName: (data.sellerContactName as string) || null,
          sellerElectronicAddress: (data.sellerElectronicAddress as string) || (data.sellerEmail as string) || null,
          sellerElectronicAddressScheme: (data.sellerElectronicAddressScheme as string) || ((data.sellerEmail) ? 'EM' : null),
          buyerName: (data.buyerName as string) || null,
          buyerEmail: (data.buyerEmail as string) || null,
          buyerAddress: (data.buyerAddress as string) || (data.buyerStreet as string) || null,
          buyerCity: (data.buyerCity as string) || null,
          buyerPostalCode: (data.buyerPostalCode as string) || null,
          buyerCountryCode: (data.buyerCountryCode as string) || 'DE',
          buyerReference: (data.buyerReference as string) || null,
          buyerElectronicAddress: (data.buyerElectronicAddress as string) || (data.buyerEmail as string) || null,
          buyerElectronicAddressScheme: (data.buyerElectronicAddressScheme as string) || ((data.buyerEmail) ? 'EM' : null),
          lineItems: Array.isArray(data.lineItems)
            ? data.lineItems
            : Array.isArray(data.line_items)
              ? data.line_items
              : [],
          subtotal: data.subtotal != null ? Number(data.subtotal) : null,
          taxRate: data.taxRate != null ? Number(data.taxRate) : null,
          taxAmount: data.taxAmount != null ? Number(data.taxAmount) : (data.tax_amount != null ? Number(data.tax_amount) : null),
          totalAmount: Number(data.totalAmount || data.total_amount || 0),
          currency: (data.currency as string) || 'EUR',
          paymentTerms: (data.paymentTerms as string) || null,
          dueDate: (data.dueDate as string) || null,
          notes: (data.notes as string) || null,
          allowanceCharges: Array.isArray(data.allowanceCharges) ? data.allowanceCharges : [],
        };

        // Auto-recompute totals from line items to fix AI extraction rounding errors
        const rawItems = invoiceData.lineItems || [];
        if (rawItems.length > 0) {
          const monetaryLines: MonetaryLineItem[] = rawItems.map((item: any) => ({
            netAmount: roundMoney(Number(item.totalPrice ?? item.lineTotal ?? 0) || (Number(item.unitPrice || 0) * Number(item.quantity || 1))),
            taxRate: Number(item.taxRate ?? item.vatRate ?? invoiceData.taxRate ?? 19),
            taxCategoryCode: item.taxCategoryCode,
          }));
          const monetaryAC: MonetaryAllowanceCharge[] = (invoiceData.allowanceCharges ?? []).map((ac: any) => ({
            chargeIndicator: ac.chargeIndicator,
            amount: Number(ac.amount) || 0,
            taxRate: ac.taxRate != null ? Number(ac.taxRate) : undefined,
            taxCategoryCode: ac.taxCategoryCode ?? undefined,
          }));
          const recomputed = recomputeTotals(monetaryLines, monetaryAC);

          // If stored subtotal/taxAmount/totalAmount deviate, use recomputed values
          const storedSubtotal = Number(invoiceData.subtotal) || 0;
          const storedTaxAmount = Number(invoiceData.taxAmount) || 0;
          const storedTotal = Number(invoiceData.totalAmount) || 0;

          if (!moneyEqual(storedSubtotal, recomputed.subtotal, 0.02)) {
            invoiceData.subtotal = recomputed.subtotal;
          }
          if (!moneyEqual(storedTaxAmount, recomputed.taxAmount, 0.02)) {
            invoiceData.taxAmount = recomputed.taxAmount;
          }
          // Only recompute total if subtotal+tax was corrected and total doesn't match
          if (!moneyEqual(storedTotal, recomputed.totalAmount, 0.02)) {
            // Keep stored total if it matches subtotal + tax (invoice total is authoritative)
            const storedSum = roundMoney(Number(invoiceData.subtotal) + Number(invoiceData.taxAmount));
            if (moneyEqual(storedTotal, storedSum, 0.02)) {
              // stored total is consistent with (possibly corrected) subtotal + tax — keep it
            } else {
              invoiceData.totalAmount = recomputed.totalAmount;
            }
          }
        }

        // Use the REAL XRechnung validator (safe version — no throw)
        const validationResult = xrechnungValidator.validateInvoiceDataSafe(invoiceData);

        const errors = validationResult.errors.map(e => `[${e.ruleId}] ${e.message}`);
        const warnings = validationResult.warnings.map(w => `[${w.ruleId}] ${w.message}`);

        // Determine missing fields from the errors for the "Apply to All" feature
        const missingFields: string[] = [];
        const fieldMappings: Record<string, string> = {
          'PEPPOL-EN16931-R010': 'buyerEmail',
          'BR-DE-15': 'buyerReference',
          'BR-DE-02': 'sellerPhone',
          'BR-DE-05': 'sellerEmail',
          'BR-DE-06': 'sellerCity',
          'BR-DE-07': 'sellerPostalCode',
          'BR-DE-09': 'sellerStreet',
          'BR-DE-10': 'paymentTerms',
        };
        for (const err of validationResult.errors) {
          const field = fieldMappings[err.ruleId];
          if (field) missingFields.push(field);
        }
        // Also check basic field presence for common applyable fields
        if (!invoiceData.sellerName) missingFields.push('sellerName');
        if (!invoiceData.sellerEmail) missingFields.push('sellerEmail');
        if (!invoiceData.buyerEmail) missingFields.push('buyerEmail');
        if (!invoiceData.sellerIban) missingFields.push('sellerIban');

        results.push({
          extractionId,
          invoiceNumber: invoiceData.invoiceNumber || `Invoice ${results.length + 1}`,
          errors,
          warnings,
          missingFields: [...new Set(missingFields)],
          valid: errors.length === 0,
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
