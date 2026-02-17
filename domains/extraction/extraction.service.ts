/**
 * Extraction domain service.
 *
 * Orchestrates the invoice extraction flow:
 * upload → AI extraction → confidence scoring → persistence.
 *
 * During migration, this delegates to existing services.
 * Business logic will migrate here incrementally.
 *
 * @module domains/extraction
 */

import type { IExtractionRepository } from './extraction.repository';
import type {
  ExtractionRequest,
  ExtractionResult,
  InvoiceExtraction,
} from './types';

/** Dependencies injected into the extraction service. */
export interface ExtractionServiceDeps {
  readonly extractionRepository: IExtractionRepository;
  // Future: readonly aiExtractorFactory: IAIExtractorFactory;
  // Future: readonly billingService: IBillingService;
}

/**
 * Extraction domain service interface.
 *
 * Defines the public operations for the extraction bounded context.
 */
export interface IExtractionService {
  /**
   * Extract invoice data from an uploaded document.
   *
   * @param request - Extraction request with file and options.
   * @returns Extraction result with data and confidence score.
   * @throws ExtractionError on failure.
   */
  extract(request: ExtractionRequest): Promise<ExtractionResult>;

  /**
   * Retrieve an extraction by ID.
   *
   * @param id - Extraction record ID.
   * @param userId - Requesting user ID (for authorization).
   * @returns The extraction record, or null if not found.
   */
  getById(id: string, userId: string): Promise<InvoiceExtraction | null>;

  /**
   * List extractions for a user.
   *
   * @param userId - User ID.
   * @param limit - Max results (default 20).
   * @param offset - Pagination offset (default 0).
   * @returns Array of extraction records.
   */
  listByUser(userId: string, limit?: number, offset?: number): Promise<InvoiceExtraction[]>;
}

/**
 * Creates the extraction service.
 *
 * @param deps - Injected dependencies.
 * @returns Extraction service instance.
 */
export function createExtractionService(deps: ExtractionServiceDeps): IExtractionService {
  const { extractionRepository } = deps;

  return {
    async extract(_request: ExtractionRequest): Promise<ExtractionResult> {
      // TODO: Migrate from services/ai/extractor.factory.ts and services/invoice.db.service.ts
      // Phase 2: Wire up to existing services
      // Phase 3: Move logic here
      throw new Error('Not yet implemented — delegates to existing services during migration');
    },

    async getById(id: string, _userId: string): Promise<InvoiceExtraction | null> {
      return extractionRepository.findById(id);
    },

    async listByUser(userId: string, limit = 20, offset = 0): Promise<InvoiceExtraction[]> {
      return extractionRepository.findByUserId(userId, limit, offset);
    },
  };
}
