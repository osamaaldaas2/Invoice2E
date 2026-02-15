import { IAIExtractor, ExtractedInvoiceData } from './IAIExtractor';
import { openaiAdapter } from '@/adapters';
import { IOpenAIAdapter } from '@/adapters/interfaces';
import { extractText } from '@/lib/text-extraction';
import { ENABLE_TEXT_EXTRACTION, ENABLE_STRUCTURED_OUTPUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';

export class OpenAIExtractor implements IAIExtractor {
  constructor(private adapter: IOpenAIAdapter = openaiAdapter) {}

  validateConfiguration(): boolean {
    return this.adapter.validateConfiguration();
  }

  getProviderName(): string {
    return 'OpenAI';
  }

  async extractFromFile(
    buffer: Buffer,
    _fileName: string,
    fileType: string
  ): Promise<ExtractedInvoiceData> {
    // If adapter supports structured outputs, use the enhanced path
    if (ENABLE_STRUCTURED_OUTPUTS && 'extractWithStructuredOutputs' in this.adapter) {
      let extractedText: string | undefined;

      if (ENABLE_TEXT_EXTRACTION) {
        try {
          const textResult = await extractText(buffer, fileType);
          if (textResult.hasText) {
            extractedText = textResult.text;
            logger.info('Pre-extracted text available for OpenAI', {
              source: textResult.source,
              textLength: textResult.text.length,
            });
          }
        } catch (error) {
          logger.warn('Text extraction failed, proceeding without', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const result = await (this.adapter as any).extractWithStructuredOutputs(buffer, fileType, {
        extractedText,
      });
      return result.data;
    }

    // Fallback to standard extraction
    const result = await this.adapter.extractInvoiceData(buffer, fileType);
    return result.data;
  }
}
