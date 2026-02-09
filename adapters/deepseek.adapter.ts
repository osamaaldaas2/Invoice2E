import axios from 'axios';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { IDeepSeekAdapter, DeepSeekExtractionResult } from './interfaces';
import { ExtractedInvoiceData } from '@/types';
import { EXTRACTION_PROMPT } from '@/lib/extraction-prompt';

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
            if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || error.message?.includes('timeout'))) {
                throw new AppError('DEEPSEEK_TIMEOUT', 'DeepSeek API request timed out', 504);
            }
            if (error instanceof AppError) throw error;
            throw new AppError('DEEPSEEK_ERROR', `DeepSeek sendPrompt failed: ${error instanceof Error ? error.message : String(error)}`, 500);
        }
    }

    private getExtractionPrompt(): string {
        return EXTRACTION_PROMPT;
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
        let parsedTaxRate = hasTaxRate ? Number(data.taxRate) : NaN;
        // FIX: Normalize decimal tax rate (0.19) to percentage (19)
        if (!isNaN(parsedTaxRate) && parsedTaxRate > 0 && parsedTaxRate < 1) {
            parsedTaxRate = Math.round(parsedTaxRate * 10000) / 100;
        }
        // FIX: Reject unrealistic tax rates (> 30%) — fall back to derived rate
        if (!isNaN(parsedTaxRate) && parsedTaxRate > 30) {
            parsedTaxRate = NaN;
        }
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
            buyerCity: data.buyerCity || null,
            buyerPostalCode: data.buyerPostalCode != null ? String(data.buyerPostalCode) : null,
            buyerCountryCode: data.buyerCountryCode || null,
            buyerTaxId: data.buyerTaxId || null,
            buyerPhone: data.buyerPhone || null,
            sellerName: data.sellerName || null,
            sellerEmail: data.sellerEmail || null,
            sellerAddress: data.sellerAddress || null,
            sellerCity: data.sellerCity || null,
            sellerPostalCode: data.sellerPostalCode != null ? String(data.sellerPostalCode) : null,
            sellerCountryCode: data.sellerCountryCode || null,
            sellerTaxId: data.sellerTaxId || null,
            sellerIban: normalizeIban(data.sellerIban),
            sellerBic: data.sellerBic || null,
            sellerPhone: data.sellerPhone || null,
            bankName: data.bankName || null,
            lineItems: rawItems.map((item: any) => {
                const itemHasTaxRate = item?.taxRate !== null && item?.taxRate !== undefined && item?.taxRate !== '';
                let itemTaxRate = itemHasTaxRate ? Number(item.taxRate) : fallbackTaxRate;
                // FIX: Normalize decimal (0.19 → 19) and reject unrealistic (> 30%)
                if (!isNaN(itemTaxRate) && itemTaxRate > 0 && itemTaxRate < 1) {
                    itemTaxRate = Math.round(itemTaxRate * 10000) / 100;
                }
                if (!isNaN(itemTaxRate) && itemTaxRate > 30) {
                    itemTaxRate = fallbackTaxRate;
                }
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
