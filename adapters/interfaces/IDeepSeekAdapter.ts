import { ExtractedInvoiceData } from '@/types';

export interface IDeepSeekAdapter {
    extractInvoiceData(
        fileBuffer: Buffer,
        mimeType: string
    ): Promise<DeepSeekExtractionResult>;

    getProviderName(): string;
    validateConfiguration(): boolean;
}

export interface DeepSeekExtractionResult {
    data: ExtractedInvoiceData;
    confidence: number;
    processingTimeMs: number;
    rawResponse?: unknown;
}
