/**
 * Phase 1: PDF Text Extraction
 * Uses unpdf (serverless-compatible pdfjs) to extract text from digital PDFs.
 * If text < 50 chars/page avg → likely scanned, returns hasText: false.
 */

import { logger } from '@/lib/logger';

export interface PdfTextExtractionResult {
  hasText: boolean;
  text: string;
  pageCount: number;
}

export interface PdfPagedTextResult {
  hasText: boolean;
  pages: { pageNumber: number; text: string }[];
  pageCount: number;
}

const MIN_CHARS_PER_PAGE = 50;

/**
 * Extract text with page markers — used for boundary detection.
 * Returns per-page text array so callers can add "--- PAGE N ---" markers.
 */
export async function extractPagedTextFromPdf(pdfBuffer: Buffer): Promise<PdfPagedTextResult> {
  try {
    const { extractText: extract } = await import('unpdf');
    const data = new Uint8Array(pdfBuffer);
    const result = await extract(data);

    const pageCount = result.totalPages || 1;
    const rawPages = Array.isArray(result.text) ? result.text : [String(result.text || '')];
    const totalText = rawPages.join('');
    const avgCharsPerPage = totalText.length / pageCount;
    const hasText = avgCharsPerPage >= MIN_CHARS_PER_PAGE;

    if (!hasText) return { hasText: false, pages: [], pageCount };

    const pages = rawPages.map((text, i) => ({
      pageNumber: i + 1,
      text: typeof text === 'string' ? text : String(text),
    }));

    return { hasText: true, pages, pageCount };
  } catch (error) {
    logger.warn('Paged PDF text extraction failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { hasText: false, pages: [], pageCount: 0 };
  }
}

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<PdfTextExtractionResult> {
  try {
    const { extractText } = await import('unpdf');
    const data = new Uint8Array(pdfBuffer);
    const result = await extractText(data);

    const pageCount = result.totalPages || 1;
    const text = Array.isArray(result.text) ? result.text.join('\n\n') : String(result.text || '');
    const avgCharsPerPage = text.length / pageCount;
    const hasText = avgCharsPerPage >= MIN_CHARS_PER_PAGE;

    logger.info('PDF text extraction complete', {
      pageCount,
      textLength: text.length,
      avgCharsPerPage: Math.round(avgCharsPerPage),
      hasText,
    });

    return { hasText, text: hasText ? text : '', pageCount };
  } catch (error) {
    logger.warn('PDF text extraction failed, treating as scanned', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { hasText: false, text: '', pageCount: 0 };
  }
}
