import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { API_TIMEOUTS } from '@/lib/constants';
import { EXTRACTION_PROMPT } from '@/lib/extraction-prompt';

import type { ExtractedInvoiceData } from '@/types';
export type { ExtractedInvoiceData } from '@/types';

// FIX-015: Zod schema for validating AI-extracted invoice data
const ExtractedInvoiceItemSchema = z.object({
    description: z.string().default(''),
    quantity: z.coerce.number().default(1),
    unitPrice: z.coerce.number().default(0),
    totalPrice: z.coerce.number().default(0),
    taxRate: z.coerce.number().optional(),
});

const ExtractedInvoiceDataSchema = z.object({
    invoiceNumber: z.union([z.string(), z.null()]).default(null),
    invoiceDate: z.union([z.string(), z.null()]).default(null),
    buyerName: z.union([z.string(), z.null()]).default(null),
    buyerEmail: z.union([z.string(), z.null()]).default(null),
    buyerAddress: z.union([z.string(), z.null()]).default(null),
    buyerCity: z.union([z.string(), z.null()]).default(null),
    buyerPostalCode: z.union([z.coerce.string(), z.null()]).default(null),
    buyerCountryCode: z.union([z.string(), z.null()]).optional().default(null),
    buyerTaxId: z.union([z.string(), z.null()]).default(null),
    buyerPhone: z.union([z.string(), z.null()]).default(null),
    sellerName: z.union([z.string(), z.null()]).default(null),
    sellerEmail: z.union([z.string(), z.null()]).default(null),
    sellerAddress: z.union([z.string(), z.null()]).default(null),
    sellerCity: z.union([z.string(), z.null()]).default(null),
    sellerPostalCode: z.union([z.coerce.string(), z.null()]).default(null),
    sellerCountryCode: z.union([z.string(), z.null()]).optional().default(null),
    sellerTaxId: z.union([z.string(), z.null()]).default(null),
    sellerIban: z.union([z.string(), z.null()]).optional().default(null),
    sellerBic: z.union([z.string(), z.null()]).optional().default(null),
    sellerPhone: z.union([z.string(), z.null()]).default(null),
    bankName: z.union([z.string(), z.null()]).optional().default(null),
    lineItems: z.array(ExtractedInvoiceItemSchema).default([]),
    subtotal: z.coerce.number().default(0),
    taxRate: z.coerce.number().default(0),
    taxAmount: z.coerce.number().default(0),
    totalAmount: z.coerce.number().default(0),
    currency: z.string().default('EUR'),
    paymentTerms: z.union([z.string(), z.null()]).default(null),
    notes: z.union([z.string(), z.null()]).default(null),
});

/**
 * Service for Gemini AI invoice data extraction
 * Follows CONSTITUTION rules for error handling and logging
 */
export class GeminiService {
    private client: GoogleGenerativeAI | null = null;
    private model: GenerativeModel | null = null;

    private getClient(): GoogleGenerativeAI {
        if (!this.client) {
            const apiKey = process.env.GEMINI_API_KEY;

            if (!apiKey) {
                logger.error('GEMINI_API_KEY not found in environment');
                throw new AppError('GEMINI_CONFIG_ERROR', 'GEMINI_API_KEY not configured', 500);
            }

            logger.info('Initializing Gemini client');
            this.client = new GoogleGenerativeAI(apiKey);
        }
        return this.client;
    }

    private getModel(): GenerativeModel {
        if (!this.model) {
            this.model = this.getClient().getGenerativeModel({ model: 'gemini-2.0-flash' });
        }
        return this.model;
    }

    /**
     * Extract invoice data from file buffer using Gemini Vision
     */
    async extractFromFile(fileBuffer: Buffer, fileName: string): Promise<ExtractedInvoiceData> {
        const startTime = Date.now();

        try {
            // Validate input
            if (!fileBuffer || fileBuffer.length === 0) {
                throw new AppError('VALIDATION_ERROR', 'Empty file buffer provided', 400);
            }

            const base64Data = fileBuffer.toString('base64');
            const mediaType = this.getMediaType(fileName);

            logger.info('Starting Gemini extraction', {
                fileName,
                fileSize: fileBuffer.length,
                mediaType,
            });

            const model = this.getModel();

            // Make API call with timeout
            const responsePromise = model.generateContent([
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mediaType,
                    },
                },
                { text: EXTRACTION_PROMPT },
            ]);

