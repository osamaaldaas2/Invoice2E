/**
 * Phase 1: PDF Text Extraction
 * Uses pdf-parse (PDFParse class) to extract text from digital PDFs.
 * If text < 50 chars/page avg → likely scanned, returns hasText: false.
 */

import { logger } from '@/lib/logger';

export interface PdfTextExtractionResult {
  hasText: boolean;
  text: string;
  pageCount: number;
}

const MIN_CHARS_PER_PAGE = 50;

// pdfjs-dist requires DOMMatrix/ImageData/Path2D which don't exist on Vercel
// serverless. Skip and let AI extract from the visual PDF.
const IS_VERCEL = !!(process.env.VERCEL || process.env.VERCEL_ENV);

export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<PdfTextExtractionResult> {
  if (IS_VERCEL) {
    logger.info('Skipping pdf-parse on Vercel (DOMMatrix unavailable)');
    return { hasText: false, text: '', pageCount: 0 };
  }

  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: pdfBuffer, verbosity: 0 });
    const textResult = await parser.getText();

    const pageCount = textResult.total || 1;
    const text = textResult.text || '';
    const avgCharsPerPage = text.length / pageCount;
    const hasText = avgCharsPerPage >= MIN_CHARS_PER_PAGE;

    await parser.destroy();

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
