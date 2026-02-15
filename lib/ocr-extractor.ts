/**
 * Phase 8: OCR via Tesseract.js
 * Extracts text from images using Tesseract OCR with German + English language support.
 * Gated behind ENABLE_OCR feature flag.
 */

import { ENABLE_OCR } from '@/lib/constants';
import { logger } from '@/lib/logger';

export interface OcrResult {
  text: string;
  confidence: number;
}

// Tesseract.js worker threads crash on Vercel serverless (MODULE_NOT_FOUND
// in worker-script/node/index.js). The crash is an Uncaught Exception that
// kills the entire process before any try/catch can intercept it.
// Detect Vercel and skip OCR entirely — AI extracts from the visual PDF instead.
const IS_VERCEL = !!(process.env.VERCEL || process.env.VERCEL_ENV);

let workerPromise: Promise<import('tesseract.js').Worker> | null = null;

async function getWorker(): Promise<import('tesseract.js').Worker> {
  if (IS_VERCEL) {
    throw new Error('Tesseract.js not supported on Vercel serverless');
  }
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await import('tesseract.js');
      const worker = await Tesseract.createWorker('deu+eng');
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Run OCR on an image buffer.
 * Returns extracted text and confidence score.
 * If confidence < 0.5 or OCR is disabled, returns empty text.
 */
export async function extractTextWithOcr(
  imageBuffer: Buffer,
  _mimeType: string
): Promise<OcrResult> {
  if (!ENABLE_OCR) {
    return { text: '', confidence: 0 };
  }

  try {
    const worker = await getWorker();
    const result = await worker.recognize(imageBuffer);

    const confidence = result.data.confidence / 100; // Tesseract returns 0-100
    const text = result.data.text;

    logger.info('OCR extraction complete', {
      textLength: text.length,
      confidence: Math.round(confidence * 100) / 100,
    });

    if (confidence < 0.5) {
      logger.warn('OCR confidence too low, discarding result', { confidence });
      return { text: '', confidence };
    }

    return { text, confidence };
  } catch (error) {
    logger.warn('OCR extraction failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { text: '', confidence: 0 };
  }
}