            // FIX-018: Use AbortController to cancel the actual HTTP request on timeout
            const abortController = new AbortController();
            const timeoutId = setTimeout(() => abortController.abort(), API_TIMEOUTS.GEMINI_EXTRACTION);
            const timeoutPromise = new Promise<never>((_, reject) => {
                abortController.signal.addEventListener('abort', () => {
                    reject(new Error('Gemini API timeout'));
                });
            });

            let response;
            try {
                response = await Promise.race([responsePromise, timeoutPromise]);
                clearTimeout(timeoutId);
            } catch (apiError) {
                const responseTime = Date.now() - startTime;

                // Handle specific error types
                if (apiError instanceof Error) {
                    const errorMessage = apiError.message;
                    const errorName = apiError.name;

                    logger.error('Gemini API call failed', {
                        fileName,
                        responseTime,
                        errorName,
                        errorMessage,
                        errorStack: apiError.stack?.substring(0, 500),
                    });

                    // Timeout error
                    if (errorMessage.includes('timeout')) {
                        throw new AppError('GEMINI_TIMEOUT', 'Gemini API request timed out', 504);
                    }

                    // Auth errors
                    if (errorMessage.includes('API key') || errorMessage.includes('401') || errorMessage.includes('authentication')) {
                        throw new AppError('GEMINI_AUTH_ERROR', 'Gemini API authentication failed - check your API key', 401);
                    }

                    // Rate limit
                    if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
                        throw new AppError('GEMINI_RATE_LIMIT', 'Gemini API rate limit exceeded - try again later', 429);
                    }

                    // Permission/access errors
                    if (errorMessage.includes('403') || errorMessage.includes('forbidden') || errorMessage.includes('permission')) {
                        throw new AppError('GEMINI_FORBIDDEN', 'Gemini API access forbidden', 403);
                    }

                    // Invalid request
                    if (errorMessage.includes('400') || errorMessage.includes('invalid')) {
                        throw new AppError('GEMINI_INVALID_REQUEST', `Invalid request to Gemini API: ${errorMessage}`, 400);
                    }

                    // Server errors
                    if (errorMessage.includes('500') || errorMessage.includes('server')) {
                        throw new AppError('GEMINI_SERVER_ERROR', 'Gemini API server error', 500);
                    }

                    // Generic error with details
                    throw new AppError('GEMINI_ERROR', `Gemini API error: ${errorMessage}`, 500);
                }

                // Non-Error object
                logger.error('Gemini API unknown error type', {
                    errorType: typeof apiError,
                    errorValue: String(apiError),
                });

