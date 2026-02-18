import axios from 'axios';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { IMistralAdapter, MistralExtractionResult } from './interfaces';
import { ExtractedInvoiceData } from '@/types';
import { EXTRACTION_PROMPT_WITH_TEXT, EXTRACTION_PROMPT_VISION } from '@/lib/extraction-prompt';
import { normalizeExtractedData, parseJsonFromAiResponse } from '@/lib/extraction-normalizer';
import { mistralThrottle } from '@/lib/api-throttle';
// FIX: Re-audit #7 — sanitize document text before injecting into AI prompts
import { sanitizeDocumentContent, wrapDocumentContent } from '@/lib/ai-sanitization';
import { extractText } from '@/lib/text-extraction';
import { extractPagedTextFromPdf } from '@/lib/pdf-text-extractor';
import { extractTextWithMistralOcr } from '@/lib/ocr-extractor';

const MISTRAL_MAX_429_RETRIES = 3;
const MISTRAL_429_INITIAL_BACKOFF_MS = 2000;

export class MistralAdapter implements IMistralAdapter {
  private readonly configApiKey?: string;
  private readonly timeout: number;

  constructor(config?: { apiKey?: string; timeout?: number }) {
    this.configApiKey = config?.apiKey;
    this.timeout = config?.timeout ?? API_TIMEOUTS.MISTRAL_EXTRACTION;
  }

  private get apiKey(): string {
    return this.configApiKey ?? process.env.MISTRAL_API_KEY ?? '';
  }

  private get baseUrl(): string {
    return process.env.MISTRAL_API_URL ?? 'https://api.mistral.ai';
  }

  private get chatModel(): string {
    return process.env.MISTRAL_MODEL ?? 'mistral-small-latest';
  }

  // --- Chat Step (with 429 retry) ---
  private async callChat(prompt: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt <= MISTRAL_MAX_429_RETRIES; attempt++) {
      await mistralThrottle.acquire();

      const payload = {
        model: this.chatModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 16000,
        temperature: 0,
        response_format: { type: 'json_object' },
      };

      try {
        const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: this.timeout,
        });

        const content = response.data?.choices?.[0]?.message?.content;
        if (!content) {
          throw new AppError('MISTRAL_ERROR', 'Empty chat response from Mistral', 500);
        }

