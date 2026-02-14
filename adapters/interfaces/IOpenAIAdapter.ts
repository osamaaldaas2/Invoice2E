import { ExtractedInvoiceData } from '@/types';

export interface IOpenAIAdapter {
    extractInvoiceData(
        fileBuffer: Buffer,
        mimeType: string
    ): Promise<OpenAIExtractionResult>;

    sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string>;
    getProviderName(): string;
    validateConfiguration(): boolean;
}

export interface OpenAIExtractionResult {
    data: ExtractedInvoiceData;
    confidence: number;
    processingTimeMs: number;
    rawResponse?: unknown;
}
