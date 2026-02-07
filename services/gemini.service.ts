import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { API_TIMEOUTS } from '@/lib/constants';

export type ExtractedInvoiceData = {
    invoiceNumber: string | null;
    invoiceDate: string | null;
    buyerName: string | null;
    buyerEmail: string | null;
    buyerAddress: string | null;
    buyerTaxId: string | null;
    supplierName: string | null;
    supplierEmail: string | null;
    supplierAddress: string | null;
    supplierTaxId: string | null;
    sellerIban?: string | null;
    sellerBic?: string | null;
    bankName?: string | null;
    items: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
    }>;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    paymentTerms: string | null;
    notes: string | null;
};

const EXTRACTION_PROMPT = `You are an expert invoice extraction system. Extract invoice data from the provided image and return a JSON object with the following structure:

{
  "invoiceNumber": "string or null",
  "invoiceDate": "string (YYYY-MM-DD) or null",
  "buyerName": "string or null",
  "buyerEmail": "string or null",
  "buyerAddress": "string or null",
  "buyerTaxId": "string or null",
  "supplierName": "string or null",
  "supplierEmail": "string or null",
  "supplierAddress": "string or null",
  "supplierTaxId": "string or null",
  "sellerIban": "string or null",
  "sellerBic": "string or null",
  "bankName": "string or null",
  "items": [
    {
      "description": "string",
      "quantity": number,
      "unitPrice": number,
      "totalPrice": number
    }
  ],
  "subtotal": number,
  "taxRate": number,
  "taxAmount": number,
  "totalAmount": number,
  "currency": "string (e.g., EUR, USD)",
  "paymentTerms": "string or null",
  "notes": "string or null"
}

IMPORTANT:
1. Extract ALL visible information from the invoice
2. For prices, use the exact values shown as numbers
3. If tax is not separate, calculate based on total and subtotal
4. Return ONLY valid JSON, no markdown, no code blocks
5. Use null for missing fields
6. Ensure all numbers are valid numbers, not strings
7. Be accurate with dates (YYYY-MM-DD format)

Extract the data now:`;

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

            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Gemini API timeout')), API_TIMEOUTS.GEMINI_EXTRACTION)
            );

            let response;
            try {
                response = await Promise.race([responsePromise, timeoutPromise]);
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
                itemCount: extractedData.items.length,
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
            // Try to extract JSON from response
            const jsonMatch = textContent.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                logger.error('No JSON found in Gemini response', {
                    responsePreview: textContent.substring(0, 300),
                });
                throw new Error('No JSON found in response');
            }

            const data = JSON.parse(jsonMatch[0]) as ExtractedInvoiceData;

            logger.info('Parsed extraction data', {
                hasInvoiceNumber: !!data.invoiceNumber,
                hasBuyerName: !!data.buyerName,
                hasSupplierName: !!data.supplierName,
                totalAmount: data.totalAmount,
                itemCount: Array.isArray(data.items) ? data.items.length : 0,
            });

            const subtotal = Number(data.subtotal) || 0;
            const totalAmount = Number(data.totalAmount) || 0;
            const rawTaxAmount = Number(data.taxAmount);
            const hasTaxAmount = data.taxAmount !== null && data.taxAmount !== undefined;
            const taxAmount = hasTaxAmount && !(rawTaxAmount === 0 && totalAmount > subtotal + 0.01)
                ? rawTaxAmount
                : (totalAmount > subtotal ? Math.round((totalAmount - subtotal) * 100) / 100 : 0);
            const hasTaxRate = data.taxRate !== null && data.taxRate !== undefined;
            const parsedTaxRate = hasTaxRate ? Number(data.taxRate) : NaN;
            const derivedTaxRate = subtotal > 0 ? Math.round((taxAmount / subtotal) * 10000) / 100 : 0;

            const normalizeIban = (value: unknown) => {
                if (value === null || value === undefined) return null;
                const text = String(value).replace(/\s+/g, '').toUpperCase();
                return text || null;
            };

            return {
                invoiceNumber: data.invoiceNumber ?? null,
                invoiceDate: data.invoiceDate ?? null,
                buyerName: data.buyerName ?? null,
                buyerEmail: data.buyerEmail ?? null,
                buyerAddress: data.buyerAddress ?? null,
                buyerTaxId: data.buyerTaxId ?? null,
                supplierName: data.supplierName ?? null,
                supplierEmail: data.supplierEmail ?? null,
                supplierAddress: data.supplierAddress ?? null,
                supplierTaxId: data.supplierTaxId ?? null,
                sellerIban: normalizeIban(data.sellerIban),
                sellerBic: data.sellerBic ?? null,
                bankName: data.bankName ?? null,
                items: Array.isArray(data.items) ? data.items : [],
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

        if (!Array.isArray(data.items) || data.items.length === 0) {
            throw new AppError('VALIDATION_ERROR', 'Invoice must have at least one item', 400);
        }

        for (const item of data.items) {
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
        if (!data.supplierName) score -= 10;
        if (!data.buyerTaxId) score -= 5;
        if (!data.supplierTaxId) score -= 5;
        if (!data.buyerEmail) score -= 3;
        if (!data.supplierEmail) score -= 3;
        if (!data.buyerAddress) score -= 3;
        if (!data.supplierAddress) score -= 3;

        return Math.max(0, score);
    }
}

export const geminiService = new GeminiService();
