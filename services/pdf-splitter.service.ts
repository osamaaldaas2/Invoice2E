import { PDFDocument } from 'pdf-lib';
import { logger } from '@/lib/logger';

/**
 * PDF splitting utility using pdf-lib.
 * Splits a multi-page PDF into separate PDFs by page groups.
 */
export class PdfSplitterService {
    /**
     * Get the page count of a PDF buffer without fully parsing it.
     */
    async getPageCount(buffer: Buffer): Promise<number> {
        const pdf = await PDFDocument.load(new Uint8Array(buffer), { ignoreEncryption: true });
        return pdf.getPageCount();
    }

    /**
     * Split a PDF into multiple PDFs based on page groupings.
     * @param sourceBuffer - The original PDF buffer
     * @param pageGroups - Array of page number arrays (1-based), e.g. [[1,2], [3], [4,5]]
     * @returns Array of PDF buffers, one per group
     */
    async splitByPageGroups(sourceBuffer: Buffer, pageGroups: number[][]): Promise<Buffer[]> {
        const sourcePdf = await PDFDocument.load(new Uint8Array(sourceBuffer), { ignoreEncryption: true });
        const results: Buffer[] = [];

        for (const pages of pageGroups) {
            const newPdf = await PDFDocument.create();
            const pageIndices = pages.map(p => p - 1); // Convert 1-based to 0-based
            const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
            copiedPages.forEach(page => newPdf.addPage(page));
            const pdfBytes = await newPdf.save();
            results.push(Buffer.from(pdfBytes));
        }

        logger.info('PDF split completed', {
            sourcePages: sourcePdf.getPageCount(),
            groups: pageGroups.length,
            groupSizes: pageGroups.map(g => g.length),
        });

        return results;
    }
}

export const pdfSplitterService = new PdfSplitterService();
