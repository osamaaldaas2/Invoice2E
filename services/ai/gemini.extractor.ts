import { IAIExtractor, ExtractedInvoiceData } from './IAIExtractor';
import { geminiAdapter } from '@/adapters';
import { IGeminiAdapter } from '@/adapters/interfaces';
import { extractText } from '@/lib/text-extraction';
import { validateExtraction } from '@/lib/extraction-validator';
import { buildRetryPrompt, shouldRetry } from '@/lib/extraction-retry';
import { ENABLE_TEXT_EXTRACTION, ENABLE_EXTRACTION_RETRY } from '@/lib/constants';
import { logger } from '@/lib/logger';

export class GeminiExtractor implements IAIExtractor {
  constructor(private adapter: IGeminiAdapter = geminiAdapter) {}

  validateConfiguration(): boolean {
    return this.adapter.validateConfiguration();
  }

  getProviderName(): string {
    return 'Gemini';
  }

  async extractFromFile(
    buffer: Buffer,
    _fileName: string,
    fileType: string
  ): Promise<ExtractedInvoiceData> {
    // If adapter supports extractWithText, use the enhanced path
    if ('extractWithText' in this.adapter && this.adapter.extractWithText) {
      let extractedText: string | undefined;

      if (ENABLE_TEXT_EXTRACTION) {
        try {
          const textResult = await extractText(buffer, fileType);
          if (textResult.hasText) {
            extractedText = textResult.text;
            logger.info('Pre-extracted text available for Gemini', {
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

      let result = await this.adapter.extractWithText!(buffer, fileType, { extractedText });
      let data = result.data;

      // Validation + retry
      if (
        ENABLE_EXTRACTION_RETRY &&
        'extractWithRetry' in this.adapter &&
        this.adapter.extractWithRetry
      ) {
        let validation = validateExtraction(data);
        let attempt = 0;

        while (!validation.valid && shouldRetry(attempt)) {
          attempt++;
          logger.info('Gemini extraction validation failed, retrying', {
            attempt,
            errors: validation.errors.length,
          });

          const retryPrompt = buildRetryPrompt({
            originalJson: JSON.stringify(data),
            validationErrors: validation.errors,
            extractedText,
            attempt,
          });

          result = await this.adapter.extractWithRetry!(buffer, fileType, retryPrompt);
          data = result.data;
          validation = validateExtraction(data);
        }

        if (!validation.valid) {
          data.confidence = Math.max(0.3, (data.confidence ?? 0.8) - 0.2);
          data.validationWarnings = validation.errors.map(
            (e) =>
              `${e.field}: ${e.message}${e.expected != null ? ` (expected ${e.expected}, got ${e.actual})` : ''}`
          );
          logger.warn('Gemini extraction still has validation errors after retries', {
            errors: validation.errors,
          });
        }
      }

      return data;
    }

    // Fallback to standard extraction
    const result = await this.adapter.extractInvoiceData(buffer, fileType);
    return result.data;
  }
}
