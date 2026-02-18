/**
 * @deprecated Use adapters/gemini.adapter.ts (GeminiAdapter implementing IAIExtractor) instead.
 * This file is kept for backward compatibility but is NOT used in production.
 * The adapter pattern in adapters/ is the canonical implementation.
 */
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { API_TIMEOUTS } from '@/lib/constants';
import { EXTRACTION_PROMPT } from '@/lib/extraction-prompt';
import { normalizeExtractedData, parseJsonFromAiResponse } from '@/lib/extraction-normalizer';

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

const AllowanceChargeSchema = z.object({
  chargeIndicator: z.boolean().default(false),
  amount: z.coerce.number().default(0),
  baseAmount: z.union([z.coerce.number(), z.null()]).optional().default(null),
  percentage: z.union([z.coerce.number(), z.null()]).optional().default(null),
  reason: z.union([z.string(), z.null()]).optional().default(null),
  reasonCode: z.union([z.string(), z.null()]).optional().default(null),
  taxRate: z.union([z.coerce.number(), z.null()]).optional().default(null),
  taxCategoryCode: z.union([z.string(), z.null()]).optional().default(null),
});

const ExtractedInvoiceDataSchema = z.object({
  invoiceNumber: z.union([z.string(), z.null()]).default(null),
  invoiceDate: z.union([z.string(), z.null()]).default(null),
  dueDate: z.union([z.string(), z.null()]).optional().default(null),
  documentTypeCode: z.coerce.number().optional(),
  buyerName: z.union([z.string(), z.null()]).default(null),
  buyerEmail: z.union([z.string(), z.null()]).default(null),
  buyerAddress: z.union([z.string(), z.null()]).default(null),
  buyerCity: z.union([z.string(), z.null()]).default(null),
  buyerPostalCode: z.union([z.coerce.string(), z.null()]).default(null),
  buyerCountryCode: z.union([z.string(), z.null()]).optional().default(null),
  buyerTaxId: z.union([z.string(), z.null()]).default(null),
  buyerVatId: z.union([z.string(), z.null()]).optional().default(null),
  buyerPhone: z.union([z.string(), z.null()]).default(null),
  buyerReference: z.union([z.string(), z.null()]).optional().default(null),
  buyerElectronicAddress: z.union([z.string(), z.null()]).optional().default(null),
  buyerElectronicAddressScheme: z.union([z.string(), z.null()]).optional().default(null),
  sellerName: z.union([z.string(), z.null()]).default(null),
  sellerEmail: z.union([z.string(), z.null()]).default(null),
  sellerAddress: z.union([z.string(), z.null()]).default(null),
  sellerCity: z.union([z.string(), z.null()]).default(null),
  sellerPostalCode: z.union([z.coerce.string(), z.null()]).default(null),
  sellerCountryCode: z.union([z.string(), z.null()]).optional().default(null),
  sellerTaxId: z.union([z.string(), z.null()]).default(null),
  sellerVatId: z.union([z.string(), z.null()]).optional().default(null),
  sellerTaxNumber: z.union([z.string(), z.null()]).optional().default(null),
  sellerIban: z.union([z.string(), z.null()]).optional().default(null),
  sellerBic: z.union([z.string(), z.null()]).optional().default(null),
  sellerPhone: z.union([z.string(), z.null()]).default(null),
  sellerContactName: z.union([z.string(), z.null()]).optional().default(null),
  sellerElectronicAddress: z.union([z.string(), z.null()]).optional().default(null),
  sellerElectronicAddressScheme: z.union([z.string(), z.null()]).optional().default(null),
  bankName: z.union([z.string(), z.null()]).optional().default(null),
  lineItems: z.array(ExtractedInvoiceItemSchema).default([]),
  allowanceCharges: z.array(AllowanceChargeSchema).optional().default([]),
  // IMPORTANT: subtotal/taxAmount use .optional() so null from AI stays null
  // (not coerced to 0). The normalizer handles null → computed fallback.
  subtotal: z.union([z.coerce.number(), z.null()]).optional().default(null),
  taxRate: z.union([z.coerce.number(), z.null()]).optional().default(null),
  taxAmount: z.union([z.coerce.number(), z.null()]).optional().default(null),
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
      const modelName = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
      this.model = this.getClient().getGenerativeModel({
        model: modelName,
        generationConfig: {
          // @ts-expect-error – thinkingConfig is supported by Gemini 2.5 but not yet in the SDK types
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
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
          if (
            errorMessage.includes('API key') ||
            errorMessage.includes('401') ||
            errorMessage.includes('authentication')
          ) {
            throw new AppError(
              'GEMINI_AUTH_ERROR',
              'Gemini API authentication failed - check your API key',
              401
            );
          }

          // Rate limit
          if (
            errorMessage.includes('429') ||
            errorMessage.includes('quota') ||
            errorMessage.includes('rate limit')
          ) {
            throw new AppError(
              'GEMINI_RATE_LIMIT',
              'Gemini API rate limit exceeded - try again later',
              429
            );
          }

          // Permission/access errors
          if (
            errorMessage.includes('403') ||
            errorMessage.includes('forbidden') ||
            errorMessage.includes('permission')
          ) {
            throw new AppError('GEMINI_FORBIDDEN', 'Gemini API access forbidden', 403);
          }

          // Invalid request
          if (errorMessage.includes('400') || errorMessage.includes('invalid')) {
            throw new AppError(
              'GEMINI_INVALID_REQUEST',
              `Invalid request to Gemini API: ${errorMessage}`,
              400
            );
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
      throw new AppError(
        'EXTRACTION_ERROR',
        `Failed to extract invoice data: ${errorMessage}`,
        500
      );
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
      // FIX-014: Robust JSON extraction (direct parse, code blocks, balanced braces)
      const rawData = parseJsonFromAiResponse(textContent) as Record<string, unknown>;

      // FORENSIC_STAGE_1: Log parsed JSON types BEFORE Zod coercion
      // FIX-015: Validate AI response with Zod schema
      const parseResult = ExtractedInvoiceDataSchema.safeParse(rawData);
      if (!parseResult.success) {
        logger.warn('Gemini response failed Zod validation, using raw data with defaults', {
          errors: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        });
      }
      const data = (parseResult.success ? parseResult.data : rawData) as Record<string, unknown>;

      logger.info('Parsed extraction data', {
        hasInvoiceNumber: !!data.invoiceNumber,
        hasBuyerName: !!data.buyerName,
        hasSellerName: !!data.sellerName,
        totalAmount: data.totalAmount,
        itemCount: Array.isArray(data.lineItems) ? data.lineItems.length : 0,
      });

      return normalizeExtractedData(data);
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
