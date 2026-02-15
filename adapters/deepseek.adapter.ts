import axios from 'axios';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { IDeepSeekAdapter, DeepSeekExtractionResult } from './interfaces';
import { ExtractedInvoiceData } from '@/types';
import {
  EXTRACTION_PROMPT,
  EXTRACTION_PROMPT_WITH_TEXT,
  EXTRACTION_PROMPT_VISION,
} from '@/lib/extraction-prompt';
import { normalizeExtractedData, parseJsonFromAiResponse } from '@/lib/extraction-normalizer';

export class DeepSeekAdapter implements IDeepSeekAdapter {
  private readonly configApiKey?: string;
  private readonly configApiUrl?: string;
  private readonly timeout: number;

  constructor(config?: { apiKey?: string; apiUrl?: string; timeout?: number }) {
    this.configApiKey = config?.apiKey;
    this.configApiUrl = config?.apiUrl;
    this.timeout = config?.timeout ?? API_TIMEOUTS.DEEPSEEK_EXTRACTION;
  }

  private get apiKey(): string {
    return this.configApiKey ?? process.env.DEEPSEEK_API_KEY ?? '';
  }

  private get apiUrl(): string {
    return (
      this.configApiUrl ??
      process.env.DEEPSEEK_API_URL ??
      'https://api.deepseek.com/chat/completions'
    );
  }

  async extractInvoiceData(
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<DeepSeekExtractionResult> {
    const startTime = Date.now();

    if (!this.apiKey) {
      throw new AppError('CONFIG_ERROR', 'DeepSeek API not configured', 500);
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Empty file buffer');
    }

    try {
      logger.info('DeepSeek extraction started', { mimeType, bufferSize: fileBuffer.length });

      const base64Data = fileBuffer.toString('base64');
      const prompt = this.getExtractionPrompt();

      const payload = {
        model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Data}`,
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      };

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: this.timeout,
      });

      const content = response.data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new AppError('DEEPSEEK_ERROR', 'Empty response from DeepSeek API', 500);
      }

      const extractedData = this.parseResponse(content);
      const normalizedData = normalizeExtractedData(extractedData);

      const finalResult: ExtractedInvoiceData = {
        ...normalizedData,
        processingTimeMs: Date.now() - startTime,
        confidence: normalizedData.confidence || 0.7,
      };

      const processingTimeMs = Date.now() - startTime;
      logger.info('DeepSeek extraction successful', {
        processingTimeMs,
        confidence: finalResult.confidence,
      });

      return {
        data: finalResult,
        confidence: finalResult.confidence ?? 0.7,
        processingTimeMs,
        rawResponse: response.data,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;

      if (
        axios.isAxiosError(error) &&
        (error.code === 'ECONNABORTED' || error.message.includes('timeout'))
      ) {
        logger.error('DeepSeek API timeout', { processingTimeMs });
        throw new AppError('DEEPSEEK_TIMEOUT', 'DeepSeek API request timed out', 504);
      }

      logger.error('DeepSeek extraction failed', { error, processingTimeMs });

      if (error instanceof AppError) throw error;
      throw new AppError(
        'EXTRACTION_ERROR',
        `DeepSeek extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  getProviderName(): string {
    return 'deepseek';
  }

  validateConfiguration(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new AppError('CONFIG_ERROR', 'DeepSeek API not configured', 500);
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Empty file buffer');
    }

    const base64Data = fileBuffer.toString('base64');
    const payload = {
      model: 'deepseek-vision',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    };

    try {
      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: this.timeout,
      });

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new AppError('DEEPSEEK_ERROR', 'Empty response from DeepSeek API', 500);
      }
      return content;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))
      ) {
        throw new AppError('DEEPSEEK_TIMEOUT', 'DeepSeek API request timed out', 504);
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        'DEEPSEEK_ERROR',
        `DeepSeek sendPrompt failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  /**
   * Extract with optional pre-extracted text.
   */
  async extractWithText(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { extractedText?: string }
  ): Promise<DeepSeekExtractionResult> {
    const startTime = Date.now();

    if (!this.apiKey) {
      throw new AppError('CONFIG_ERROR', 'DeepSeek API not configured', 500);
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Empty file buffer');
    }

    const hasText = !!options?.extractedText;
    const prompt = hasText
      ? EXTRACTION_PROMPT_WITH_TEXT + options!.extractedText!.substring(0, 50000)
      : EXTRACTION_PROMPT_VISION;

    const data = await this.callDeepSeek(fileBuffer, mimeType, prompt);
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

  /**
   * Retry extraction with a correction prompt.
   */
  async extractWithRetry(
    fileBuffer: Buffer,
    mimeType: string,
    retryPrompt: string
  ): Promise<DeepSeekExtractionResult> {
    const startTime = Date.now();

    if (!this.apiKey) {
      throw new AppError('CONFIG_ERROR', 'DeepSeek API not configured', 500);
    }
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Empty file buffer');
    }

    const data = await this.callDeepSeek(fileBuffer, mimeType, retryPrompt);
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

  private async callDeepSeek(
    fileBuffer: Buffer,
    mimeType: string,
    prompt: string
  ): Promise<Record<string, unknown>> {
    const base64Data = fileBuffer.toString('base64');

    const payload = {
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
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
      max_tokens: 2000,
      temperature: 0,
    };

    try {
      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: this.timeout,
      });

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new AppError('DEEPSEEK_ERROR', 'Empty response from DeepSeek API', 500);
      }

      return parseJsonFromAiResponse(content) as Record<string, unknown>;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))
      ) {
        throw new AppError('DEEPSEEK_TIMEOUT', 'DeepSeek API request timed out', 504);
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        'DEEPSEEK_ERROR',
        `DeepSeek call failed: ${error instanceof Error ? error.message : String(error)}`,
        500
      );
    }
  }

  private getExtractionPrompt(): string {
    return EXTRACTION_PROMPT;
  }

  private parseResponse(content: string): Record<string, unknown> {
    try {
      const parsed = parseJsonFromAiResponse(content) as Record<string, unknown>;

      // FORENSIC_STAGE_1: Log parsed JSON types BEFORE normalization
      return parsed;
    } catch {
      logger.error('JSON parsing failed', { content: content.substring(0, 100) });
      throw new AppError('DEEPSEEK_ERROR', 'Invalid JSON response from DeepSeek', 500);
    }
  }
}

export const deepseekAdapter = new DeepSeekAdapter();
