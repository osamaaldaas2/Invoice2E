/**
 * Conversion domain service.
 *
 * Orchestrates format conversion: validation → conversion → output generation.
 *
 * @module domains/conversion
 */

import type { IConversionRepository } from './conversion.repository';
import type {
  ConversionRequest,
  ConversionResult,
  InvoiceConversion,
} from './types';

/** Dependencies injected into the conversion service. */
export interface ConversionServiceDeps {
  readonly conversionRepository: IConversionRepository;
  // Future: readonly formatConverter: IFormatConverter;
  // Future: readonly validator: IInvoiceValidator;
}

/** Conversion domain service interface. */
export interface IConversionService {
  /** Convert extracted invoice data to the target format. */
  convert(request: ConversionRequest): Promise<ConversionResult>;

  /** Retrieve a conversion by ID. */
  getById(id: string, userId: string): Promise<InvoiceConversion | null>;

  /** List conversions for a user. */
  listByUser(userId: string, limit?: number, offset?: number): Promise<InvoiceConversion[]>;

  /** List conversions for an extraction. */
  listByExtraction(extractionId: string): Promise<InvoiceConversion[]>;
}

/** Creates the conversion service. */
export function createConversionService(deps: ConversionServiceDeps): IConversionService {
  const { conversionRepository } = deps;

  return {
    async convert(_request: ConversionRequest): Promise<ConversionResult> {
      // TODO: Migrate from services/review.service.ts and conversion logic
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },

    async getById(id: string, _userId: string): Promise<InvoiceConversion | null> {
      return conversionRepository.findById(id);
    },

    async listByUser(userId: string, limit = 20, offset = 0): Promise<InvoiceConversion[]> {
      return conversionRepository.findByUserId(userId, limit, offset);
    },

    async listByExtraction(extractionId: string): Promise<InvoiceConversion[]> {
      return conversionRepository.findByExtractionId(extractionId);
    },
  };
}
