/**
 * Batch Download API Route
 * Secure download endpoint with signed URL verification
 *
 * FIX (BUG-031): Prevents unauthorized access to download URLs
 *
 * @route /api/invoices/bulk-upload/download
 */

import { NextRequest, NextResponse } from 'next/server';
import { batchService } from '@/services/batch.service';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { verifySignedDownloadToken } from '@/lib/session';
import { handleApiError } from '@/lib/api-helpers';

/**
 * GET /api/invoices/bulk-upload/download
 * Download batch results as ZIP file
 * Requires both authentication AND a valid signed token
 */
export async function GET(req: NextRequest) {
    try {
        // First, authenticate the user
        const user = await getAuthenticatedUser(req);
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const batchId = searchParams.get('batchId');
        const token = searchParams.get('token');

        if (!batchId) {
            return NextResponse.json(
                { error: 'Batch ID is required' },
                { status: 400 }
            );
        }

        if (!token) {
            return NextResponse.json(
                { error: 'Download token is required' },
                { status: 400 }
            );
        }

        // Verify the signed download token
        const tokenPayload = verifySignedDownloadToken(
            token,
            user.id,
            'batch',
            batchId
        );

        if (!tokenPayload) {
            logger.warn('Invalid or expired download token', { userId: user.id, batchId });
            return NextResponse.json(
                { error: 'Invalid or expired download link. Please request a new download URL.' },
                { status: 403 }
            );
        }

        // Get batch status and verify ownership
        const status = await batchService.getBatchStatus(user.id, batchId);

        if (!status) {
            return NextResponse.json(
                { error: 'Batch job not found' },
                { status: 404 }
            );
        }

        // Only allow download of completed batches
        if (status.status !== 'completed' && status.status !== 'partial_success') {
            return NextResponse.json(
                { error: 'Batch job is not yet completed' },
                { status: 400 }
            );
        }

        // Filter successful results
        const successfulResults = status.results.filter(r => r.status === 'success');

        if (successfulResults.length === 0) {
            return NextResponse.json(
                { error: 'No successful conversions to download' },
                { status: 404 }
            );
        }

        // Generate ZIP with all successful XMLs
        const zipBuffer = await batchService.generateOutputZip(successfulResults);

        logger.info('Batch download initiated', {
            userId: user.id,
            batchId,
            fileCount: successfulResults.length
        });

        // Return ZIP file
        return new NextResponse(zipBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="batch_${batchId}_invoices.zip"`,
                'Content-Length': String(zipBuffer.length),
                // Security headers
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            },
        });
    } catch (error) {
        return handleApiError(error, 'Failed to download batch results', {
            message: 'Failed to download batch results'
        });
    }
}
