import { ExtractedInvoiceData } from '@/types';

export interface IGeminiAdapter {
  extractInvoiceData(fileBuffer: Buffer, mimeType: string): Promise<GeminiExtractionResult>;

  sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string>;
  getProviderName(): string;
  validateConfiguration(): boolean;

  /** Optional: extract with pre-extracted text for better accuracy */
  extractWithText?(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { extractedText?: string }
  ): Promise<GeminiExtractionResult>;

  /** Optional: retry extraction with validation errors */
  extractWithRetry?(
    fileBuffer: Buffer,
    mimeType: string,
    retryPrompt: string
  ): Promise<GeminiExtractionResult>;
}

export interface GeminiExtractionResult {
  data: ExtractedInvoiceData;
  confidence: number;
  processingTimeMs: number;
  rawResponse?: unknown;
}
