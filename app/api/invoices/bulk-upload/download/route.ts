/**
 * Batch Download API Route
 * Secure download endpoint with signed URL verification
 *
 * FIX (BUG-031): Prevents unauthorized access to download URLs
 *
 * @route /api/invoices/bulk-upload/download
 */

import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { batchService } from '@/services/batch.service';
import { invoiceDbService } from '@/services/invoice.db.service';
import { xrechnungService, type XRechnungInvoiceData } from '@/services/xrechnung.service';
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');
    const token = searchParams.get('token');

    if (!batchId) {
      return NextResponse.json({ error: 'Batch ID is required' }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ error: 'Download token is required' }, { status: 400 });
    }

    // Verify the signed download token
    const tokenPayload = verifySignedDownloadToken(token, user.id, 'batch', batchId);

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
      return NextResponse.json({ error: 'Batch job not found' }, { status: 404 });
    }

    // Only allow download of completed batches (or stuck-at-processing with all files done)
    const allProcessed =
      status.totalFiles > 0 && status.completedFiles + status.failedFiles >= status.totalFiles;
    if (status.status !== 'completed' && status.status !== 'partial_success' && !allProcessed) {
      return NextResponse.json({ error: 'Batch job is not yet completed' }, { status: 400 });
    }

    // Filter successful results that have extractionIds
    const successfulResults = status.results.filter(
      (r) => r.status === 'success' && r.extractionId
    );

    if (successfulResults.length === 0) {
      return NextResponse.json({ error: 'No successful conversions to download' }, { status: 404 });
    }

    // Generate XML on-the-fly from extraction data (same approach as batch-download route)
    const zip = new JSZip();
    const errors: { extractionId: string; error: string }[] = [];
    let successCount = 0;
    const usedFileNames = new Set<string>();

    for (const result of successfulResults) {
      const extractionId = result.extractionId!;
      try {
        const extraction = await invoiceDbService.getExtractionById(extractionId);

        if (extraction.userId !== user.id) {
          errors.push({ extractionId, error: 'Access denied' });
          continue;
        }

        // PERF-2: Check for cached XML first
        const existingConversion = await invoiceDbService.getConversionByExtractionId(extractionId);
        const cachedXml = (existingConversion as Record<string, unknown> | null)?.xml_content as
          | string
          | undefined;
        const cachedFileName = (existingConversion as Record<string, unknown> | null)
          ?.xml_file_name as string | undefined;

        let xmlContent: string;
        let xmlFileName: string;
        let validationStatus: string | undefined;

        if (cachedXml && cachedFileName) {
          xmlContent = cachedXml;
          xmlFileName = cachedFileName;
          logger.info('Using cached XML for batch download', { extractionId });
        } else {
          const { _originalExtraction: _snap, ...data } = extraction.extractionData as Record<
            string,
            unknown
          >;
          const serviceData = {
            ...data,
            invoiceNumber: data.invoiceNumber || `DRAFT-${extractionId.slice(0, 8)}`,
            invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
            sellerName: data.sellerName || 'Unknown Seller',
            sellerCountryCode: data.sellerCountryCode || 'DE',
            buyerCountryCode: data.buyerCountryCode || 'DE',
            totalAmount: Number(data.totalAmount) || 0,
          } as Record<string, unknown>;

          const xmlResult = await xrechnungService.generateXRechnung(
            serviceData as unknown as XRechnungInvoiceData
          );
          xmlContent = xmlResult.xmlContent;
          xmlFileName = xmlResult.fileName;
          validationStatus = xmlResult.validationStatus;

          // Cache the generated XML
          if (existingConversion) {
            await invoiceDbService.updateConversion(existingConversion.id, {
              xmlContent,
              xmlFileName,
            });
          }
        }

        let fileName = xmlFileName.replace(/[<>:"/\\|?*]/g, '_');
        // Deduplicate filenames to prevent ZIP overwrite
        if (usedFileNames.has(fileName)) {
          const base = fileName.replace(/\.xml$/i, '');
          let counter = 2;
          while (usedFileNames.has(`${base}_${counter}.xml`)) counter++;
          fileName = `${base}_${counter}.xml`;
        }
        usedFileNames.add(fileName);
        zip.file(fileName, xmlContent);
        successCount++;

        // Update extraction + conversion status to completed
        if (existingConversion) {
          await invoiceDbService.updateConversion(existingConversion.id, {
            conversionStatus: 'completed',
            ...(validationStatus ? { validationStatus } : {}),
          });
        }
        await invoiceDbService.updateExtraction(extractionId, { status: 'completed' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed';
        errors.push({ extractionId, error: msg });
        logger.warn('Failed to generate XML for batch extraction', { extractionId, error: msg });
      }
    }

    if (successCount === 0) {
      return NextResponse.json(
        { error: 'No invoices could be converted to XRechnung XML', details: errors },
        { status: 422 }
      );
    }

    // Add error summary if there were failures
    if (errors.length > 0) {
      const summary = errors.map((e) => `${e.extractionId}: ${e.error}`).join('\n');
      zip.file('_errors.txt', `Failed to convert ${errors.length} invoice(s):\n\n${summary}`);
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    logger.info('Batch download initiated', {
      userId: user.id,
      batchId,
      successful: successCount,
      failed: errors.length,
    });

    // Return ZIP file
    const body = new Uint8Array(zipBuffer);
    return new NextResponse(body, {
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
      message: 'Failed to download batch results',
    });
  }
}
