import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { IGeminiAdapter, GeminiExtractionResult } from './interfaces';
import { ExtractedInvoiceData } from '@/types';
import {
  EXTRACTION_PROMPT,
  EXTRACTION_PROMPT_WITH_TEXT,
  EXTRACTION_PROMPT_VISION,
} from '@/lib/extraction-prompt';
import { normalizeExtractedData, parseJsonFromAiResponse } from '@/lib/extraction-normalizer';
import { geminiThrottle } from '@/lib/api-throttle';

export class GeminiAdapter implements IGeminiAdapter {
  private readonly configApiKey?: string;
  private readonly timeout: number;
  private readonly modelName: string;
  private readonly enableThinking: boolean;
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private lastApiKey: string | null = null;

  constructor(config?: {
    apiKey?: string;
    timeout?: number;
    model?: string;
    enableThinking?: boolean;
  }) {
    this.configApiKey = config?.apiKey;
    this.timeout = config?.timeout ?? API_TIMEOUTS.GEMINI_EXTRACTION;
    this.modelName = config?.model ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    this.enableThinking = config?.enableThinking ?? process.env.GEMINI_ENABLE_THINKING !== 'false';
  }

  private get apiKey(): string {
    return this.configApiKey ?? process.env.GEMINI_API_KEY ?? '';
  }

