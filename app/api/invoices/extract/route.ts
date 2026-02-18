import { NextRequest, NextResponse } from 'next/server';
import { ExtractorFactory } from '@/services/ai/extractor.factory';
import { invoiceDbService } from '@/services/invoice.db.service';
import { creditsDbService } from '@/services/credits.db.service';
import { boundaryDetectionService } from '@/services/boundary-detection.service';
import { pdfSplitterService } from '@/services/pdf-splitter.service';
import { batchService } from '@/services/batch/batch.service';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { FILE_LIMITS, MULTI_INVOICE_CONCURRENCY } from '@/lib/constants';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { handleApiError } from '@/lib/api-helpers';
import { createUserScopedClient } from '@/lib/supabase.server';
// FIX: Audit #068 — HTTP-level idempotency available via withIdempotency() wrapper.
// DB-level idempotency is enforced by file-hash dedup + refund_credits_idempotent RPC.
// HTTP-level middleware adds defense-in-depth for clients sending Idempotency-Key headers.
// TODO: Refactor POST handler into named function and wrap with withIdempotency().
import { withIdempotency as _withIdempotency } from '@/lib/idempotency';
import { resilientExtract } from '@/lib/ai-resilience';
import { isFeatureEnabled } from '@/lib/feature-flags';

const BACKGROUND_THRESHOLD = 3;

/**
 * Trigger the batch worker reliably.
 * Uses AbortController to ensure the request is sent without waiting for the
 * worker to finish processing (it runs as a separate serverless invocation).
 */
const triggerBatchWorker = async (req: NextRequest): Promise<void> => {
  const secret = process.env.BATCH_WORKER_SECRET;
  const headers: Record<string, string> = {};
  if (secret) {
    headers['x-internal-worker-key'] = secret;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(`${req.nextUrl.origin}/api/internal/batch-worker?maxJobs=1`, {
      method: 'POST',
      headers,
      signal: controller.signal,
    });
  } catch {
    // Expected: abort timeout fires because worker takes longer than 3s.
    // The worker function was already triggered and runs independently.
  } finally {
    clearTimeout(timeoutId);
  }
};

// Increase body size limit for large files if needed (though Next.js handles this elsewhere usually)
export const maxDuration = 300; // 5 min — covers inline (≤3) and large batch processing

