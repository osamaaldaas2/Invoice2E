/**
 * File Quarantine Service
 *
 * Implements a quarantine pattern for uploaded invoices:
 * 1. Files are stored in a quarantine area with a unique ID
 * 2. Security scans verify file type, magic bytes, and size
 * 3. Clean files are promoted to production storage
 * 4. Suspicious files are rejected with a reason
 * 5. Expired quarantine entries are cleaned up
 *
 * All external dependencies are injected for testability.
 */

import { z } from 'zod';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { detectFileType, verifyMagicBytes } from '@/lib/magic-bytes';
import type {
  QuarantineEntry,
  QuarantineMetadata,
  QuarantineServiceDeps,
  ScanCheck,
  ScanResult,
} from '@/types/file-quarantine.types';
import { QuarantineMetadataSchema } from '@/types/file-quarantine.types';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Maximum file size in bytes (25 MB) — from centralized constants */
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Allowed MIME types for invoice uploads */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
]);

/** Allowed file extensions */
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif']);

// ─── QuarantineService ───────────────────────────────────────────────────────

/**
 * Manages the lifecycle of quarantined files.
 *
 * Intent: prevent malicious or malformed files from reaching production
 * storage by enforcing a quarantine → scan → promote/reject pipeline.
 */
export class QuarantineService {
  private readonly deps: QuarantineServiceDeps;

  constructor(deps: QuarantineServiceDeps) {
    this.deps = deps;
  }

