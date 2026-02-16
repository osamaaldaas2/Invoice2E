/**
 * Shared Mistral OCR utility.
 * Extracts text from images/scanned PDFs via Mistral's /v1/ocr endpoint.
 * Used by ALL AI providers (GPT, Gemini, Mistral) as the universal OCR fallback.
 */

import axios from 'axios';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { mistralThrottle } from '@/lib/api-throttle';

/**
 * Extract text from a file buffer using Mistral OCR API.
 * Returns extracted text (markdown) or empty string on failure.
 * Requires MISTRAL_API_KEY to be set.
 */
export async function extractTextWithMistralOcr(
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY ?? '';
  if (!apiKey) {
    logger.warn('Mistral OCR skipped: MISTRAL_API_KEY not set');
    return '';
  }

  const baseUrl = process.env.MISTRAL_API_URL ?? 'https://api.mistral.ai';
  const ocrModel = process.env.MISTRAL_OCR_MODEL ?? 'mistral-ocr-latest';

  await mistralThrottle.acquire();

  const base64Data = fileBuffer.toString('base64');
  const dataUri = `data:${mimeType};base64,${base64Data}`;

  const payload = {
    model: ocrModel,
    document: {
      type: 'document_url',
      document_url: dataUri,
    },
  };

  try {
    const response = await axios.post(`${baseUrl}/v1/ocr`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: API_TIMEOUTS.MISTRAL_OCR,
    });

    const pages = response.data?.pages;
    if (!Array.isArray(pages) || pages.length === 0) {
      logger.warn('Mistral OCR returned empty pages');
      return '';
    }

    const fullText = pages.map((p: { markdown: string }) => p.markdown).join('\n\n');
    logger.info('Mistral OCR completed', {
      pageCount: pages.length,
      textLength: fullText.length,
    });

    return fullText;
  } catch (error) {
    logger.warn('Mistral OCR extraction failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return '';
  }
}
