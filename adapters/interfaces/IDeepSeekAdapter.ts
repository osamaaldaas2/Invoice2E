import { ExtractedInvoiceData } from '@/types';

export interface IDeepSeekAdapter {
  extractInvoiceData(fileBuffer: Buffer, mimeType: string): Promise<DeepSeekExtractionResult>;

  sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string>;
  getProviderName(): string;
  validateConfiguration(): boolean;

  /** Optional: extract with pre-extracted text for better accuracy */
  extractWithText?(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { extractedText?: string }
  ): Promise<DeepSeekExtractionResult>;

  /** Optional: retry extraction with validation errors */
  extractWithRetry?(
    fileBuffer: Buffer,
    mimeType: string,
    retryPrompt: string
  ): Promise<DeepSeekExtractionResult>;
}

export interface DeepSeekExtractionResult {
  data: ExtractedInvoiceData;
  confidence: number;
  processingTimeMs: number;
  rawResponse?: unknown;
}
