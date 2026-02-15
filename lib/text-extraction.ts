/**
 * Phase 6: Unified text extraction interface.
 * Routes to pdf-parse for digital PDFs; OCR for scanned/images.
 */

import { extractTextFromPdf } from '@/lib/pdf-text-extractor';
import { extractTextWithOcr } from '@/lib/ocr-extractor';
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
 * For PDFs: uses pdf-parse. For images or scanned PDFs: OCR via Tesseract.
 */
export async function extractText(
  fileBuffer: Buffer,
  mimeType: string
): Promise<TextExtractionResult> {
  if (!ENABLE_TEXT_EXTRACTION) {
    return { hasText: false, text: '', pageCount: 0, source: 'none' };
  }

  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType === 'image/jpeg' || mimeType === 'image/png';

  if (isPdf) {
    try {
      const result = await extractTextFromPdf(fileBuffer);
      if (result.hasText) {
        return { ...result, source: 'pdf-parse' };
      }
      // PDF had no text (scanned) — fall through to OCR
    } catch (error) {
      logger.warn('PDF text extraction failed, trying OCR', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // OCR for images and scanned PDFs
  if (ENABLE_OCR && (isImage || isPdf)) {
    try {
      const ocrResult = await extractTextWithOcr(fileBuffer, mimeType);
      if (ocrResult.text.length > 0) {
        return {
          hasText: true,
          text: ocrResult.text,
          pageCount: 1,
          source: 'ocr',
        };
      }
    } catch (error) {
      logger.warn('OCR extraction failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { hasText: false, text: '', pageCount: 0, source: 'none' };
}
