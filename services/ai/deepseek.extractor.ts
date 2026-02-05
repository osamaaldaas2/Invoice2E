import { IAIExtractor, ExtractedInvoiceData } from './IAIExtractor';
import { deepseekAdapter } from '@/adapters';
import { IDeepSeekAdapter } from '@/adapters/interfaces';

export class DeepSeekExtractor implements IAIExtractor {
    constructor(private adapter: IDeepSeekAdapter = deepseekAdapter) { }

    validateConfiguration(): boolean {
        return this.adapter.validateConfiguration();
    }

    getProviderName(): string {
        return 'DeepSeek';
    }

    async extractFromFile(buffer: Buffer, _fileName: string, fileType: string): Promise<ExtractedInvoiceData> {
        const result = await this.adapter.extractInvoiceData(buffer, fileType);
        return result.data;
    }
}
