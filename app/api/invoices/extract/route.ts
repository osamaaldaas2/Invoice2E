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
export const maxDuration = 60; // Set max duration to 60 seconds for AI processing

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

    // Get AI extractor from factory
    const extractor = ExtractorFactory.create();

    logger.info('Using AI extractor', {
      provider: extractor.getProviderName(),
      fileName: file.name,
    });

    // Detect invoice boundaries in PDF files
    const boundaryResult = await boundaryDetectionService.detect(buffer, file.type);

    if (boundaryResult.totalInvoices > 1) {
      // Multi-invoice PDF: deduct all credits atomically upfront
      const requiredCredits = boundaryResult.totalInvoices;
      try {
        const deducted = await creditsDbService.deductCredits(
          userId,
          requiredCredits,
          `extraction:multi`
        );
        if (!deducted) {
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

            try {
              const extractedData = await extractor.extractFromFile(buf, segmentName, file.type);

              const extraction = await invoiceDbService.createExtraction({
                userId,
                extractionData: extractedData as unknown as Record<string, unknown>,
                confidenceScore: extractedData.confidence,
                geminiResponseTimeMs: extractedData.processingTimeMs,
                status: 'draft',
              });

              // Credits already deducted upfront — no per-segment deduction

              extractions[i] = {
                extractionId: extraction.id,
                label,
                confidence: extractedData.confidence ?? 0,
              };
            } catch (segmentError) {
              logger.error('Failed to extract invoice segment', {
                index: i,
                label,
                error: segmentError instanceof Error ? segmentError.message : String(segmentError),
              });
              extractions[i] = {
                extractionId: '',
                label,
                confidence: 0,
              };
            }
          })
        );
      }

      // Refund credits for failed segments
      const failCount = extractions.filter((e) => !e.extractionId).length;
      if (failCount > 0) {
        try {
          await creditsDbService.addCredits(userId, failCount, 'extraction_refund:multi');
        } catch (refundErr) {
          logger.error('Failed to refund credits for failed multi-invoice segments', {
            userId,
            failCount,
            error: refundErr instanceof Error ? refundErr.message : String(refundErr),
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

    // Single invoice flow — deduct credit BEFORE AI call to prevent double-spend
    const deducted = await creditsDbService.deductCredits(userId, 1, 'extraction');
    if (!deducted) {
      return NextResponse.json(
        { success: false, error: 'Insufficient credits. Please purchase more credits.' },
        { status: 402 }
      );
    }

    const startTime = Date.now();
    let extractedData;
    try {
      extractedData = await extractor.extractFromFile(buffer, file.name, file.type);
    } catch (extractionError) {
      // Refund the pre-deducted credit on AI failure
      try {
        await creditsDbService.addCredits(userId, 1, 'extraction_refund');
      } catch (refundErr) {
        logger.error('Failed to refund credit after extraction failure', {
          userId,
          error: refundErr instanceof Error ? refundErr.message : String(refundErr),
        });
      }

      logger.error('Detailed extraction error information', {
        provider: extractor.getProviderName(),
        errorName: extractionError instanceof Error ? extractionError.constructor.name : 'Unknown',
        errorMessage:
          extractionError instanceof Error ? extractionError.message : String(extractionError),
        errorStack: extractionError instanceof Error ? extractionError.stack : undefined,
        ...(extractionError instanceof AppError && {
          appErrorCode: extractionError.name,
          appErrorStatus: extractionError.statusCode,
        }),
      });

      if (extractionError instanceof AppError) {
        return NextResponse.json(
          { success: false, error: extractionError.message },
          { status: extractionError.statusCode }
        );
      }

      throw extractionError;
    }

    const responseTime = Date.now() - startTime;

    // Save extraction to database
    const extraction = await invoiceDbService.createExtraction({
      userId,
      extractionData: extractedData as unknown as Record<string, unknown>,
      confidenceScore: extractedData.confidence,
      geminiResponseTimeMs: responseTime,
      status: 'draft',
    });

    // Credits already deducted before AI call — no post-extraction deduction needed

    logger.info('Invoice extraction and storage completed', {
      extractionId: extraction.id,
      userId,
      responseTime,
      confidence: extractedData.confidence,
      provider: extractor.getProviderName(),
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          extractionId: extraction.id,
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