                throw new AppError('GEMINI_ERROR', 'Unknown Gemini API error', 500);
            }

            const responseTime = Date.now() - startTime;

            // Extract text content from response
            let textContent: string;
            try {
                textContent = response.response.text();
            } catch (textError) {
                logger.error('Failed to get text from Gemini response', {
                    responseTime,
                    responseStructure: JSON.stringify(response).substring(0, 500),
                    error: textError instanceof Error ? textError.message : String(textError),
                });
                throw new AppError('GEMINI_ERROR', 'Failed to extract text from Gemini response', 500);
            }

            if (!textContent) {
                logger.error('Empty text content from Gemini', {
                    responseTime,
                    hasResponse: !!response,
                    hasResponseObj: !!response?.response,
                });
                throw new AppError('GEMINI_ERROR', 'Empty response from Gemini API', 500);
            }

            logger.info('Gemini API response received', {
                fileName,
                responseTime,
                contentLength: textContent.length,
            });

            // Parse the response
            const extractedData = this.parseResponse(textContent);
            this.validateExtractedData(extractedData);

            logger.info('Gemini extraction successful', {
                fileName,
                responseTime,
                totalAmount: extractedData.totalAmount,
                itemCount: extractedData.lineItems.length,
            });

            return extractedData;
        } catch (error) {
            const responseTime = Date.now() - startTime;

            // Log detailed error info
            logger.error('Invoice extraction failed', {
                fileName,
                responseTime,
                errorType: error instanceof Error ? error.constructor.name : typeof error,
                errorMessage: error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
            });

            // Re-throw AppError as-is
            if (error instanceof AppError) {
                throw error;
            }

            // Wrap unknown errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new AppError('EXTRACTION_ERROR', `Failed to extract invoice data: ${errorMessage}`, 500);
        }
    }

    /**
     * Get media type from filename
     */
    private getMediaType(fileName: string): string {
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.pdf')) return 'application/pdf';
        if (lower.endsWith('.png')) return 'image/png';
        return 'image/jpeg';
    }

    /**
     * Parse JSON response from Gemini
     */
    private parseResponse(textContent: string): ExtractedInvoiceData {
        try {
            // FIX-014: Try direct parse first, then strip code blocks, then balanced brace extraction
            let rawJson: string | null = null;
            try {
                JSON.parse(textContent.trim());
                rawJson = textContent.trim();
            } catch {
                const codeBlockMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (codeBlockMatch && codeBlockMatch[1]) {
                    rawJson = codeBlockMatch[1].trim();
                } else {
                    const firstBrace = textContent.indexOf('{');
                    if (firstBrace !== -1) {
                        let depth = 0;
                        let lastBrace = -1;
                        for (let i = firstBrace; i < textContent.length; i++) {
                            if (textContent[i] === '{') depth++;
                            if (textContent[i] === '}') depth--;
                            if (depth === 0) { lastBrace = i; break; }
                        }
                        if (lastBrace !== -1) {
                            rawJson = textContent.substring(firstBrace, lastBrace + 1);
                        }
                    }
                }
            }

            if (!rawJson) {
                logger.error('No JSON found in Gemini response', {
                    responsePreview: textContent.substring(0, 300),
                });
                throw new Error('No JSON found in response');
            }

            const rawData = JSON.parse(rawJson);

            // FIX-015: Validate AI response with Zod schema
            const parseResult = ExtractedInvoiceDataSchema.safeParse(rawData);
            if (!parseResult.success) {
                logger.warn('Gemini response failed Zod validation, using raw data with defaults', {
                    errors: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
                });
            }
            const data = (parseResult.success ? parseResult.data : rawData) as ExtractedInvoiceData;

            logger.info('Parsed extraction data', {
                hasInvoiceNumber: !!data.invoiceNumber,
                hasBuyerName: !!data.buyerName,
                hasSellerName: !!data.sellerName,
                totalAmount: data.totalAmount,
                itemCount: Array.isArray(data.lineItems) ? data.lineItems.length : 0,
            });

            const subtotal = Number(data.subtotal) || 0;
            const totalAmount = Number(data.totalAmount) || 0;
            const rawTaxAmount = Number(data.taxAmount);
            const hasTaxAmount = data.taxAmount !== null && data.taxAmount !== undefined;
            const taxAmount = hasTaxAmount && !isNaN(rawTaxAmount) && !(rawTaxAmount === 0 && totalAmount > subtotal + 0.01)
                ? rawTaxAmount
                : (totalAmount > subtotal ? Math.round((totalAmount - subtotal) * 100) / 100 : 0);

            // Normalize empty string to undefined for tax rate
            const normalizedTaxRate = (typeof data.taxRate === 'string' && data.taxRate === '') ? undefined : data.taxRate;
            const hasTaxRate = normalizedTaxRate !== null && normalizedTaxRate !== undefined;
            let parsedTaxRate = hasTaxRate ? Number(normalizedTaxRate) : NaN;
            // FIX: Normalize decimal tax rate (0.19) to percentage (19)
            if (!isNaN(parsedTaxRate) && parsedTaxRate > 0 && parsedTaxRate < 1) {
                parsedTaxRate = Math.round(parsedTaxRate * 10000) / 100;
            }
            // FIX: Reject unrealistic tax rates (> 30%) — fall back to derived rate
            if (!isNaN(parsedTaxRate) && parsedTaxRate > 30) {
                parsedTaxRate = NaN;
            }
            const derivedTaxRate = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 0;

            const normalizeIban = (value: unknown): string | null => {
                if (value === null || value === undefined) return null;
                const text = String(value).replace(/\s+/g, '').toUpperCase();
                if (!text) return null;
                // FIX-016: Validate IBAN structure (15-34 chars, starts with 2 letters + 2 digits)
                if (text.length >= 15 && text.length <= 34 && /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(text)) {
                    return text;
                }
                logger.warn('Invalid IBAN format detected', { iban: text.substring(0, 4) + '...' });
                return text; // Return as-is, let downstream validation handle
            };

            return {
                invoiceNumber: data.invoiceNumber ?? null,
                invoiceDate: data.invoiceDate ?? null,
                buyerName: data.buyerName ?? null,
                buyerEmail: data.buyerEmail ?? null,
                buyerAddress: data.buyerAddress ?? null,
                buyerCity: data.buyerCity ?? null,
                buyerPostalCode: data.buyerPostalCode != null ? String(data.buyerPostalCode) : null,
                buyerCountryCode: data.buyerCountryCode ?? null,
                buyerTaxId: data.buyerTaxId ?? null,
                buyerPhone: data.buyerPhone ?? null,
                sellerName: data.sellerName ?? null,
                sellerEmail: data.sellerEmail ?? null,
                sellerAddress: data.sellerAddress ?? null,
                sellerCity: data.sellerCity ?? null,
                sellerPostalCode: data.sellerPostalCode != null ? String(data.sellerPostalCode) : null,
                sellerCountryCode: data.sellerCountryCode ?? null,
                sellerTaxId: data.sellerTaxId ?? null,
                sellerIban: normalizeIban(data.sellerIban),
                sellerBic: data.sellerBic ?? null,
                sellerPhone: data.sellerPhone ?? null,
                bankName: data.bankName ?? null,
                lineItems: (Array.isArray(data.lineItems) ? data.lineItems : []).map((item) => {
                    let itemRate = item.taxRate;
                    if (itemRate !== undefined && itemRate !== null) {
                        if (itemRate > 0 && itemRate < 1) itemRate = Math.round(itemRate * 10000) / 100;
                        if (itemRate > 30) itemRate = undefined;
                    }
                    return {
                        description: item.description || '',
                        quantity: item.quantity ?? 1,
                        unitPrice: item.unitPrice ?? 0,
                        totalPrice: item.totalPrice ?? 0,
                        taxRate: itemRate,
                    };
                }),
                subtotal,
                taxRate: !isNaN(parsedTaxRate) ? parsedTaxRate : derivedTaxRate,
                taxAmount,
                totalAmount,
                currency: data.currency || 'EUR',
                paymentTerms: data.paymentTerms ?? null,
                notes: data.notes ?? null,
            };
        } catch (parseError) {
            logger.error('Failed to parse Gemini response as JSON', {
                responsePreview: textContent.substring(0, 500),
                parseError: parseError instanceof Error ? parseError.message : String(parseError),
            });
            throw new AppError('EXTRACTION_ERROR', 'Failed to parse Gemini response as JSON', 400);
        }
    }

    /**
     * Validate extracted data has required fields
     */
    validateExtractedData(data: ExtractedInvoiceData): void {
        if (!data.totalAmount || typeof data.totalAmount !== 'number') {
            throw new AppError('VALIDATION_ERROR', 'Total amount is required', 400);
        }

        if (!Array.isArray(data.lineItems) || data.lineItems.length === 0) {
            throw new AppError('VALIDATION_ERROR', 'Invoice must have at least one item', 400);
        }

        for (const item of data.lineItems) {
            if (!item.description || !item.quantity || !item.unitPrice) {
                throw new AppError(
                    'VALIDATION_ERROR',
                    'Each item must have description, quantity, and unit price',
                    400
                );
            }
        }
    }

    /**
     * Calculate confidence score based on data completeness
     */
    calculateConfidenceScore(data: ExtractedInvoiceData): number {
        let score = 100;

        if (!data.invoiceNumber) score -= 5;
        if (!data.invoiceDate) score -= 5;
        if (!data.buyerName) score -= 10;
        if (!data.sellerName) score -= 10;
        if (!data.buyerTaxId) score -= 5;
        if (!data.sellerTaxId) score -= 5;
        if (!data.buyerEmail) score -= 3;
        if (!data.sellerEmail) score -= 3;
        if (!data.buyerAddress) score -= 3;
        if (!data.sellerAddress) score -= 3;

        return Math.max(0, score);
    }
}

export const geminiService = new GeminiService();
