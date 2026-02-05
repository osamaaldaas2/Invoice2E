import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { IGeminiAdapter, GeminiExtractionResult } from './interfaces';
import { ExtractedInvoiceData } from '@/types';

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

    private getExtractionPrompt(): string {
        return `Extract invoice data from the provided image and return valid JSON matching the following structure:
        {
            "invoiceNumber": "string or null",
            "invoiceDate": "YYYY-MM-DD or null",
            "buyerName": "string or null",
            "buyerEmail": "string or null",
            "buyerAddress": "string or null",
            "buyerTaxId": "string or null",
            "sellerName": "string or null",
            "sellerEmail": "string or null",
            "sellerAddress": "string or null",
            "sellerTaxId": "string or null",
            "lineItems": [{ "description": "string", "quantity": number, "unitPrice": number, "totalPrice": number, "taxRate": number }],
            "subtotal": number,
            "taxAmount": number,
            "totalAmount": number,
            "currency": "string",
            "paymentTerms": "string or null",
            "notes": "string or null",
            "confidence": number (0-1)
        }`;
    }

    private parseResponse(textContent: string): Omit<ExtractedInvoiceData, 'processingTimeMs'> {
        try {
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const data = JSON.parse(jsonMatch[0]);

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
                lineItems: Array.isArray(data.lineItems) ? data.lineItems : (Array.isArray(data.items) ? data.items : []),
                subtotal: Number(data.subtotal) || 0,
                taxAmount: Number(data.taxAmount) || 0,
                totalAmount: Number(data.totalAmount) || 0,
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
