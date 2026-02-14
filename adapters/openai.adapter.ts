import axios from 'axios';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { IOpenAIAdapter, OpenAIExtractionResult } from './interfaces';
import { ExtractedInvoiceData } from '@/types';
import { EXTRACTION_PROMPT } from '@/lib/extraction-prompt';
import { normalizeExtractedData, parseJsonFromAiResponse } from '@/lib/extraction-normalizer';
import { openaiThrottle } from '@/lib/api-throttle';

export class OpenAIAdapter implements IOpenAIAdapter {
  private readonly configApiKey?: string;
  private readonly configApiUrl?: string;
  private readonly timeout: number;

  constructor(config?: { apiKey?: string; apiUrl?: string; timeout?: number }) {
    this.configApiKey = config?.apiKey;
    this.configApiUrl = config?.apiUrl;
    this.timeout = config?.timeout ?? API_TIMEOUTS.OPENAI_EXTRACTION;
  }

  private get apiKey(): string {
    return this.configApiKey ?? process.env.OPENAI_API_KEY ?? '';
  }

  private get apiUrl(): string {
    return (
      this.configApiUrl ??
      process.env.OPENAI_API_URL ??
      'https://api.openai.com/v1/chat/completions'
    );
  }

  async extractInvoiceData(
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<OpenAIExtractionResult> {
    const startTime = Date.now();

    if (!this.apiKey) {
      throw new AppError('CONFIG_ERROR', 'OpenAI API not configured', 500);
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Empty file buffer');
    }

    try {
      logger.info('OpenAI extraction started', { mimeType, bufferSize: fileBuffer.length });

      await openaiThrottle.acquire();

      const base64Data = fileBuffer.toString('base64');
      const prompt = this.getExtractionPrompt();

      // OpenAI uses 'file' content type for PDFs, 'image_url' for images
      const isPdf = mimeType === 'application/pdf';
      const fileContent = isPdf
        ? {
            type: 'file' as const,
            file: {
              filename: 'invoice.pdf',
              file_data: `data:${mimeType};base64,${base64Data}`,
            },
          }
        : {
            type: 'image_url' as const,
            image_url: {
              url: `data:${mimeType};base64,${base64Data}`,
            },
          };

      const payload = {
        model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              fileContent,
            ],
          },
        ],
        max_tokens: 16000,
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
        throw new AppError('OPENAI_ERROR', 'Empty response from OpenAI API', 500);
      }

      const extractedData = this.parseResponse(content);
      const normalizedData = normalizeExtractedData(extractedData);

      const finalResult: ExtractedInvoiceData = {
        ...normalizedData,
        processingTimeMs: Date.now() - startTime,
        confidence: normalizedData.confidence || 0.7,
      };

      const processingTimeMs = Date.now() - startTime;
      logger.info('OpenAI extraction successful', {
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
        logger.error('OpenAI API timeout', { processingTimeMs });
        throw new AppError('OPENAI_TIMEOUT', 'OpenAI API request timed out', 504);
      }

      // Extract detailed error info from axios response
      const axiosErr = axios.isAxiosError(error) ? error : null;
      const statusCode = axiosErr?.response?.status;
      const responseData = axiosErr?.response?.data;
      const errorMessage = responseData?.error?.message || (error instanceof Error ? error.message : String(error));

      logger.error('OpenAI extraction failed', {
        processingTimeMs,
        statusCode,
        errorMessage,
        errorType: responseData?.error?.type,
      });

      if (error instanceof AppError) throw error;
      throw new AppError(
        'EXTRACTION_ERROR',
        `OpenAI extraction failed (${statusCode || 'unknown'}): ${errorMessage}`,
        statusCode || 500
      );
    }
  }

  getProviderName(): string {
    return 'openai';
  }

  validateConfiguration(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new AppError('CONFIG_ERROR', 'OpenAI API not configured', 500);
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Empty file buffer');
    }

    await openaiThrottle.acquire();

    const base64Data = fileBuffer.toString('base64');
    const isPdf = mimeType === 'application/pdf';
    const fileContent = isPdf
      ? {
          type: 'file' as const,
          file: {
            filename: 'document.pdf',
            file_data: `data:${mimeType};base64,${base64Data}`,
          },
        }
      : {
          type: 'image_url' as const,
          image_url: {
            url: `data:${mimeType};base64,${base64Data}`,
          },
        };

    const payload = {
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            fileContent,
          ],
        },
      ],
      max_tokens: 16000,
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
        throw new AppError('OPENAI_ERROR', 'Empty response from OpenAI API', 500);
      }
      return content;
    } catch (error) {
      if (
        axios.isAxiosError(error) &&
        (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))
      ) {
        throw new AppError('OPENAI_TIMEOUT', 'OpenAI API request timed out', 504);
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        'OPENAI_ERROR',
        `OpenAI sendPrompt failed: ${error instanceof Error ? error.message : String(error)}`,
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
      return parsed;
    } catch {
      logger.error('JSON parsing failed', { content: content.substring(0, 100) });
      throw new AppError('OPENAI_ERROR', 'Invalid JSON response from OpenAI', 500);
    }
  }
}

export const openaiAdapter = new OpenAIAdapter();
