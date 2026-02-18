/**
 * Extraction repository interface.
 *
 * Defines the data access contract for the extraction domain.
 * Implementations may delegate to `services/invoice.db.service.ts` during migration.
 *
 * @module domains/extraction
 */

import type {
  InvoiceExtraction,
  ExtractionStatusType,
} from './types';

/** Data required to create a new extraction record. */
export interface CreateExtractionInput {
  readonly userId: string;
  readonly extractionData: Record<string, unknown>;
  readonly confidenceScore?: number;
  readonly geminiResponseTimeMs?: number;
  readonly status: ExtractionStatusType;
  readonly outputFormat?: string;
}

/** Data for updating an existing extraction record. */
export interface UpdateExtractionInput {
  readonly extractionData?: Record<string, unknown>;
  readonly confidenceScore?: number;
  readonly status?: ExtractionStatusType;
  readonly errorMessage?: string;
  readonly rowVersion: number;
}

/**
 * Repository interface for extraction persistence.
 *
 * All methods are async and must handle optimistic locking
 * via `rowVersion` where applicable.
 */
export interface IExtractionRepository {
  /** Create a new extraction record. */
  create(data: CreateExtractionInput): Promise<InvoiceExtraction>;

  /** Find an extraction by ID. Returns null if not found. */
  findById(id: string): Promise<InvoiceExtraction | null>;

  /** Find all extractions for a user, ordered by creation date descending. */
  findByUserId(userId: string, limit?: number, offset?: number): Promise<InvoiceExtraction[]>;

  /** Update an extraction record with optimistic locking. */
  update(id: string, data: UpdateExtractionInput): Promise<InvoiceExtraction>;

  /** Count extractions for a user, optionally filtered by status. */
  countByUserId(userId: string, status?: ExtractionStatusType): Promise<number>;
}
