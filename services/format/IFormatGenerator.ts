/**
 * Interface for e-invoice format generators.
 * All format generators (XRechnung CII, XRechnung UBL, PEPPOL BIS, Factur-X, etc.)
 * must implement this interface.
 * 
 * @module services/format/IFormatGenerator
 */

import type { CanonicalInvoice, OutputFormat } from '@/types/canonical-invoice';

/** Result of a format generation */
export interface GenerationResult {
  /** Generated XML content */
  xmlContent: string;
  /** Suggested file name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** Validation status after generation */
  validationStatus: 'valid' | 'invalid' | 'warnings';
  /** Validation error messages */
  validationErrors: string[];
  /** Validation warning messages */
  validationWarnings: string[];
  /** Optional PDF content for hybrid formats (e.g. Factur-X) */
  pdfContent?: Buffer;
  /** MIME type of the primary output (defaults to 'application/xml') */
  mimeType?: string;
}

/** Interface that all format generators must implement */
export interface IFormatGenerator {
  /** The output format this generator produces */
  readonly formatId: OutputFormat;

  /** Human-readable name of the format */
  readonly formatName: string;

  /**
   * Generate an e-invoice XML document from canonical invoice data.
   * @param invoice - Canonical invoice data
   * @returns Generation result with XML content and validation info
   */
  generate(invoice: CanonicalInvoice): Promise<GenerationResult>;

  /**
   * Validate generated XML (lightweight structural validation).
   * @param xml - Generated XML string
   * @returns Validation result
   */
  validate(xml: string): Promise<{ valid: boolean; errors: string[] }>;
}
