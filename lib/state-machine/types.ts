/**
 * @module lib/state-machine/types
 * @description Type definitions for the invoice lifecycle state machine.
 *
 * Intent: Provide strict types for states, events, context, and guards
 * used by the XState v5 invoice machine.
 */

/** All possible invoice lifecycle states. */
export const InvoiceStateEnum = {
  UPLOADED: 'UPLOADED',
  QUARANTINED: 'QUARANTINED',
  SCANNING: 'SCANNING',
  SCAN_FAILED: 'SCAN_FAILED',
  EXTRACTING: 'EXTRACTING',
  EXTRACTED: 'EXTRACTED',
  REVIEW: 'REVIEW',
  CONVERTING: 'CONVERTING',
  CONVERTED: 'CONVERTED',
  FAILED: 'FAILED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type InvoiceState = (typeof InvoiceStateEnum)[keyof typeof InvoiceStateEnum];

/** Maximum retry attempts before the invoice enters a terminal failure state. */
export const MAX_RETRY_COUNT = 3;

/** Supported output formats for conversion. */
export const VALID_FORMATS = ['zugferd', 'xrechnung', 'facturx'] as const;
export type ValidFormat = (typeof VALID_FORMATS)[number];

/** Context carried through the entire machine lifecycle. */
export interface InvoiceContext {
  /** Unique invoice identifier. */
  invoiceId: string;
  /** Owner user identifier. */
  userId: string;
  /** Number of retry attempts consumed so far. */
  retryCount: number;
  /** Desired output format for conversion. */
  format: ValidFormat | string;
  /** Last error message, if any. */
  errorMessage: string | null;
}

// ── Events ─────────────────────────────────────────────────────────────

export type UploadEvent = { type: 'UPLOAD' };
export type QuarantineEvent = { type: 'QUARANTINE' };
export type ScanPassEvent = { type: 'SCAN_PASS' };
export type ScanFailEvent = { type: 'SCAN_FAIL'; errorMessage?: string };
export type ExtractEvent = { type: 'EXTRACT' };
export type ExtractSuccessEvent = { type: 'EXTRACT_SUCCESS' };
export type ExtractFailEvent = { type: 'EXTRACT_FAIL'; errorMessage?: string };
export type ApproveEvent = { type: 'APPROVE' };
export type ConvertEvent = { type: 'CONVERT' };
export type ConvertSuccessEvent = { type: 'CONVERT_SUCCESS' };
export type ConvertFailEvent = { type: 'CONVERT_FAIL'; errorMessage?: string };
export type ArchiveEvent = { type: 'ARCHIVE' };
export type RetryEvent = { type: 'RETRY' };

/** Union of all events the invoice machine accepts. */
export type InvoiceEvent =
  | UploadEvent
  | QuarantineEvent
  | ScanPassEvent
  | ScanFailEvent
  | ExtractEvent
  | ExtractSuccessEvent
  | ExtractFailEvent
  | ApproveEvent
  | ConvertEvent
  | ConvertSuccessEvent
  | ConvertFailEvent
  | ArchiveEvent
  | RetryEvent;
