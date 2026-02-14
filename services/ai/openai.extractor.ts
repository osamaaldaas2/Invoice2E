import { IAIExtractor, ExtractedInvoiceData } from './IAIExtractor';
import { openaiAdapter } from '@/adapters';
import { IOpenAIAdapter } from '@/adapters/interfaces';

export class OpenAIExtractor implements IAIExtractor {
    constructor(private adapter: IOpenAIAdapter = openaiAdapter) { }

    validateConfiguration(): boolean {
        return this.adapter.validateConfiguration();
    }

    getProviderName(): string {
        return 'OpenAI';
    }

    async extractFromFile(buffer: Buffer, _fileName: string, fileType: string): Promise<ExtractedInvoiceData> {
        const result = await this.adapter.extractInvoiceData(buffer, fileType);
        return result.data;
    }
}
