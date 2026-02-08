import { NextRequest, NextResponse } from 'next/server';
import { ExtractorFactory } from '@/services/ai/extractor.factory';
import { invoiceDbService } from '@/services/invoice.db.service';
import { creditsDbService } from '@/services/credits.db.service';
import { boundaryDetectionService } from '@/services/boundary-detection.service';
import { pdfSplitterService } from '@/services/pdf-splitter.service';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { FILE_LIMITS } from '@/lib/constants';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkRateLimitAsync, getRequestIdentifier } from '@/lib/rate-limiter';
import { handleApiError } from '@/lib/api-helpers';

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
                { success: false, error: `Too many requests. Try again in ${rateLimit.resetInSeconds} seconds.` },
                {
                    status: 429,
                    headers: { 'Retry-After': String(rateLimit.resetInSeconds) }
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
            return NextResponse.json({
                success: false,
                error: `File size exceeds limit of ${FILE_LIMITS.MAX_FILE_SIZE_MB}MB`
            }, { status: 400 });
        }

        if (!(FILE_LIMITS.ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
            return NextResponse.json({
                success: false,
                error: 'Invalid file type. Only PDF, JPG, and PNG are allowed.'
            }, { status: 400 });
        }

        // Check credits before processing
        try {
            const credits = await creditsDbService.getUserCredits(userId);
            if (credits.availableCredits < 1) {
                return NextResponse.json(
                    { success: false, error: 'Insufficient credits. Please purchase more credits.' },
                    { status: 402 }
                );
            }
        } catch (e) {
            logger.error('Failed to check credits during extraction', { userId, error: e });
            // Fail safe - if we can't check credits, don't allow processing to be safe, 
            // or allow it? Let's be safe and block.
            return NextResponse.json(
                { success: false, error: 'Failed to verify credits' },
                { status: 500 }
            );
        }

        // Determine AI provider from env or default
        const aiProvider = process.env.AI_PROVIDER || 'deepseek';

        // SECURITY FIX: Removed API key prefix logging - never log any part of secrets
        logger.info('Environment Check', {
            aiProvider,
            deepseekKeyConfigured: !!process.env.DEEPSEEK_API_KEY,
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
            // Multi-invoice PDF: check credits, split, extract each
            const requiredCredits = boundaryResult.totalInvoices;
            try {
                const credits = await creditsDbService.getUserCredits(userId);
                if (credits.availableCredits < requiredCredits) {
                    return NextResponse.json(
                        { success: false, error: `This PDF contains ${requiredCredits} invoices but you only have ${credits.availableCredits} credits.` },
                        { status: 402 }
                    );
                }
            } catch (e) {
                logger.error('Failed to re-check credits for multi-invoice', { userId, error: e });
                return NextResponse.json(
                    { success: false, error: 'Failed to verify credits' },
                    { status: 500 }
                );
            }

            const pageGroups = boundaryResult.invoices.map(inv => inv.pages);
            const splitBuffers = await pdfSplitterService.splitByPageGroups(buffer, pageGroups);

            const extractions: { extractionId: string; label: string; confidence: number }[] = [];

            for (let i = 0; i < splitBuffers.length; i++) {
                const invoice = boundaryResult.invoices[i]!;
                const segmentBuffer = splitBuffers[i]!;
                const label = invoice.label;
                const segmentName = `${file.name} [${label}]`;

                try {
                    const extractedData = await extractor.extractFromFile(segmentBuffer, segmentName, file.type);

                    const extraction = await invoiceDbService.createExtraction({
                        userId,
                        extractionData: extractedData as unknown as Record<string, unknown>,
                        confidenceScore: extractedData.confidence,
                        geminiResponseTimeMs: extractedData.processingTimeMs,
                        status: 'draft',
                    });

                    await creditsDbService.deductCredits(userId, 1, 'extraction');

                    extractions.push({
                        extractionId: extraction.id,
                        label,
                        confidence: extractedData.confidence,
                    });
                } catch (segmentError) {
                    logger.error('Failed to extract invoice segment', {
                        index: i,
                        label,
                        error: segmentError instanceof Error ? segmentError.message : String(segmentError),
                    });
                    extractions.push({
                        extractionId: '',
                        label,
                        confidence: 0,
                    });
                }
            }

            logger.info('Multi-invoice extraction completed', {
                totalInvoices: boundaryResult.totalInvoices,
                successful: extractions.filter(e => e.extractionId).length,
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

        // Single invoice flow (existing behavior)
        const startTime = Date.now();
        let extractedData;
        try {
            extractedData = await extractor.extractFromFile(buffer, file.name, file.type);
        } catch (extractionError) {
            logger.error('Detailed extraction error information', {
                provider: extractor.getProviderName(),
                errorName: extractionError instanceof Error ? extractionError.constructor.name : 'Unknown',
                errorMessage: extractionError instanceof Error ? extractionError.message : String(extractionError),
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

        // Deduct credits AFTER successful extraction and save
        try {
            const deducted = await creditsDbService.deductCredits(userId, 1, 'extraction');
            if (!deducted) {
                try {
                    await invoiceDbService.deleteExtraction(extraction.id);
                } catch (cleanupError) {
                    logger.warn('Failed to cleanup extraction after credit deduction failure', {
                        extractionId: extraction.id,
                        userId,
                        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                    });
                }

                return NextResponse.json(
                    { success: false, error: 'Insufficient credits. Please purchase more credits.' },
                    { status: 402 }
                );
            }
        } catch (deductError) {
            logger.error('Failed to deduct credits after extraction', {
                extractionId: extraction.id,
                userId,
                error: deductError instanceof Error ? deductError.message : String(deductError),
            });
            return NextResponse.json(
                { success: false, error: 'Failed to deduct credits. Please try again.' },
                { status: 500 }
            );
        }

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
            message: 'Internal server error during extraction'
        });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
