export type { ExtractedInvoiceData } from '@/types';
import type { ExtractedInvoiceData } from '@/types';

export interface IAIExtractor {
    extractFromFile(fileBuffer: Buffer, fileName: string, fileType: string): Promise<ExtractedInvoiceData>;

    getProviderName(): string;

    validateConfiguration(): boolean;
}