        return parseJsonFromAiResponse(content) as Record<string, unknown>;
      } catch (error) {
        if (
          axios.isAxiosError(error) &&
          (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))
        ) {
          throw new AppError('MISTRAL_TIMEOUT', 'Mistral Chat request timed out', 504);
        }
        // Retry on 429 with exponential backoff
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          if (attempt < MISTRAL_MAX_429_RETRIES) {
            const backoff = MISTRAL_429_INITIAL_BACKOFF_MS * Math.pow(2, attempt);
            logger.warn('Mistral 429 rate limited, retrying', {
              attempt: attempt + 1,
              backoffMs: backoff,
            });
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          throw new AppError(
            'MISTRAL_ERROR',
            'Mistral Chat failed: Request failed with status code 429',
            429
          );
        }
        if (error instanceof AppError) throw error;
        if (error instanceof SyntaxError) {
          throw new AppError('MISTRAL_ERROR', 'Invalid JSON in Mistral response', 500);
        }
        const msg = error instanceof Error ? error.message : String(error);
        throw new AppError('MISTRAL_ERROR', `Mistral Chat failed: ${msg}`, 500);
      }
    }
    throw new AppError('MISTRAL_ERROR', 'Mistral Chat failed after retries', 500);
  }

  // --- Vision: send image directly to Mistral chat ---
  private async callChatWithVision(
    fileBuffer: Buffer,
    mimeType: string,
    extractedText?: string
  ): Promise<Record<string, unknown>> {
    await mistralThrottle.acquire();

    const base64Data = fileBuffer.toString('base64');
    // FIX: Re-audit #7 — sanitize + wrap document text to prevent prompt injection
    const prompt = extractedText
      ? EXTRACTION_PROMPT_WITH_TEXT + wrapDocumentContent(sanitizeDocumentContent(extractedText))
      : EXTRACTION_PROMPT_VISION;

    const payload = {
      model: this.chatModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Data}` },
            },
          ],
        },
      ],
      max_tokens: 16000,
      temperature: 0,
      response_format: { type: 'json_object' },
    };

    try {
      const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: this.timeout,
      });

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new AppError('MISTRAL_ERROR', 'Empty vision response from Mistral', 500);
      }

      return parseJsonFromAiResponse(content) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      throw new AppError('MISTRAL_ERROR', `Mistral Vision failed: ${msg}`, 500);
    }
  }

  // --- Two-Step Extraction (OCR → Chat) ---
  async extractInvoiceData(fileBuffer: Buffer, mimeType: string): Promise<MistralExtractionResult> {
    const startTime = Date.now();

    if (!this.apiKey) throw new AppError('CONFIG_ERROR', 'Mistral API not configured', 500);
    if (!fileBuffer || fileBuffer.length === 0) throw new ValidationError('Empty file buffer');

    logger.info('Mistral extraction started', { mimeType, bufferSize: fileBuffer.length });

    // Step 1: OCR via shared utility
    const ocrText = await extractTextWithMistralOcr(fileBuffer, mimeType);

    // Step 2: Chat extraction (text path or vision fallback)
    let data: Record<string, unknown>;
    if (ocrText) {
      // FIX: Re-audit #7 — sanitize + wrap document text to prevent prompt injection
      const prompt =
        EXTRACTION_PROMPT_WITH_TEXT + wrapDocumentContent(sanitizeDocumentContent(ocrText));
      data = await this.callChat(prompt);
    } else {
      logger.info('OCR returned no text, falling back to Mistral Vision', { mimeType });
      data = await this.callChatWithVision(fileBuffer, mimeType);
    }
    const normalizedData = normalizeExtractedData(data);

    const processingTimeMs = Date.now() - startTime;
    const finalResult: ExtractedInvoiceData = {
      ...normalizedData,
      processingTimeMs,
      confidence: normalizedData.confidence || 0.7,
    };

    logger.info('Mistral extraction successful', {
      processingTimeMs,
      confidence: finalResult.confidence,
    });

    return {
      data: finalResult,
      confidence: finalResult.confidence ?? 0.7,
      processingTimeMs,
    };
  }

  async extractWithText(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { extractedText?: string }
  ): Promise<MistralExtractionResult> {
    const startTime = Date.now();
    if (!this.apiKey) throw new AppError('CONFIG_ERROR', 'Mistral API not configured', 500);
    if (!fileBuffer || fileBuffer.length === 0) throw new ValidationError('Empty file buffer');

    let text = options?.extractedText;
    if (!text) {
      // If no pre-extracted text, use shared Mistral OCR
      text = await extractTextWithMistralOcr(fileBuffer, mimeType);
    }

    // If still no text (image/scanned PDF where OCR failed), use vision
    let data: Record<string, unknown>;
    if (!text) {
      logger.info('No extracted text available, falling back to Mistral Vision', { mimeType });
      data = await this.callChatWithVision(fileBuffer, mimeType);
    } else {
      // FIX: Re-audit #7 — sanitize + wrap document text to prevent prompt injection
      const prompt =
        EXTRACTION_PROMPT_WITH_TEXT + wrapDocumentContent(sanitizeDocumentContent(text));
      data = await this.callChat(prompt);
    }
    const normalizedData = normalizeExtractedData(data);

    const processingTimeMs = Date.now() - startTime;
    const finalResult: ExtractedInvoiceData = {
      ...normalizedData,
      processingTimeMs,
      confidence: normalizedData.confidence || 0.7,
    };

    return {
      data: finalResult,
      confidence: finalResult.confidence ?? 0.7,
      processingTimeMs,
    };
  }

  async extractWithRetry(
    _fileBuffer: Buffer,
    _mimeType: string,
    retryPrompt: string
  ): Promise<MistralExtractionResult> {
    const startTime = Date.now();
    if (!this.apiKey) throw new AppError('CONFIG_ERROR', 'Mistral API not configured', 500);

    const data = await this.callChat(retryPrompt);
    const normalizedData = normalizeExtractedData(data);

    const processingTimeMs = Date.now() - startTime;
    const finalResult: ExtractedInvoiceData = {
      ...normalizedData,
      processingTimeMs,
      confidence: normalizedData.confidence || 0.7,
    };

    return {
      data: finalResult,
      confidence: finalResult.confidence ?? 0.7,
      processingTimeMs,
    };
  }

  async sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string> {
    if (!this.apiKey) throw new AppError('CONFIG_ERROR', 'Mistral API not configured', 500);
    if (!fileBuffer || fileBuffer.length === 0) throw new ValidationError('Empty file buffer');

    // Extract text with page markers for boundary detection accuracy
    let docText: string | undefined;

    if (mimeType === 'application/pdf') {
      try {
        const pagedResult = await extractPagedTextFromPdf(fileBuffer);
        if (pagedResult.hasText && pagedResult.pages.length > 0) {
          docText = pagedResult.pages
            .map((p) => `--- PAGE ${p.pageNumber} ---\n${p.text}`)
            .join('\n\n');
          logger.info('sendPrompt using paged text extraction', {
            pageCount: pagedResult.pageCount,
            textLength: docText.length,
          });
        }
      } catch (error) {
        logger.warn('Paged text extraction failed in sendPrompt', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback to flat text extraction
    if (!docText) {
      try {
        const textResult = await extractText(fileBuffer, mimeType);
        if (textResult.hasText) {
          docText = textResult.text;
          logger.info('sendPrompt using flat text extraction', {
            source: textResult.source,
            textLength: docText.length,
          });
        }
      } catch (error) {
        logger.warn('Flat text extraction failed in sendPrompt', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback to Mistral OCR if no text extracted yet
    if (!docText) {
      docText = await extractTextWithMistralOcr(fileBuffer, mimeType);
    }

    if (!docText) {
      throw new AppError(
        'MISTRAL_ERROR',
        'Could not extract text from document for sendPrompt',
        500
      );
    }

    // FIX: Re-audit #7 — sanitize + wrap document text to prevent prompt injection
    const fullPrompt = `${prompt}\n\n${wrapDocumentContent(sanitizeDocumentContent(docText))}`;

    // Use callChat with 429 retry (but parse raw text, not JSON)
    await mistralThrottle.acquire();

    const payload = {
      model: this.chatModel,
      messages: [{ role: 'user', content: fullPrompt }],
      max_tokens: 4000,
      temperature: 0,
    };

    for (let attempt = 0; attempt <= MISTRAL_MAX_429_RETRIES; attempt++) {
      try {
        const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: this.timeout,
        });

        const content = response.data?.choices?.[0]?.message?.content;
        if (!content) throw new AppError('MISTRAL_ERROR', 'Empty response from Mistral', 500);
        return content;
      } catch (error) {
        if (
          axios.isAxiosError(error) &&
          (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))
        ) {
          throw new AppError('MISTRAL_TIMEOUT', 'Mistral API request timed out', 504);
        }
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          if (attempt < MISTRAL_MAX_429_RETRIES) {
            const backoff = MISTRAL_429_INITIAL_BACKOFF_MS * Math.pow(2, attempt);
            logger.warn('Mistral 429 in sendPrompt, retrying', {
              attempt: attempt + 1,
              backoffMs: backoff,
            });
            await new Promise((r) => setTimeout(r, backoff));
            await mistralThrottle.acquire();
            continue;
          }
          throw new AppError('MISTRAL_ERROR', 'Mistral sendPrompt rate limited after retries', 429);
        }
        if (error instanceof AppError) throw error;
        throw new AppError(
          'MISTRAL_ERROR',
          `Mistral sendPrompt failed: ${error instanceof Error ? error.message : String(error)}`,
          500
        );
      }
    }
    throw new AppError('MISTRAL_ERROR', 'Mistral sendPrompt failed after retries', 500);
  }

  getProviderName(): string {
    return 'mistral';
  }

  validateConfiguration(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }
}

export const mistralAdapter = new MistralAdapter();
