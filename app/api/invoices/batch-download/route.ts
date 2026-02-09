import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { invoiceDbService } from '@/services/invoice.db.service';
import { xrechnungService } from '@/services/xrechnung.service';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { extractionIds } = body;

        if (!Array.isArray(extractionIds) || extractionIds.length === 0) {
            return NextResponse.json(
                { success: false, error: 'extractionIds array is required' },
                { status: 400 }
            );
        }

        if (extractionIds.length > 100) {
            return NextResponse.json(
                { success: false, error: 'Maximum 100 extractions per download' },
                { status: 400 }
            );
        }

        logger.info('Batch download started', {
            userId: user.id,
            count: extractionIds.length,
        });

        const zip = new JSZip();
        const errors: { extractionId: string; error: string }[] = [];
        let successCount = 0;

        for (const extractionId of extractionIds) {
            try {
                const extraction = await invoiceDbService.getExtractionById(extractionId);

                // Security: verify ownership
                if (extraction.userId !== user.id) {
                    errors.push({ extractionId, error: 'Access denied' });
                    continue;
                }

                const data = extraction.extractionData as Record<string, unknown>;

                // Map extracted data to XRechnung service format
                const serviceData = {
                    ...data,
                    supplierName: data.sellerName,
                    supplierEmail: data.sellerEmail,
                    supplierAddress: data.sellerAddress,
                    supplierTaxId: data.sellerTaxId,
                    items: data.lineItems,
                    invoiceNumber: data.invoiceNumber || `DRAFT-${extractionId.slice(0, 8)}`,
                    invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
                    sellerName: data.sellerName || 'Unknown Seller',
                    sellerCountryCode: data.sellerCountryCode || 'DE',
                    buyerCountryCode: data.buyerCountryCode || 'DE',
                    totalAmount: Number(data.totalAmount) || 0,
                } as Record<string, unknown>;

                const result = xrechnungService.generateXRechnung(serviceData as any);
                const fileName = result.fileName.replace(/[<>:"/\\|?*]/g, '_');
                zip.file(fileName, result.xmlContent);
                successCount++;

                // Create conversion record if one doesn't exist, then mark both as completed
                const existingConversion = await invoiceDbService.getConversionByExtractionId(extractionId);
                if (existingConversion) {
                    await invoiceDbService.updateConversion(existingConversion.id, {
                        conversionStatus: 'completed',
                        validationStatus: result.validationStatus,
                        validationErrors: result.validationErrors.length > 0
                            ? { errors: result.validationErrors } as Record<string, unknown>
                            : undefined,
                    });
                } else {
                    const conversion = await invoiceDbService.createConversion({
                        userId: user.id,
                        extractionId,
                        invoiceNumber: String(data.invoiceNumber || data.invoice_number || ''),
                        buyerName: String(data.buyerName || data.buyer_name || ''),
                        conversionFormat: 'XRechnung',
                        conversionStatus: 'completed',
                    });
                    await invoiceDbService.updateConversion(conversion.id, {
                        validationStatus: result.validationStatus,
                        validationErrors: result.validationErrors.length > 0
                            ? { errors: result.validationErrors } as Record<string, unknown>
                            : undefined,
                    });
                }
                await invoiceDbService.updateExtraction(extractionId, { status: 'completed' });
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Generation failed';
                errors.push({ extractionId, error: msg });
                logger.warn('Failed to generate XML for extraction', {
                    extractionId,
                    error: msg,
                });
            }
        }

        if (successCount === 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'No invoices could be converted to XRechnung XML',
                    details: errors,
                },
                { status: 422 }
            );
        }

        // Add summary file if there were errors
        if (errors.length > 0) {
            const summary = errors
                .map(e => `${e.extractionId}: ${e.error}`)
                .join('\n');
            zip.file('_errors.txt', `Failed to convert ${errors.length} invoice(s):\n\n${summary}`);
        }

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

        logger.info('Batch download completed', {
            userId: user.id,
            successful: successCount,
            failed: errors.length,
            zipSize: zipBuffer.length,
        });

        return new NextResponse(new Uint8Array(zipBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="invoices_xrechnung.zip"`,
                'Content-Length': String(zipBuffer.length),
            },
        });
    } catch (error) {
        return handleApiError(error, 'Batch download error', {
            includeSuccess: true,
            message: 'Failed to generate batch download',
        });
    }
}