  private getModel(): GenerativeModel {
    const key = this.apiKey;
    if (!key) {
      throw new AppError('CONFIG_ERROR', 'Gemini API key is missing', 500);
    }

    if (!this.genAI || this.lastApiKey !== key) {
      this.lastApiKey = key;
      this.genAI = new GoogleGenerativeAI(key);
      this.model = this.genAI.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          // @ts-expect-error — Gemini SDK response type mismatch (FIX: Audit #066) â€“ thinkingConfig is supported by Gemini 2.5 but not yet in the SDK types
          thinkingConfig: this.enableThinking ? { thinkingBudget: 4096 } : { thinkingBudget: 0 },
        },
      });
    }

    return this.model!;
  }

  async extractInvoiceData(fileBuffer: Buffer, mimeType: string): Promise<GeminiExtractionResult> {
    const startTime = Date.now();
    const model = this.getModel();

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Empty file buffer');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      logger.info('Gemini extraction started', { mimeType, bufferSize: fileBuffer.length });

      const prompt = this.getExtractionPrompt();
      const imagePart = {
        inlineData: {
          data: fileBuffer.toString('base64'),
          mimeType: mimeType,
        },
      };

      await geminiThrottle.acquire();

      const responsePromise = model.generateContent([prompt, imagePart]);

      // Race between API call and timeout (clear timer on either outcome to prevent leak)
      let raceTimerId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        raceTimerId = setTimeout(() => reject(new Error('Gemini API timeout')), this.timeout);
      });

      let result;
      try {
        result = await Promise.race([responsePromise, timeoutPromise]);
      } finally {
        clearTimeout(raceTimerId!);
      }

      clearTimeout(timeoutId);

      // @ts-expect-error — Gemini SDK response type mismatch (FIX: Audit #066)
      const textContent = result.response.text();
      const extractedData = this.parseResponse(textContent);

      const totalTime = Date.now() - startTime;

      const finalResult: ExtractedInvoiceData = {
        ...extractedData,
        processingTimeMs: totalTime,
        confidence: extractedData.confidence || this.calculateConfidenceScore(extractedData),
      };

      logger.info('Gemini extraction successful', {
        processingTimeMs: totalTime,
        confidence: finalResult.confidence,
      });

      return {
        data: finalResult,
        confidence: finalResult.confidence ?? 0.8,
        processingTimeMs: totalTime,
        // @ts-expect-error — Gemini SDK response type mismatch (FIX: Audit #066)
        rawResponse: result.response,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (error instanceof Error && error.message.includes('timeout')) {
        throw new AppError('GEMINI_TIMEOUT', 'Gemini API request timed out', 504);
      }

      logger.error(
        'Gemini extraction failed',
        error instanceof Error ? error : new Error(String(error))
      );
      logger.warn('Gemini extraction failure context', {
        responseTime,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });

      if (error instanceof AppError) throw error;
      throw new AppError(
        'EXTRACTION_ERROR',
        `Gemini extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  getProviderName(): string {
    return 'gemini';
  }

  validateConfiguration(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string> {
    const model = this.getModel();

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Empty file buffer');
    }

    const imagePart = {
      inlineData: {
        data: fileBuffer.toString('base64'),
        mimeType,
      },
    };

    let raceTimerId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      raceTimerId = setTimeout(() => reject(new Error('Gemini API timeout')), this.timeout);
    });

    try {
      await geminiThrottle.acquire();

      let result;
      try {
        result = await Promise.race([model.generateContent([prompt, imagePart]), timeoutPromise]);
      } finally {
        clearTimeout(raceTimerId!);
      }
      // @ts-expect-error — Gemini SDK response type mismatch (FIX: Audit #066)
      return result.response.text();
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new AppError('GEMINI_TIMEOUT', 'Gemini API request timed out', 504);
      }
      throw new AppError(
        'GEMINI_ERROR',
        `Gemini sendPrompt failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Extract with optional pre-extracted text + text-aware prompt.
   * Does NOT use Structured Outputs (Gemini doesn't support them).
   */
  async extractWithText(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { extractedText?: string }
  ): Promise<GeminiExtractionResult> {
    const startTime = Date.now();
    const model = this.getModel();

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Empty file buffer');
    }

    const hasText = !!options?.extractedText;
    const prompt = hasText
      ? EXTRACTION_PROMPT_WITH_TEXT + options!.extractedText!.substring(0, 50000)
      : EXTRACTION_PROMPT_VISION;

    const data = await this.callGemini(model, fileBuffer, mimeType, prompt);
    const normalizedData = normalizeExtractedData(data);

    const processingTimeMs = Date.now() - startTime;
    const finalResult: ExtractedInvoiceData = {
      ...normalizedData,
      processingTimeMs,
      confidence: normalizedData.confidence || this.calculateConfidenceScore(normalizedData),
    };

    return {
      data: finalResult,
      confidence: finalResult.confidence ?? 0.8,
      processingTimeMs,
    };
  }

  /**
   * Retry extraction with a correction prompt.
   */
  async extractWithRetry(
    fileBuffer: Buffer,
    mimeType: string,
    retryPrompt: string
  ): Promise<GeminiExtractionResult> {
    const startTime = Date.now();
    const model = this.getModel();

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Empty file buffer');
    }

    const data = await this.callGemini(model, fileBuffer, mimeType, retryPrompt);
    const normalizedData = normalizeExtractedData(data);

    const processingTimeMs = Date.now() - startTime;
    const finalResult: ExtractedInvoiceData = {
      ...normalizedData,
      processingTimeMs,
      confidence: normalizedData.confidence || this.calculateConfidenceScore(normalizedData),
    };

    return {
      data: finalResult,
      confidence: finalResult.confidence ?? 0.8,
      processingTimeMs,
    };
  }

  private async callGemini(
    model: GenerativeModel,
    fileBuffer: Buffer,
    mimeType: string,
    prompt: string
  ): Promise<Record<string, unknown>> {
    const imagePart = {
      inlineData: {
        data: fileBuffer.toString('base64'),
        mimeType,
      },
    };

    await geminiThrottle.acquire();

    let raceTimerId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      raceTimerId = setTimeout(() => reject(new Error('Gemini API timeout')), this.timeout);
    });

    try {
      let result;
      try {
        result = await Promise.race([
          model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
            generationConfig: { temperature: 0 },
          }),
          timeoutPromise,
        ]);
      } finally {
        clearTimeout(raceTimerId!);
      }

      // @ts-expect-error — Gemini SDK response type mismatch (FIX: Audit #066)
      const textContent = result.response.text();
      return parseJsonFromAiResponse(textContent) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new AppError('GEMINI_TIMEOUT', 'Gemini API request timed out', 504);
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        'GEMINI_ERROR',
        `Gemini call failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  private getExtractionPrompt(): string {
    return EXTRACTION_PROMPT;
  }

  private parseResponse(textContent: string): Omit<ExtractedInvoiceData, 'processingTimeMs'> {
    try {
      const data = parseJsonFromAiResponse(textContent) as Record<string, unknown>;
      return normalizeExtractedData(data);
    } catch (error) {
      logger.warn('Gemini response parse failed', {
        responsePreview: textContent.substring(0, 500),
        responseLength: textContent.length,
      });
      if (error instanceof AppError) throw error;
      throw new AppError('PARSE_ERROR', 'Failed to parse Gemini response', 500);
    }
  }

  private calculateConfidenceScore(data: any): number {
    let score = 1.0;
    if (!data.totalAmount) score -= 0.2;
    if (!data.invoiceDate) score -= 0.1;
    if (!data.sellerName) score -= 0.1;
    return Math.max(0, score);
  }
}

// Export singleton instance
export const geminiAdapter = new GeminiAdapter();
