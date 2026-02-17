/**
 * Conversion domain — public API.
 *
 * @module domains/conversion
 */

export type {
  ConversionRequest,
  ConversionResult,
  ConversionErrorCodeType,
  SupportedFormatType,
  InvoiceConversion,
  ConversionStatusType,
  CanonicalInvoice,
  OutputFormat,
} from './types';
export { ConversionErrorCode, SupportedFormat } from './types';

export type {
  IConversionRepository,
  CreateConversionInput,
  UpdateConversionInput,
} from './conversion.repository';

export type { IConversionService, ConversionServiceDeps } from './conversion.service';
export { createConversionService } from './conversion.service';
