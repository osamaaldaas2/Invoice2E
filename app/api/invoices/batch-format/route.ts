import { NextRequest, NextResponse } from 'next/server';
import { invoiceDbService } from '@/services/invoice.db.service';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { createUserScopedClient } from '@/lib/supabase.server';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';
import { getAllFormats } from '@/lib/format-registry';
import type { OutputFormat } from '@/types/canonical-invoice';

const VALID_FORMATS = new Set<string>(getAllFormats().map((f) => f.id));

/**
 * POST /api/invoices/batch-format
 *
 * Bulk-assign an output format to one or more extractions.
 * Persists to DB (invoice_extractions.output_format) so the choice
 * survives page refresh and is authoritative for downstream validation
 * and generation.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const rateLimitId = `${getRequestIdentifier(request)}:batch-format:${user.id}`;
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

    const { batchFormatSchema, parseBody } = await import('@/lib/api-schemas');
    const parsed = await parseBody(request, batchFormatSchema);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
    const { extractionIds, outputFormat } = parsed.data;

    if (extractionIds.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Maximum 500 extractions per request' },
        { status: 400 }
      );
    }

    // Validate outputFormat
    if (typeof outputFormat !== 'string' || !VALID_FORMATS.has(outputFormat)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid outputFormat. Must be one of: ${[...VALID_FORMATS].join(', ')}`,
        },
        { status: 400 }
      );
    }

    const userClient = await createUserScopedClient(user.id);

    const updated = await invoiceDbService.updateExtractionFormats(
      extractionIds as string[],
      outputFormat as OutputFormat,
      userClient
    );

    logger.info('Batch format assignment', {
      userId: user.id,
      outputFormat,
      requested: extractionIds.length,
      updated,
    });

    return NextResponse.json({
      success: true,
      data: { updated, outputFormat },
    });
  } catch (error) {
    return handleApiError(error, 'Batch format assignment error', {
      includeSuccess: true,
    });
  }
}
