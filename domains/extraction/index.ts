/**
 * Extraction domain — public API.
 *
 * Import from `@/domains/extraction` to access extraction types, services, and repository interfaces.
 *
 * @module domains/extraction
 */

// Types
export type {
  ExtractionRequest,
  ExtractionResult,
  ExtractionErrorCodeType,
} from './types';
export { ExtractionErrorCode } from './types';

// Re-exported shared types used by consumers
export type {
  InvoiceExtraction,
  ExtractionStatusType,
  ExtractedInvoiceData,
} from './types';

// Repository interface
export type {
  IExtractionRepository,
  CreateExtractionInput,
  UpdateExtractionInput,
} from './extraction.repository';

// Service
export type { IExtractionService, ExtractionServiceDeps } from './extraction.service';
export { createExtractionService } from './extraction.service';