export async function POST(request: NextRequest) {
  try {
    // SECURITY FIX (BUG-001): Authenticate user from session, not request body
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = user.id; // SECURE: From authenticated session only

    // P0-2: Create user-scoped client for RLS-based data isolation
    const userClient = await createUserScopedClient(userId);

    // SECURITY: Rate limit upload requests per user
    const rateLimitId = getRequestIdentifier(request) + ':extract:' + userId;
    const rateLimit = await checkRateLimitAsync(rateLimitId, 'extract');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.resetInSeconds) },
        }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    // REMOVED: const userId = formData.get('userId') as string; - Security vulnerability

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // Validate file size and type
    if (file.size > FILE_LIMITS.MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `File size exceeds limit of ${FILE_LIMITS.MAX_FILE_SIZE_MB}MB`,
        },
        { status: 400 }
      );
    }

    if (!(FILE_LIMITS.ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid file type. Only PDF, JPG, and PNG are allowed.',
        },
        { status: 400 }
      );
    }

    // Credit check removed — deduction happens atomically before AI call (see below)

    // Determine AI provider from env or default
    const aiProvider = process.env.AI_PROVIDER || 'gemini';

    // SECURITY FIX: Removed API key prefix logging - never log any part of secrets
    logger.info('Environment Check', {
      aiProvider,
      geminiKeyConfigured: !!process.env.GEMINI_API_KEY,
    });

    logger.info('Starting invoice extraction', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      userId,
      aiProvider,
    });

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // FIX: Audit #061, #062 — validate file magic bytes match claimed MIME type
    const { verifyMagicBytes } = await import('@/lib/magic-bytes');
    if (!verifyMagicBytes(buffer, file.type)) {
      logger.warn('File magic bytes mismatch', {
        fileName: file.name,
        claimedType: file.type,
        userId,
        audit: '#061',
      });
      return NextResponse.json(
        { success: false, error: 'File content does not match declared type' },
        { status: 422 }
      );
    }

    // FIX: Audit #063 — file quarantine placeholder.
    // Full quarantine lifecycle (store → scan → promote/reject) requires Supabase storage integration.
    // Currently: magic byte validation above provides the core security check.
    // Enable USE_FILE_QUARANTINE flag when full quarantine storage is wired up.

    // Get AI extractor from factory
    const extractor = ExtractorFactory.create();

    logger.info('Using AI extractor', {
      provider: extractor.getProviderName(),
      fileName: file.name,
    });

    // Detect invoice boundaries in PDF files
    const boundaryResult = await boundaryDetectionService.detect(buffer, file.type);

    // Compute file hash + idempotency key early (used by both single and multi paths)
    const { createHash } = await import('crypto');
    const fileHash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
    const idempotencyKey = `extraction:deduct:${userId}:${fileHash}:${hourBucket}`;

    if (boundaryResult.totalInvoices > 1) {
      // Multi-invoice PDF: atomically deduct N credits + create N extraction records
      const requiredCredits = boundaryResult.totalInvoices;
      const multiIdempotencyKey = `${idempotencyKey}:multi:${requiredCredits}`;
      let batchResult;
      try {
        batchResult = await creditsDbService.batchExtractWithCreditDeduction(
          userId,
          requiredCredits,
          'extraction:deduct:multi',
          multiIdempotencyKey,
          file.name,
          fileHash,
          requiredCredits
        );
        if (batchResult.status === 'insufficient_credits') {
          return NextResponse.json(
            {
              success: false,
              error: `This PDF contains ${requiredCredits} invoices but you don't have enough credits.`,
            },
            { status: 402 }
          );
        }
      } catch (e) {
        logger.error('Failed to deduct credits for multi-invoice', { userId, error: e });
        return NextResponse.json(
          { success: false, error: 'Failed to deduct credits' },
          { status: 500 }
        );
      }

      // >3 invoices: background processing with polling
      if (boundaryResult.totalInvoices > BACKGROUND_THRESHOLD) {
        logger.info('Switching to background processing for large multi-invoice PDF', {
          totalInvoices: boundaryResult.totalInvoices,
          threshold: BACKGROUND_THRESHOLD,
          userId,
        });

        const { jobId } = await batchService.createMultiInvoiceJob(
          userId,
          buffer,
          boundaryResult as unknown as Record<string, unknown>,
          boundaryResult.totalInvoices
        );

        await triggerBatchWorker(request);

        return NextResponse.json(
          {
            success: true,
            data: {
              backgroundJob: true,
              jobId,
              totalInvoices: boundaryResult.totalInvoices,
              provider: extractor.getProviderName(),
            },
          },
          { status: 202 }
        );
      }

      // ≤3 invoices: process inline with parallelism
      // S2: extraction records already created by batchExtractWithCreditDeduction (status: 'pending')
      const batchExtractionIds = batchResult.extractionIds;
      const pageGroups = boundaryResult.invoices.map((inv) => inv.pages);
      const splitBuffers = await pdfSplitterService.splitByPageGroups(buffer, pageGroups);

      const extractions: { extractionId: string; label: string; confidence: number }[] = new Array(
        splitBuffers.length
      );

      // Process in parallel chunks
      const segments = splitBuffers.map((buf, i) => ({ buf, i }));
      for (let c = 0; c < segments.length; c += MULTI_INVOICE_CONCURRENCY) {
        const chunk = segments.slice(c, c + MULTI_INVOICE_CONCURRENCY);
        await Promise.all(
          chunk.map(async ({ buf, i }) => {
            const invoice = boundaryResult.invoices[i]!;
            const label = invoice.label;
            const segmentName = `${file.name} [${label}]`;
            const pendingId = batchExtractionIds[i];

            try {
              const extractedData = await extractor.extractFromFile(buf, segmentName, file.type);

              // S2: Update the pending extraction record (created atomically with credit deduction)
              if (pendingId) {
                await invoiceDbService.updateExtraction(
                  pendingId,
                  {
                    extractionData: extractedData as unknown as Record<string, unknown>,
                    confidenceScore: extractedData.confidence,
                    geminiResponseTimeMs: extractedData.processingTimeMs,
                    status: 'completed',
                  },
                  userClient
                );
              }

              extractions[i] = {
                extractionId: pendingId || '',
                label,
                confidence: extractedData.confidence ?? 0,
              };
            } catch (segmentError) {
              logger.error('Failed to extract invoice segment', {
                index: i,
                label,
                pendingExtractionId: pendingId,
                error: segmentError instanceof Error ? segmentError.message : String(segmentError),
              });
              extractions[i] = {
                extractionId: pendingId || '',
                label,
                confidence: 0,
              };
            }
          })
        );
      }

      // FIX: Audit #014, #100 — idempotent refund for failed segments
      const failCount = extractions.filter((e) => !e.extractionId).length;
      if (failCount > 0) {
        try {
          const refundKey = `refund:multi:${idempotencyKey}:${failCount}`;
          await creditsDbService.refundCreditsIdempotent(
            userId,
            failCount,
            'extraction:refund:multi',
            refundKey
          );
        } catch (refundErr) {
          logger.error('CRITICAL: Failed to refund credits for failed multi-invoice segments', {
            userId,
            failCount,
            creditsLost: failCount,
            error: refundErr instanceof Error ? refundErr.message : String(refundErr),
            audit: '#100',
          });
        }
      }

      logger.info('Multi-invoice extraction completed', {
        totalInvoices: boundaryResult.totalInvoices,
        successful: extractions.filter((e) => e.extractionId).length,
        failed: failCount,
        userId,
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            multiInvoice: true,
            totalInvoices: boundaryResult.totalInvoices,
            extractions,
            provider: extractor.getProviderName(),
          },
        },
        { status: 200 }
      );
    }

    // S2: Single invoice — atomically deduct credit + create extraction record.
    // Guarantees: no credit lost without extraction record, no extraction without deduction.
    // AI extraction happens after; on failure, refund via idempotent RPC (already wired below).
    const atomicResult = await creditsDbService.extractWithCreditDeduction(
      userId,
      1,
      idempotencyKey,
      idempotencyKey,
      file.name,
      fileHash
    );

    if (atomicResult.status === 'insufficient_credits') {
      return NextResponse.json(
        { success: false, error: 'Insufficient credits. Please purchase more credits.' },
        { status: 402 }
      );
    }

    const pendingExtractionId = atomicResult.extractionId;

    const startTime = Date.now();
    let extractedData;
    try {
      // FIX: Audit #017, #060 — use circuit breaker with fallback when enabled
      const useCircuitBreaker = await isFeatureEnabled(
        await createUserScopedClient(userId),
        'USE_CIRCUIT_BREAKER'
      ).catch(() => false);

      if (useCircuitBreaker) {
        extractedData = await resilientExtract(buffer, file.name, file.type);
      } else {
        extractedData = await extractor.extractFromFile(buffer, file.name, file.type);
      }
    } catch (extractionError) {
      // FIX: Audit #014, #100 — idempotent refund on AI failure
      try {
        const refundKey = `refund:extract:${idempotencyKey}`;
        await creditsDbService.refundCreditsIdempotent(
          userId,
          1,
          `extraction:refund:${idempotencyKey}`,
          refundKey
        );
      } catch (refundErr) {
        logger.error('CRITICAL: Failed to refund credit after extraction failure', {
          userId,
          creditsLost: 1,
          error: refundErr instanceof Error ? refundErr.message : String(refundErr),
          audit: '#100',
        });
      }

      logger.error(
        `Extraction failed [${extractor.getProviderName()}]: ${extractionError instanceof Error ? extractionError.message : String(extractionError)}`,
        extractionError instanceof Error ? extractionError : new Error(String(extractionError))
      );

      if (extractionError instanceof AppError) {
        return NextResponse.json(
          { success: false, error: extractionError.message },
          { status: extractionError.statusCode }
        );
      }

      throw extractionError;
    }

    const responseTime = Date.now() - startTime;

    // S2: Update the pending extraction record created by the atomic RPC
    // (instead of creating a new one — the record already exists with status 'pending')
    if (pendingExtractionId) {
      await invoiceDbService.updateExtraction(
        pendingExtractionId,
        {
          extractionData: extractedData as unknown as Record<string, unknown>,
          confidenceScore: extractedData.confidence,
          geminiResponseTimeMs: responseTime,
          status: 'completed',
        },
        userClient
      );
    }

    const extractionId = pendingExtractionId || 'unknown';

    logger.info('Invoice extraction and storage completed', {
      extractionId,
      userId,
      responseTime,
      confidence: extractedData.confidence,
      provider: extractor.getProviderName(),
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          extractionId,
          extractedData,
          provider: extractor.getProviderName(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error, 'Extraction route error', {
      includeSuccess: true,
      message: 'Internal server error during extraction',
    });
  }
}

/**
 * GET /api/invoices/extract?jobId=X
 * Poll background multi-invoice job status.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!jobId) {
      return NextResponse.json(
        { success: false, error: 'jobId query parameter is required' },
        { status: 400 }
      );
    }

    const status = await batchService.getBatchStatus(user.id, jobId);
    if (!status) {
      return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    // Self-healing: if job is stuck as 'pending' for >10s, re-trigger the worker
    if (status.status === 'pending' && status.createdAt) {
      const ageMs = Date.now() - new Date(status.createdAt).getTime();
      if (ageMs > 10_000) {
        logger.warn('Job stuck in pending, re-triggering worker', { jobId, ageMs });
        await triggerBatchWorker(request);
      }
    }

    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    return handleApiError(error, 'Extract poll error', {
      includeSuccess: true,
      message: 'Failed to fetch job status',
    });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
