import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { invoiceDbService } from '@/services/invoice.db.service';
import { logger } from '@/lib/logger';
import { getAuthenticatedUser } from '@/lib/auth';
import { handleApiError } from '@/lib/api-helpers';
import { createUserScopedClient } from '@/lib/supabase.server';
import { recomputeTotals, type MonetaryLineItem, type MonetaryAllowanceCharge } from '@/lib/monetary-validator';
import { roundMoney, moneyEqual } from '@/lib/monetary';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';
import { toCanonicalInvoice } from '@/services/format/canonical-mapper';
import { detectFormatFromData } from '@/lib/format-field-config';
import { toLegacyFormat } from '@/lib/format-utils';
import type { OutputFormat } from '@/types/canonical-invoice';

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

    if (extractionIds.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Maximum 500 extractions per download' },
        { status: 400 }
      );
    }

    logger.info('Batch download started', {
      userId: user.id,
      count: extractionIds.length,
    });

    const userClient = await createUserScopedClient(user.id);

    const zip = new JSZip();
    const errors: { extractionId: string; error: string }[] = [];
    let successCount = 0;
    const usedFileNames = new Set<string>();

    for (const extractionId of extractionIds) {
      try {
        const extraction = await invoiceDbService.getExtractionById(extractionId, userClient);

        if (extraction.userId !== user.id) {
          errors.push({ extractionId, error: 'Access denied' });
          continue;
        }

        const { _originalExtraction: _snap, ...data } = extraction.extractionData as Record<
          string,
          unknown
        >;

        // Determine output format: DB column > extractionData > auto-detect > default
        const outputFormat: OutputFormat =
          (extraction.outputFormat as OutputFormat) ||
          (data.outputFormat as OutputFormat) ||
          detectFormatFromData(data as Record<string, unknown>) ||
          'xrechnung-cii';

        logger.info('Batch download - reading extraction', {
          extractionId,
          outputFormat,
          buyerEmail: data.buyerEmail,
          sellerEmail: data.sellerEmail,
        });

        // Build service data with defaults for missing required fields
        const serviceData = {
          ...data,
          invoiceNumber: data.invoiceNumber || `DRAFT-${extractionId.slice(0, 8)}`,
          invoiceDate: data.invoiceDate || new Date().toISOString().split('T')[0],
          sellerName: data.sellerName || 'Unknown Seller',
          sellerCountryCode: data.sellerCountryCode || 'DE',
          buyerCountryCode: data.buyerCountryCode || 'DE',
          totalAmount: Number(data.totalAmount) || 0,
          buyerEmail: data.buyerEmail || null,
          buyerElectronicAddress: data.buyerElectronicAddress || data.buyerEmail || null,
          buyerElectronicAddressScheme: data.buyerElectronicAddressScheme || (data.buyerEmail ? 'EM' : null),
          sellerEmail: data.sellerEmail || null,
          sellerElectronicAddress: data.sellerElectronicAddress || data.sellerEmail || null,
          sellerElectronicAddressScheme: data.sellerElectronicAddressScheme || (data.sellerEmail ? 'EM' : null),
        } as Record<string, unknown>;

        // Auto-recompute totals from line items to fix AI extraction rounding errors
        const rawLineItems = Array.isArray(serviceData.lineItems)
          ? serviceData.lineItems as Record<string, unknown>[]
          : Array.isArray(serviceData.line_items)
            ? serviceData.line_items as Record<string, unknown>[]
            : [];
        if (rawLineItems.length > 0) {
          serviceData.lineItems = rawLineItems;
          const monetaryLines: MonetaryLineItem[] = rawLineItems.map((item: Record<string, unknown>) => ({
            netAmount: roundMoney(Number(item.totalPrice ?? item.lineTotal ?? 0) || (Number(item.unitPrice || 0) * Number(item.quantity || 1))),
            taxRate: Number(item.taxRate ?? item.vatRate ?? serviceData.taxRate ?? 19),
            taxCategoryCode: item.taxCategoryCode as string | undefined,
          }));

          const acList = Array.isArray(serviceData.allowanceCharges) ? serviceData.allowanceCharges as any[] : [];

          const monetaryAC: MonetaryAllowanceCharge[] = acList.map((ac: any) => ({
            chargeIndicator: Boolean(ac.chargeIndicator),
            amount: Number(ac.amount) || 0,
            taxRate: ac.taxRate != null ? Number(ac.taxRate) : undefined,
            taxCategoryCode: ac.taxCategoryCode as string | undefined,
          }));
          const recomputed = recomputeTotals(monetaryLines, monetaryAC);

          const storedSubtotal = Number(serviceData.subtotal) || 0;
          const storedTaxAmount = Number(serviceData.taxAmount) || 0;
          const storedTotal = Number(serviceData.totalAmount) || 0;

          if (!moneyEqual(storedSubtotal, recomputed.subtotal, 0.02)) {
            serviceData.subtotal = recomputed.subtotal;
          }
          if (!moneyEqual(storedTaxAmount, recomputed.taxAmount, 0.02)) {
            serviceData.taxAmount = recomputed.taxAmount;
          }
          if (!moneyEqual(storedTotal, recomputed.totalAmount, 0.02)) {
            const storedSum = roundMoney(Number(serviceData.subtotal) + Number(serviceData.taxAmount));
            if (!moneyEqual(storedTotal, storedSum, 0.02)) {
              serviceData.totalAmount = recomputed.totalAmount;
            }
          }
        }

        // Map to canonical invoice model and generate via format-specific generator
        const canonical = toCanonicalInvoice(serviceData, outputFormat);
        const generator = GeneratorFactory.create(outputFormat);
        const result = await generator.generate(canonical);

        // Handle file naming and deduplication
        let fileName = result.fileName.replace(/[<>:"/\\|?*]/g, '_');
        if (usedFileNames.has(fileName)) {
          const extMatch = fileName.match(/\.[^.]+$/);
          const ext = extMatch ? extMatch[0] : '.xml';
          const base = fileName.slice(0, fileName.length - ext.length);
          let counter = 2;
          while (usedFileNames.has(`${base}_${counter}${ext}`)) counter++;
          fileName = `${base}_${counter}${ext}`;
        }
        usedFileNames.add(fileName);

        // Add to ZIP — handle PDF content for hybrid formats (Factur-X)
        if (result.pdfContent) {
          zip.file(fileName.replace(/\.xml$/i, '.pdf'), result.pdfContent);
        } else {
          zip.file(fileName, result.xmlContent);
        }
        successCount++;

        // Create/update conversion record with correct format
        const legacyFormat = toLegacyFormat(outputFormat);
        const existingConversion = await invoiceDbService.getConversionByExtractionId(extractionId, userClient);
        if (existingConversion) {
          await invoiceDbService.updateConversion(existingConversion.id, {
            conversionFormat: legacyFormat,
            outputFormat,
            conversionStatus: 'completed',
            validationStatus: result.validationStatus,
            validationErrors:
              result.validationErrors.length > 0
                ? ({ errors: result.validationErrors } as Record<string, unknown>)
                : undefined,
          }, userClient);
        } else {
          const conversion = await invoiceDbService.createConversion({
            userId: user.id,
            extractionId,
            invoiceNumber: String(data.invoiceNumber || data.invoice_number || ''),
            buyerName: String(data.buyerName || data.buyer_name || ''),
            conversionFormat: legacyFormat,
            outputFormat,
            conversionStatus: 'completed',
          }, userClient);
          await invoiceDbService.updateConversion(conversion.id, {
            validationStatus: result.validationStatus,
            validationErrors:
              result.validationErrors.length > 0
                ? ({ errors: result.validationErrors } as Record<string, unknown>)
                : undefined,
          }, userClient);
        }
        await invoiceDbService.updateExtraction(extractionId, { status: 'completed' }, userClient);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Generation failed';
        errors.push({ extractionId, error: msg });
        logger.warn('Failed to generate invoice for extraction', {
          extractionId,
          error: msg,
        });
      }
    }

    if (successCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No invoices could be converted',
          details: errors,
        },
        { status: 422 }
      );
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `${errors.length} of ${extractionIds.length} invoices failed. Fix all errors before downloading.`,
          code: 'VALIDATION_ERRORS',
          details: errors,
          successCount,
        },
        { status: 422 }
      );
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
        'Content-Disposition': `attachment; filename="invoices_batch.zip"`,
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
