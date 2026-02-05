import axios from 'axios';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { IDeepSeekAdapter, DeepSeekExtractionResult } from './interfaces';
import { ExtractedInvoiceData } from '@/types';

export class DeepSeekAdapter implements IDeepSeekAdapter {
    private readonly configApiKey?: string;
    private readonly configApiUrl?: string;
    private readonly timeout: number;

    constructor(config?: {
        apiKey?: string;
        apiUrl?: string;
        timeout?: number;
    }) {
        this.configApiKey = config?.apiKey;
        this.configApiUrl = config?.apiUrl;
        this.timeout = config?.timeout ?? API_TIMEOUTS.DEEPSEEK_EXTRACTION;
    }

    private get apiKey(): string {
        return this.configApiKey ?? process.env.DEEPSEEK_API_KEY ?? '';
    }

    private get apiUrl(): string {
        return this.configApiUrl ?? process.env.DEEPSEEK_API_URL ?? 'https://api.deepseek.com/chat/completions';
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
                model: 'deepseek-vision',
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

            const finalResult: ExtractedInvoiceData = {
                ...extractedData,
                processingTimeMs: Date.now() - startTime,
                confidence: extractedData.confidence || 0.7
            };

            const processingTimeMs = Date.now() - startTime;
            logger.info('DeepSeek extraction successful', { processingTimeMs, confidence: finalResult.confidence });

            return {
                data: finalResult,
                confidence: finalResult.confidence,
                processingTimeMs,
                rawResponse: response.data,
            };

        } catch (error) {
            const processingTimeMs = Date.now() - startTime;

            if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || error.message.includes('timeout'))) {
                logger.error('DeepSeek API timeout', { processingTimeMs });
                throw new AppError('DEEPSEEK_TIMEOUT', 'DeepSeek API request timed out', 504);
            }

            logger.error('DeepSeek extraction failed', { error, processingTimeMs });

            if (error instanceof AppError) throw error;
            throw new AppError('EXTRACTION_ERROR', `DeepSeek extraction failed: ${error instanceof Error ? error.message : String(error)}`, 500);
        }
    }

    getProviderName(): string {
        return 'deepseek';
    }

    validateConfiguration(): boolean {
        return !!this.apiKey && this.apiKey.length > 0;
    }

    private getExtractionPrompt(): string {
        return `You are an expert invoice extraction system. Extract invoice data from the provided base64-encoded image and return ONLY valid JSON.

Return this exact JSON structure (fill with empty strings/0 if not found):
{
  "invoiceNumber": "string",
  "invoiceDate": "YYYY-MM-DD or empty",
  "buyerName": "string",
  "buyerEmail": "string",
  "buyerAddress": "string",
  "buyerTaxId": "string",
  "sellerName": "string",
  "sellerEmail": "string",
  "sellerAddress": "string",
  "sellerTaxId": "string",
  "lineItems": [
    {
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number,
      "taxRate": number or null
    }
  ],
  "subtotal": number,
  "taxAmount": number,
  "totalAmount": number,
  "currency": "string",
  "paymentTerms": "string",
  "notes": "string",
  "confidence": number between 0 and 1
}

CRITICAL:
1. Extract ALL visible information from the invoice
2. Return ONLY valid JSON, no markdown, no explanation
3. Use null for missing fields, empty string for text, 0 for numbers
4. Accuracy is critical - double-check totals and calculations
5. Confidence score: 1.0 = perfect extraction, 0.5 = partial, 0.0 = failed`;
    }

    private parseResponse(content: string): any {
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
            cleanContent = cleanContent.replace(/^```json\n/, '').replace(/\n```$/, '');
        } else if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```\n/, '').replace(/\n```$/, '');
        }

        try {
            return JSON.parse(cleanContent);
        } catch (error) {
            logger.error('JSON parsing failed', { content: cleanContent.substring(0, 100) });
            throw new AppError('DEEPSEEK_ERROR', 'Invalid JSON response from DeepSeek', 500);
        }
    }
}

export const deepseekAdapter = new DeepSeekAdapter();
