/**
 * File Quarantine Types
 *
 * Type definitions for the file quarantine pattern.
 * Uploaded files are quarantined, scanned, then promoted or rejected.
 */

import { z } from 'zod';

/** Quarantine lifecycle statuses */
export type QuarantineStatus = 'quarantined' | 'scanning' | 'clean' | 'rejected' | 'promoted';

/** Result of a security scan */
export type ScanResult = {
  /** Whether the file passed all checks */
  isClean: boolean;
  /** Individual check results */
  checks: ScanCheck[];
  /** ISO timestamp of scan completion */
  scannedAt: string;
};

/** Individual scan check result */
export type ScanCheck = {
  name: string;
  passed: boolean;
  detail?: string;
};

/** Metadata provided when quarantining a file */
export type QuarantineMetadata = {
  originalName: string;
  mimeType: string;
  uploadedBy: string;
};

/** A quarantine entry stored in the database */
export type QuarantineEntry = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: QuarantineStatus;
  scanResult: ScanResult | null;
  uploadedBy: string;
  createdAt: string;
  promotedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
};

/** Options for the QuarantineService constructor (dependency injection) */
export type QuarantineServiceDeps = {
  /** Store a buffer in quarantine storage, returns the storage path */
  storeQuarantine: (id: string, buffer: Buffer) => Promise<void>;
  /** Read a buffer from quarantine storage */
  readQuarantine: (id: string) => Promise<Buffer>;
  /** Move file from quarantine to production storage */
  moveToProduction: (id: string, originalName: string) => Promise<string>;
  /** Delete a file from quarantine storage */
  deleteQuarantine: (id: string) => Promise<void>;
  /** Insert a quarantine entry into the database */
  insertEntry: (entry: QuarantineEntry) => Promise<void>;
  /** Update a quarantine entry in the database */
  updateEntry: (id: string, updates: Partial<QuarantineEntry>) => Promise<void>;
  /** Get a quarantine entry by ID */
  getEntry: (id: string) => Promise<QuarantineEntry | null>;
  /** Get all entries older than a given timestamp */
  getExpiredEntries: (olderThanMs: number) => Promise<QuarantineEntry[]>;
};

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

export const QuarantineMetadataSchema = z.object({
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  uploadedBy: z.string().uuid(),
});

export const QuarantineStatusSchema = z.enum([
  'quarantined',
  'scanning',
  'clean',
  'rejected',
  'promoted',
]);
