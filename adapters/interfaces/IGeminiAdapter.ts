import { ExtractedInvoiceData } from '@/types';

export interface IGeminiAdapter {
    extractInvoiceData(
        fileBuffer: Buffer,
        mimeType: string
    ): Promise<GeminiExtractionResult>;

    getProviderName(): string;
    validateConfiguration(): boolean;
}

export interface GeminiExtractionResult {
    data: ExtractedInvoiceData;
    confidence: number;
    processingTimeMs: number;
    rawResponse?: unknown;
}
