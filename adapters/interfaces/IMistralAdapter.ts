import { ExtractedInvoiceData } from '@/types';

export interface IMistralAdapter {
  /** Standard extraction (two-step: OCR → Chat) */
  extractInvoiceData(fileBuffer: Buffer, mimeType: string): Promise<MistralExtractionResult>;

  /** Send a raw prompt with file context (for boundary detection) */
  sendPrompt(fileBuffer: Buffer, mimeType: string, prompt: string): Promise<string>;

  getProviderName(): string;
  validateConfiguration(): boolean;

  /** Extract with pre-extracted text (skips OCR step) */
  extractWithText?(
    fileBuffer: Buffer,
    mimeType: string,
    options?: { extractedText?: string }
  ): Promise<MistralExtractionResult>;

  /** Retry extraction with validation error context */
  extractWithRetry?(
    fileBuffer: Buffer,
    mimeType: string,
    retryPrompt: string
  ): Promise<MistralExtractionResult>;

}

export interface MistralExtractionResult {
  data: ExtractedInvoiceData;
  confidence: number;
  processingTimeMs: number;
  rawResponse?: unknown;
}
