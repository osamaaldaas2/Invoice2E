import { NextRequest, NextResponse } from 'next/server';
import { invoiceDbService } from '@/services/invoice.db.service';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { createUserScopedClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';

/**
 * Fields safe to "Apply to all" — shared seller/buyer info that's likely the same
 * across all invoices in a batch. Invoice-specific fields (amounts, numbers, dates,
 * line items) are intentionally excluded.
 */
const ALLOWED_FIELDS = new Set([
  'sellerName',
  'sellerEmail',
  'sellerPhone',
  'sellerAddress',
  'sellerStreet',
  'sellerCity',
  'sellerPostalCode',
  'sellerCountryCode',
  'sellerTaxId',
  'sellerTaxNumber',
  'sellerVatId',
  'sellerIban',
  'sellerBic',
  'sellerContactName',
  'buyerName',
  'buyerEmail',
  'buyerAddress',
  'buyerStreet',
  'buyerCity',
  'buyerPostalCode',
  'buyerCountryCode',
  'buyerTaxId',
  'buyerReference',
  'paymentTerms',
  'paymentInstructions',
  'currency',
]);

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimitId = `${getRequestIdentifier(request)}:batch-apply:${user.id}`;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'api');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.`,
        },
        { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
      );
    }

    const { batchApplySchema, parseBody } = await import('@/lib/api-schemas');
    const parsed = await parseBody(request, batchApplySchema);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { extractionIds, fields } = parsed.data;

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { success: false, error: 'fields object is required' },
        { status: 400 }
      );
    }

    // Filter to only allowed fields
    const safeFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (ALLOWED_FIELDS.has(key) && typeof value === 'string' && value.trim()) {
        safeFields[key] = value.trim();
      }
    }

    if (Object.keys(safeFields).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to apply' },
        { status: 400 }
      );
    }

    const userClient = await createUserScopedClient(user.id);
    let updatedCount = 0;
    let skippedCount = 0;

    for (const extractionId of extractionIds) {
      try {
        const extraction = await invoiceDbService.getExtractionById(extractionId, userClient);
        if (extraction.userId !== user.id) continue;

        const data = extraction.extractionData as Record<string, unknown>;
        const updates: Record<string, string> = {};

        // Only fill in fields that are currently missing/empty
        for (const [key, value] of Object.entries(safeFields)) {
          const current = data[key];
          // Check if field is truly empty/missing (handles null, undefined, empty string, but NOT numeric 0)
          const isEmptyOrNull =
            current === null ||
            current === undefined ||
            (typeof current === 'string' && current.trim() === '');

          if (isEmptyOrNull) {
            updates[key] = value;
          }
        }

        if (Object.keys(updates).length === 0) {
          skippedCount++;
          continue;
        }

        // Merge updates into extraction data
        const updatedData = { ...data, ...updates };
        await invoiceDbService.updateExtraction(
          extractionId,
          { extractionData: updatedData },
          userClient
        );

        // DIAGNOSTIC: Log what we just updated
        logger.info('Batch apply - updated extraction', {
          extractionId,
          fieldsUpdated: Object.keys(updates),
          buyerEmailBefore: data.buyerEmail,
          buyerEmailAfter: updatedData.buyerEmail,
        });

        updatedCount++;
      } catch (err) {
        logger.warn('Failed to apply fields to extraction', {
          extractionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('Batch apply completed', {
      userId: user.id,
      fieldsApplied: Object.keys(safeFields),
      updated: updatedCount,
      skipped: skippedCount,
      total: extractionIds.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        updated: updatedCount,
        skipped: skippedCount,
        fieldsApplied: Object.keys(safeFields),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Batch apply error', { includeSuccess: true });
  }
}
