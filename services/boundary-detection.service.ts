import { logger } from '@/lib/logger';
import { BOUNDARY_DETECTION_PROMPT } from '@/lib/boundary-detection-prompt';
import { MAX_PAGES_FOR_BOUNDARY_DETECTION } from '@/lib/constants';
import { pdfSplitterService } from './pdf-splitter.service';
import { geminiAdapter } from '@/adapters/gemini.adapter';
import { deepseekAdapter } from '@/adapters/deepseek.adapter';

export interface InvoiceBoundary {
    invoiceIndex: number;
    pages: number[];
    label: string;
}

export interface BoundaryDetectionResult {
    totalInvoices: number;
    totalPages: number;
    invoices: InvoiceBoundary[];
    confidence: number;
    pdfPageCount: number;
    provider: string;
}

export class BoundaryDetectionService {
    /**
     * Detect invoice boundaries in a PDF.
     * Returns page groupings for each invoice found.
     * Short-circuits for single-page PDFs, non-PDFs, and oversized PDFs.
     */
    async detect(buffer: Buffer, mimeType: string): Promise<BoundaryDetectionResult> {
        // Non-PDF files are always single invoice
        if (mimeType !== 'application/pdf') {
            return this.singleInvoiceFallback(1, 'skip-non-pdf');
        }

        // Count pages
        let pageCount: number;
        try {
            pageCount = await pdfSplitterService.getPageCount(buffer);
        } catch (error) {
            logger.error('Failed to count PDF pages', { error });
            return this.singleInvoiceFallback(1, 'page-count-error');
        }

        // Single-page PDF — no boundary detection needed
        if (pageCount <= 1) {
            return this.singleInvoiceFallback(pageCount, 'single-page');
        }

        // Too many pages — skip detection
        if (pageCount > MAX_PAGES_FOR_BOUNDARY_DETECTION) {
            logger.warn('PDF too large for boundary detection', { pageCount, max: MAX_PAGES_FOR_BOUNDARY_DETECTION });
            return this.singleInvoiceFallback(pageCount, 'too-many-pages');
        }

        // Pick the adapter (same as extraction)
        const aiProvider = process.env.AI_PROVIDER || 'deepseek';
        const adapter = aiProvider === 'gemini' ? geminiAdapter : deepseekAdapter;

        try {
            logger.info('Starting boundary detection', { pageCount, provider: aiProvider });

            const rawText = await adapter.sendPrompt(buffer, mimeType, BOUNDARY_DETECTION_PROMPT);
            const parsed = this.parseResponse(rawText);
            const validated = this.validate(parsed, pageCount);

            if (validated.confidence < 0.5) {
                logger.warn('Low confidence boundary detection, using fallback', {
                    confidence: validated.confidence,
                    pageCount,
                });
                return this.singleInvoiceFallback(pageCount, 'low-confidence');
            }

            logger.info('Boundary detection completed', {
                totalInvoices: validated.totalInvoices,
                pageCount,
                confidence: validated.confidence,
            });

            return {
                ...validated,
                pdfPageCount: pageCount,
                provider: aiProvider,
            };
        } catch (error) {
            logger.error('Boundary detection failed, using fallback', {
                error: error instanceof Error ? error.message : String(error),
                pageCount,
            });
            return this.singleInvoiceFallback(pageCount, 'error');
        }
    }

    private parseResponse(rawText: string): { totalInvoices: number; totalPages: number; invoices: InvoiceBoundary[]; confidence: number } {
        let text = rawText.trim();
        if (text.startsWith('```json')) {
            text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        } else if (text.startsWith('```')) {
            text = text.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in boundary detection response');
        }

        const data = JSON.parse(jsonMatch[0]);

        if (!data.invoices || !Array.isArray(data.invoices)) {
            throw new Error('Missing invoices array in boundary detection response');
        }

        return {
            totalInvoices: Number(data.totalInvoices) || data.invoices.length,
            totalPages: Number(data.totalPages) || 0,
            invoices: data.invoices.map((inv: any, i: number) => ({
                invoiceIndex: Number(inv.invoiceIndex) || i + 1,
                pages: Array.isArray(inv.pages) ? inv.pages.map(Number) : [],
                label: String(inv.label || `Invoice ${i + 1}`),
            })),
            confidence: Number(data.confidence) || 0.5,
        };
    }

    private validate(
        data: { totalInvoices: number; totalPages: number; invoices: InvoiceBoundary[]; confidence: number },
        actualPageCount: number
    ): { totalInvoices: number; totalPages: number; invoices: InvoiceBoundary[]; confidence: number } {
        // Check all pages 1..N are covered exactly once
        const allPages = new Set<number>();
        for (const inv of data.invoices) {
            for (const page of inv.pages) {
                if (allPages.has(page)) {
                    throw new Error(`Duplicate page ${page} in boundary detection`);
                }
                if (page < 1 || page > actualPageCount) {
                    throw new Error(`Page ${page} out of range (1-${actualPageCount})`);
                }
                allPages.add(page);
            }

            // Check contiguity
            for (let i = 1; i < inv.pages.length; i++) {
                if (inv.pages[i]! !== inv.pages[i - 1]! + 1) {
                    throw new Error(`Non-contiguous pages in invoice ${inv.invoiceIndex}: ${inv.pages}`);
                }
            }
        }

        if (allPages.size !== actualPageCount) {
            throw new Error(`Pages covered (${allPages.size}) does not match actual page count (${actualPageCount})`);
        }

        return data;
    }

    private singleInvoiceFallback(pageCount: number, reason: string): BoundaryDetectionResult {
        return {
            totalInvoices: 1,
            totalPages: pageCount,
            invoices: [{
                invoiceIndex: 1,
                pages: Array.from({ length: pageCount }, (_, i) => i + 1),
                label: 'Single document',
            }],
            confidence: 1.0,
            pdfPageCount: pageCount,
            provider: reason,
        };
    }
}

export const boundaryDetectionService = new BoundaryDetectionService();
