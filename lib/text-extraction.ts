/**
 * Phase 6: Unified text extraction interface.
 * Routes to unpdf for digital PDFs; Mistral OCR for scanned/images.
 */

import { extractTextFromPdf } from '@/lib/pdf-text-extractor';
import { extractTextWithMistralOcr } from '@/lib/ocr-extractor';
import { ENABLE_TEXT_EXTRACTION } from '@/lib/constants';
import { logger } from '@/lib/logger';

export interface TextExtractionResult {
  hasText: boolean;
  text: string;
  pageCount: number;
  source: 'unpdf' | 'ocr' | 'mistral-ocr' | 'none';
}

/**
 * Extract text from a file buffer.
 * For PDFs: uses unpdf. For images or scanned PDFs: Mistral OCR API.
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
        return { ...result, source: 'unpdf' };
      }
      // PDF had no text (scanned) — fall through to Mistral OCR
    } catch (error) {
      logger.warn('PDF text extraction failed, trying Mistral OCR', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Mistral OCR for images and scanned PDFs
  if (isImage || isPdf) {
    try {
      const ocrText = await extractTextWithMistralOcr(fileBuffer, mimeType);
      if (ocrText.length > 0) {
        return {
          hasText: true,
          text: ocrText,
          pageCount: 1,
          source: 'mistral-ocr',
        };
      }
    } catch (error) {
      logger.warn('Mistral OCR extraction failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { hasText: false, text: '', pageCount: 0, source: 'none' };
}
