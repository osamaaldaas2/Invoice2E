/**
 * Phase 6: Unified text extraction interface.
 * Routes to pdf-parse for digital PDFs; OCR stub for scanned/images.
 */

import { extractTextFromPdf } from '@/lib/pdf-text-extractor';
import { ENABLE_TEXT_EXTRACTION, ENABLE_OCR } from '@/lib/constants';
import { logger } from '@/lib/logger';

export interface TextExtractionResult {
  hasText: boolean;
  text: string;
  pageCount: number;
  source: 'pdf-parse' | 'ocr' | 'none';
}

/**
 * Extract text from a file buffer.
 * For PDFs: uses pdf-parse. For images: OCR stub (Phase 8).
 */
export async function extractText(
  fileBuffer: Buffer,
  mimeType: string
): Promise<TextExtractionResult> {
  if (!ENABLE_TEXT_EXTRACTION) {
    return { hasText: false, text: '', pageCount: 0, source: 'none' };
  }

  const isPdf = mimeType === 'application/pdf';

  if (isPdf) {
    const result = await extractTextFromPdf(fileBuffer);
    if (result.hasText) {
      return { ...result, source: 'pdf-parse' };
    }
    // PDF had no text — fall through to OCR
  }

  // OCR stub (Phase 8 implementation)
  if (ENABLE_OCR) {
    logger.info('OCR requested but not yet implemented (Phase 8)', { mimeType });
    // TODO: Phase 8 — implement OCR via Tesseract or cloud OCR
  }

  return { hasText: false, text: '', pageCount: 0, source: 'none' };
}
