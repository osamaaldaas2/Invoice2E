import { IAIExtractor, ExtractedInvoiceData } from './IAIExtractor';
import { geminiAdapter } from '@/adapters';
import { IGeminiAdapter } from '@/adapters/interfaces';

export class GeminiExtractor implements IAIExtractor {
    constructor(private adapter: IGeminiAdapter = geminiAdapter) { }

    validateConfiguration(): boolean {
        return this.adapter.validateConfiguration();
    }

    getProviderName(): string {
        return 'Gemini';
    }

    async extractFromFile(buffer: Buffer, _fileName: string, fileType: string): Promise<ExtractedInvoiceData> {
        const result = await this.adapter.extractInvoiceData(buffer, fileType);
        return result.data;
    }
}
