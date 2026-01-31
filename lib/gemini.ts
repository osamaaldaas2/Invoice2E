/**
 * Placeholder for Gemini API integration
 * Will be implemented in Phase 2, Step 2.2
 *
 * This file will contain:
 * - Gemini client initialization
 * - Invoice data extraction methods
 * - Structured output parsing
 */

// Placeholder for Gemini client configuration
export const geminiClient = {
    // Methods will be added in Phase 2
    extract: async (_file: Buffer): Promise<unknown> => {
        throw new Error('Gemini integration not implemented yet. Please wait for Phase 2.');
    },
};

// Export placeholder types
export type GeminiExtractionResult = {
    invoiceNumber: string;
    issueDate: string;
    seller: unknown;
    buyer: unknown;
    lineItems: unknown[];
    totals: unknown;
    confidenceScore: number;
};
