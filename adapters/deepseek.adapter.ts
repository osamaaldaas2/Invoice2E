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
            const normalizedData = this.normalizeExtraction(extractedData);

            const finalResult: ExtractedInvoiceData = {
                ...normalizedData,
                processingTimeMs: Date.now() - startTime,
                confidence: normalizedData.confidence || 0.7
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
  "sellerIban": "string",
  "sellerBic": "string",
  "bankName": "string",
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
  "taxRate": number,
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

    private normalizeExtraction(data: any): ExtractedInvoiceData {
        const subtotal = Number(data.subtotal) || 0;
        const totalAmount = Number(data.totalAmount) || 0;
        const rawTaxAmount = Number(data.taxAmount);
        const hasTaxAmount = data.taxAmount !== null && data.taxAmount !== undefined && data.taxAmount !== '';
        const taxAmount = hasTaxAmount && !(rawTaxAmount === 0 && totalAmount > subtotal + 0.01)
            ? rawTaxAmount
            : (totalAmount > subtotal ? Math.round((totalAmount - subtotal) * 100) / 100 : 0);
        const hasTaxRate = data.taxRate !== null && data.taxRate !== undefined && data.taxRate !== '';
        const parsedTaxRate = hasTaxRate ? Number(data.taxRate) : NaN;
        const derivedTaxRate = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 0;
        const fallbackTaxRate = !isNaN(parsedTaxRate) ? parsedTaxRate : derivedTaxRate;

        const rawItems = Array.isArray(data.lineItems)
            ? data.lineItems
            : (Array.isArray(data.items) ? data.items : []);

        const normalizeIban = (value: unknown) => {
            if (value === null || value === undefined) return null;
            const text = String(value).replace(/\s+/g, '').toUpperCase();
            return text || null;
        };

        return {
            invoiceNumber: data.invoiceNumber || null,
            invoiceDate: data.invoiceDate || null,
            buyerName: data.buyerName || null,
            buyerEmail: data.buyerEmail || null,
            buyerAddress: data.buyerAddress || null,
            buyerTaxId: data.buyerTaxId || null,
            sellerName: data.sellerName || null,
            sellerEmail: data.sellerEmail || null,
            sellerAddress: data.sellerAddress || null,
            sellerTaxId: data.sellerTaxId || null,
            sellerIban: normalizeIban(data.sellerIban),
            sellerBic: data.sellerBic || null,
            bankName: data.bankName || null,
            lineItems: rawItems.map((item: any) => {
                const itemHasTaxRate = item?.taxRate !== null && item?.taxRate !== undefined && item?.taxRate !== '';
                const itemTaxRate = itemHasTaxRate ? Number(item.taxRate) : fallbackTaxRate;
                return {
                    description: item?.description || '',
                    quantity: Number(item?.quantity) || 1,
                    unitPrice: Number(item?.unitPrice) || 0,
                    totalPrice: Number(item?.totalPrice) || 0,
                    taxRate: !isNaN(itemTaxRate) ? itemTaxRate : 0,
                };
            }),
            subtotal,
            taxRate: !isNaN(parsedTaxRate) ? parsedTaxRate : derivedTaxRate,
            taxAmount,
            totalAmount,
            currency: data.currency || 'EUR',
            paymentTerms: data.paymentTerms || null,
            notes: data.notes || null,
            confidence: Number(data.confidence) || 0.7,
            processingTimeMs: Number(data.processingTimeMs) || 0,
        };
    }
}

export const deepseekAdapter = new DeepSeekAdapter();
