import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { IGeminiAdapter, GeminiExtractionResult } from './interfaces';
import { ExtractedInvoiceData } from '@/types';
import { EXTRACTION_PROMPT } from '@/lib/extraction-prompt';

export class GeminiAdapter implements IGeminiAdapter {
    private readonly configApiKey?: string;
    private readonly timeout: number;
    private readonly modelName: string;
    private genAI: GoogleGenerativeAI | null = null;
    private model: GenerativeModel | null = null;
    private lastApiKey: string | null = null;

    constructor(config?: {
        apiKey?: string;
        timeout?: number;
        model?: string;
    }) {
        this.configApiKey = config?.apiKey;
        this.timeout = config?.timeout ?? API_TIMEOUTS.GEMINI_EXTRACTION;
        this.modelName = config?.model ?? 'gemini-2.0-flash';
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
            this.model = this.genAI.getGenerativeModel({ model: this.modelName });
        }

        return this.model!;
    }

    async extractInvoiceData(
        fileBuffer: Buffer,
        mimeType: string
    ): Promise<GeminiExtractionResult> {
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

            const responsePromise = model.generateContent([prompt, imagePart]);

            // Race between API call and timeout
            // Using a simple timeout logic as Promise.race with AbortSignal isn't native to all Node versions used here, 
            // but fetch supports signal. Google Gen AI SDK doesn't support signal directly yet in all versions, 
            // so we keep the external race.
            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Gemini API timeout')), this.timeout)
            );

            const result = await Promise.race([responsePromise, timeoutPromise]);

            clearTimeout(timeoutId);

            const responseTime = Date.now() - startTime;
            // @ts-ignore
            const textContent = result.response.text();
            const extractedData = this.parseResponse(textContent);

            const finalResult: ExtractedInvoiceData = {
                ...extractedData,
                processingTimeMs: responseTime,
                confidence: extractedData.confidence || this.calculateConfidenceScore(extractedData)
            };

            logger.info('Gemini extraction successful', {
                processingTimeMs: responseTime,
                confidence: finalResult.confidence
            });

            return {
                data: finalResult,
                confidence: finalResult.confidence,
                processingTimeMs: responseTime,
                // @ts-ignore
                rawResponse: result.response,
            };

        } catch (error) {
            clearTimeout(timeoutId);
            const responseTime = Date.now() - startTime;

            if (error instanceof Error && error.message.includes('timeout')) {
                throw new AppError('GEMINI_TIMEOUT', 'Gemini API request timed out', 504);
            }

            logger.error('Gemini extraction failed', { error, responseTime });

            if (error instanceof AppError) throw error;
            throw new AppError('EXTRACTION_ERROR', `Gemini extraction failed: ${error instanceof Error ? error.message : String(error)}`, 500);
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

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Gemini API timeout')), this.timeout)
        );

        try {
            const result = await Promise.race([
                model.generateContent([prompt, imagePart]),
                timeoutPromise,
            ]);
            // @ts-ignore
            return result.response.text();
        } catch (error) {
            if (error instanceof Error && error.message.includes('timeout')) {
                throw new AppError('GEMINI_TIMEOUT', 'Gemini API request timed out', 504);
            }
            throw new AppError('GEMINI_ERROR', `Gemini sendPrompt failed: ${error instanceof Error ? error.message : String(error)}`, 500);
        }
    }

    private getExtractionPrompt(): string {
        return EXTRACTION_PROMPT;
    }

    private parseResponse(textContent: string): Omit<ExtractedInvoiceData, 'processingTimeMs'> {
        try {
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const data = JSON.parse(jsonMatch[0]);

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
                buyerCity: data.buyerCity || null,
                buyerPostalCode: data.buyerPostalCode != null ? String(data.buyerPostalCode) : null,
                buyerTaxId: data.buyerTaxId || null,
                buyerPhone: data.buyerPhone || null,
                sellerName: data.sellerName || null,
                sellerEmail: data.sellerEmail || null,
                sellerAddress: data.sellerAddress || null,
                sellerCity: data.sellerCity || null,
                sellerPostalCode: data.sellerPostalCode != null ? String(data.sellerPostalCode) : null,
                sellerTaxId: data.sellerTaxId || null,
                sellerIban: normalizeIban(data.sellerIban),
                sellerBic: data.sellerBic || null,
                sellerPhone: data.sellerPhone || null,
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
                confidence: Number(data.confidence) || 0.8,
            };
        } catch (error) {
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
