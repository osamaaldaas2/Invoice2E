/**
 * Extraction domain types.
 *
 * During migration, some types re-export from the shared `types/` module.
 * Over time, extraction-specific types will be defined here exclusively.
 */

import type {
  InvoiceExtraction,
  ExtractionStatusType,
  ExtractedInvoiceData,
} from '@/types';

// Re-export shared types used within this domain
export type { InvoiceExtraction, ExtractionStatusType, ExtractedInvoiceData };

/** Options for initiating an extraction. */
export interface ExtractionRequest {
  /** ID of the user requesting extraction. */
  readonly userId: string;
  /** Uploaded file buffer. */
  readonly fileBuffer: Buffer;
  /** Original filename. */
  readonly fileName: string;
  /** MIME type of the uploaded file. */
  readonly mimeType: string;
  /** Preferred AI provider (optional — factory decides default). */
  readonly aiProvider?: string;
  /** Desired output format hint (e.g. 'zugferd', 'xrechnung'). */
  readonly outputFormat?: string;
}

/** Result returned after a successful extraction. */
export interface ExtractionResult {
  /** The persisted extraction record. */
  readonly extraction: InvoiceExtraction;
  /** Extracted invoice data. */
  readonly data: ExtractedInvoiceData;
  /** Confidence score 0–1. */
  readonly confidenceScore: number;
  /** Processing time in milliseconds. */
  readonly processingTimeMs: number;
}

/** Extraction domain error codes. */
export const ExtractionErrorCode = {
  FILE_TOO_LARGE: 'EXTRACTION_FILE_TOO_LARGE',
  UNSUPPORTED_FORMAT: 'EXTRACTION_UNSUPPORTED_FORMAT',
  AI_PROVIDER_ERROR: 'EXTRACTION_AI_PROVIDER_ERROR',
  LOW_CONFIDENCE: 'EXTRACTION_LOW_CONFIDENCE',
  INSUFFICIENT_CREDITS: 'EXTRACTION_INSUFFICIENT_CREDITS',
  NOT_FOUND: 'EXTRACTION_NOT_FOUND',
} as const;

export type ExtractionErrorCodeType =
  (typeof ExtractionErrorCode)[keyof typeof ExtractionErrorCode];
