/**
 * Conversion repository interface.
 *
 * @module domains/conversion
 */

import type { InvoiceConversion } from './types';

/** Data required to create a new conversion record. */
export interface CreateConversionInput {
  readonly userId: string;
  readonly extractionId: string;
  readonly conversionFormat: string;
  readonly outputFormat?: string;
  readonly invoiceNumber?: string;
  readonly buyerName?: string;
}

/** Data for updating a conversion record. */
export interface UpdateConversionInput {
  readonly validationStatus?: string;
  readonly validationErrors?: Record<string, unknown>;
  readonly conversionStatus?: string;
  readonly emailSent?: boolean;
  readonly emailSentAt?: Date;
  readonly emailRecipient?: string;
  readonly fileDownloadTriggered?: boolean;
  readonly downloadTriggeredAt?: Date;
  readonly creditsUsed?: number;
  readonly rowVersion: number;
}

/** Repository interface for conversion persistence. */
export interface IConversionRepository {
  create(data: CreateConversionInput): Promise<InvoiceConversion>;
  findById(id: string): Promise<InvoiceConversion | null>;
  findByUserId(userId: string, limit?: number, offset?: number): Promise<InvoiceConversion[]>;
  findByExtractionId(extractionId: string): Promise<InvoiceConversion[]>;
  update(id: string, data: UpdateConversionInput): Promise<InvoiceConversion>;
}
