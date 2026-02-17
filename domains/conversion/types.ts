/**
 * Conversion domain types.
 *
 * @module domains/conversion
 */

import type {
  InvoiceConversion,
  ConversionStatusType,
  CanonicalInvoice,
  OutputFormat,
} from '@/types';

export type { InvoiceConversion, ConversionStatusType, CanonicalInvoice, OutputFormat };

/** Supported e-invoice output formats. */
export const SupportedFormat = {
  ZUGFERD: 'zugferd',
  XRECHNUNG: 'xrechnung',
  FACTUR_X: 'factur-x',
} as const;

export type SupportedFormatType = (typeof SupportedFormat)[keyof typeof SupportedFormat];

/** Request to convert extracted data into an e-invoice format. */
export interface ConversionRequest {
  readonly userId: string;
  readonly extractionId: string;
  readonly targetFormat: SupportedFormatType;
  /** Reviewed/edited invoice data to convert. */
  readonly invoiceData: CanonicalInvoice;
}

/** Result of a successful conversion. */
export interface ConversionResult {
  readonly conversion: InvoiceConversion;
  /** Generated output (XML string, PDF buffer, etc.). */
  readonly output: string | Buffer;
  readonly validationStatus: string;
  readonly validationErrors: Record<string, unknown> | null;
}

/** Conversion domain error codes. */
export const ConversionErrorCode = {
  VALIDATION_FAILED: 'CONVERSION_VALIDATION_FAILED',
  FORMAT_ERROR: 'CONVERSION_FORMAT_ERROR',
  EXTRACTION_NOT_FOUND: 'CONVERSION_EXTRACTION_NOT_FOUND',
  INSUFFICIENT_CREDITS: 'CONVERSION_INSUFFICIENT_CREDITS',
  NOT_FOUND: 'CONVERSION_NOT_FOUND',
} as const;

export type ConversionErrorCodeType =
  (typeof ConversionErrorCode)[keyof typeof ConversionErrorCode];
