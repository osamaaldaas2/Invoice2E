import { ExtractedInvoiceData } from '@/types';

export interface IGeminiAdapter {
    extractInvoiceData(
        fileBuffer: Buffer,
        mimeType: string
    ): Promise<GeminiExtractionResult>;

    sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string>;
    getProviderName(): string;
    validateConfiguration(): boolean;
}

export interface GeminiExtractionResult {
    data: ExtractedInvoiceData;
    confidence: number;
    processingTimeMs: number;
    rawResponse?: unknown;
}