  /**
   * Store a file in quarantine with a unique ID.
   *
   * @param file - Raw file buffer
   * @param metadata - Upload metadata (name, mime, uploader)
   * @returns The quarantine entry with its unique ID
   * @throws ValidationError if metadata is invalid
   */
  async quarantine(file: Buffer, metadata: QuarantineMetadata): Promise<QuarantineEntry> {
    const validated = QuarantineMetadataSchema.parse(metadata);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const entry: QuarantineEntry = {
      id,
      originalName: validated.originalName,
      mimeType: validated.mimeType,
      size: file.length,
      status: 'quarantined',
      scanResult: null,
      uploadedBy: validated.uploadedBy,
      createdAt: now,
      promotedAt: null,
      rejectedAt: null,
      rejectionReason: null,
    };

    try {
      await this.deps.storeQuarantine(id, file);
      await this.deps.insertEntry(entry);
    } catch (error) {
      logger.error('Failed to quarantine file', {
        quarantineId: id,
        originalName: validated.originalName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError('QUARANTINE_ERROR', 'Failed to quarantine file', 500);
    }

    logger.info('File quarantined', {
      quarantineId: id,
      originalName: validated.originalName,
      size: file.length,
    });

    return entry;
  }

  /**
   * Run security checks on a quarantined file.
   *
   * Checks performed:
   * - File size within limits
   * - File extension in allowlist
   * - MIME type in allowlist
   * - Magic bytes match claimed MIME type
   *
   * @param quarantineId - ID of the quarantine entry
   * @returns The scan result
   * @throws AppError if entry not found or not in quarantined state
   */
  async scan(quarantineId: string): Promise<ScanResult> {
    const entry = await this.getEntryOrThrow(quarantineId);

    if (entry.status !== 'quarantined') {
      throw new AppError(
        'INVALID_STATE',
        `Cannot scan file in status '${entry.status}'; expected 'quarantined'`,
        400,
      );
    }

    await this.deps.updateEntry(quarantineId, { status: 'scanning' });

    let buffer: Buffer;
    try {
      buffer = await this.deps.readQuarantine(quarantineId);
    } catch (error) {
      logger.error('Failed to read quarantined file for scanning', {
        quarantineId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError('QUARANTINE_ERROR', 'Failed to read quarantined file', 500);
    }

    const checks: ScanCheck[] = [];

    // 1. File size check
    checks.push(this.checkFileSize(buffer.length));

    // 2. Extension allowlist
    checks.push(this.checkExtension(entry.originalName));

    // 3. MIME type allowlist
    checks.push(this.checkMimeType(entry.mimeType));

    // 4. Magic bytes verification
    checks.push(this.checkMagicBytes(buffer, entry.mimeType));

    const isClean = checks.every((c) => c.passed);
    const scanResult: ScanResult = {
      isClean,
      checks,
      scannedAt: new Date().toISOString(),
    };

    const newStatus = isClean ? 'clean' : 'rejected';
    const updates: Partial<QuarantineEntry> = {
      status: newStatus,
      scanResult,
    };

    if (!isClean) {
      const failedChecks = checks.filter((c) => !c.passed).map((c) => c.detail ?? c.name);
      updates.rejectedAt = new Date().toISOString();
      updates.rejectionReason = `Scan failed: ${failedChecks.join('; ')}`;
    }

    await this.deps.updateEntry(quarantineId, updates);

    logger.info('File scan completed', {
      quarantineId,
      isClean,
      checks: checks.map((c) => ({ name: c.name, passed: c.passed })),
    });

    return scanResult;
  }

  /**
   * Move a clean file from quarantine to production storage.
   *
   * @param quarantineId - ID of the quarantine entry
   * @returns The production storage path
   * @throws AppError if entry not found or not in clean state
   */
  async promote(quarantineId: string): Promise<string> {
    const entry = await this.getEntryOrThrow(quarantineId);

    if (entry.status !== 'clean') {
      throw new AppError(
        'INVALID_STATE',
        `Cannot promote file in status '${entry.status}'; expected 'clean'`,
        400,
      );
    }

    let productionPath: string;
    try {
      productionPath = await this.deps.moveToProduction(quarantineId, entry.originalName);
    } catch (error) {
      logger.error('Failed to promote file to production', {
        quarantineId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError('QUARANTINE_ERROR', 'Failed to promote file', 500);
    }

    await this.deps.updateEntry(quarantineId, {
      status: 'promoted',
      promotedAt: new Date().toISOString(),
    });

    logger.info('File promoted to production', { quarantineId, productionPath });

    return productionPath;
  }

  /**
   * Reject a quarantined file with a reason.
   *
   * @param quarantineId - ID of the quarantine entry
   * @param reason - Human-readable rejection reason
   * @throws AppError if entry not found
   */
  async reject(quarantineId: string, reason: string): Promise<void> {
    z.string().min(1).max(500).parse(reason);

    const entry = await this.getEntryOrThrow(quarantineId);

    if (entry.status === 'promoted') {
      throw new AppError(
        'INVALID_STATE',
        'Cannot reject an already promoted file',
        400,
      );
    }

    await this.deps.updateEntry(quarantineId, {
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason,
    });

    logger.info('File rejected', { quarantineId, reason });
  }

  /**
   * Remove expired quarantine entries and their storage files.
   *
   * @param olderThanMs - Remove entries older than this many milliseconds
   * @returns Number of entries cleaned up
   */
  async cleanup(olderThanMs: number): Promise<number> {
    if (olderThanMs <= 0) {
      throw new ValidationError('olderThanMs must be positive');
    }

    const expired = await this.deps.getExpiredEntries(olderThanMs);
    let cleaned = 0;

    for (const entry of expired) {
      try {
        if (entry.status !== 'promoted') {
          await this.deps.deleteQuarantine(entry.id);
        }
        await this.deps.updateEntry(entry.id, { status: 'rejected', rejectionReason: 'Expired' });
        cleaned++;
      } catch (error) {
        logger.error('Failed to clean up quarantine entry', {
          quarantineId: entry.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Quarantine cleanup completed', { cleaned, total: expired.length });
    return cleaned;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getEntryOrThrow(id: string): Promise<QuarantineEntry> {
    const entry = await this.deps.getEntry(id);
    if (!entry) {
      throw new AppError('NOT_FOUND', `Quarantine entry '${id}' not found`, 404);
    }
    return entry;
  }

  private checkFileSize(size: number): ScanCheck {
    const passed = size <= MAX_FILE_SIZE_BYTES;
    return {
      name: 'file_size',
      passed,
      detail: passed
        ? `Size ${size} bytes within limit`
        : `Size ${size} bytes exceeds ${MAX_FILE_SIZE_BYTES} byte limit`,
    };
  }

  private checkExtension(fileName: string): ScanCheck {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const passed = ALLOWED_EXTENSIONS.has(ext);
    return {
      name: 'extension_allowlist',
      passed,
      detail: passed
        ? `Extension '.${ext}' is allowed`
        : `Extension '.${ext}' is not in allowlist`,
    };
  }

  private checkMimeType(mimeType: string): ScanCheck {
    const passed = ALLOWED_MIME_TYPES.has(mimeType);
    return {
      name: 'mime_type_allowlist',
      passed,
      detail: passed
        ? `MIME type '${mimeType}' is allowed`
        : `MIME type '${mimeType}' is not in allowlist`,
    };
  }

  private checkMagicBytes(buffer: Buffer, claimedMime: string): ScanCheck {
    const detected = detectFileType(buffer);
    const passed = verifyMagicBytes(buffer, claimedMime);
    return {
      name: 'magic_bytes',
      passed,
      detail: passed
        ? `Magic bytes match claimed type '${claimedMime}'`
        : `Magic bytes indicate '${detected?.mime ?? 'unknown'}' but claimed '${claimedMime}'`,
    };
  }
}
