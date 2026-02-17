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
   * Semantic version of this generator implementation (semver).
   * Tracks internal changes to the generator code itself.
   * @example '1.0.0'
   */
  readonly version: string;

  /**
   * Spec version of the standard this generator targets.
   * Examples: '3.0.20' (Peppol BIS), '3.0' (XRechnung), '1.3.1' (FatturaPA)
   */
  readonly specVersion: string;

  /**
   * Release date of the spec version this generator targets (ISO 8601 date).
   * Used by /api/health to surface compliance-status for each format.
   */
  readonly specDate: string;

  /**
   * Whether this generator is deprecated and should no longer be used for new invoices.
   * Deprecated generators remain available for backward compatibility.
   */
  readonly deprecated?: boolean;

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
