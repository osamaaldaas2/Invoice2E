import { IAIExtractor, ExtractedInvoiceData } from './IAIExtractor';
import { mistralAdapter } from '@/adapters';
import { IMistralAdapter } from '@/adapters/interfaces';
import { extractText } from '@/lib/text-extraction';
import { validateExtraction } from '@/lib/extraction-validator';
import { buildRetryPrompt, shouldRetry } from '@/lib/extraction-retry';
import { ENABLE_TEXT_EXTRACTION, ENABLE_EXTRACTION_RETRY } from '@/lib/constants';
import { logger } from '@/lib/logger';

export class MistralExtractor implements IAIExtractor {
  constructor(private adapter: IMistralAdapter = mistralAdapter) {}

  validateConfiguration(): boolean {
    return this.adapter.validateConfiguration();
  }

  getProviderName(): string {
    return 'Mistral';
  }

  async extractFromFile(
    buffer: Buffer,
    _fileName: string,
    fileType: string
  ): Promise<ExtractedInvoiceData> {
    // Use extractWithText path if available (supports retry)
    if ('extractWithText' in this.adapter && this.adapter.extractWithText) {
      let extractedText: string | undefined;

      // Text extraction (including Mistral OCR for images) is handled upstream
      if (ENABLE_TEXT_EXTRACTION) {
        try {
          const textResult = await extractText(buffer, fileType);
          if (textResult.hasText) {
            extractedText = textResult.text;
            logger.info('Text extraction for Mistral', {
              source: textResult.source,
              textLength: textResult.text.length,
            });
          }
        } catch (error) {
          logger.warn('Text extraction failed', {
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
          logger.info('Mistral extraction validation failed, retrying', {
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
          data.confidence = Math.max(0.3, (data.confidence ?? 0.7) - 0.2);
          data.validationWarnings = validation.errors.map(
            (e) =>
              `${e.field}: ${e.message}${e.expected != null ? ` (expected ${e.expected}, got ${e.actual})` : ''}`
          );
          logger.warn('Mistral extraction still has validation errors after retries', {
            errors: validation.errors,
          });
        }
      }

      return data;
    }

    // Fallback to standard two-step extraction
    const result = await this.adapter.extractInvoiceData(buffer, fileType);
    return result.data;
  }
}
