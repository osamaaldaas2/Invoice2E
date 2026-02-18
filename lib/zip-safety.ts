/**
 * ZIP Bomb Protection
 *
 * FIX: Audit #032 — validates ZIP archives against decompression bombs.
 * Checks compression ratio, total decompressed size, file count,
 * and nesting depth to prevent resource exhaustion attacks.
 *
 * @module lib/zip-safety
 */

import { logger } from '@/lib/logger';

/** Safety thresholds for ZIP validation */
export const ZIP_SAFETY_LIMITS = {
  /** Maximum compression ratio (100:1) — ratios above this indicate a bomb */
  MAX_COMPRESSION_RATIO: 100,
  /** Maximum total decompressed size (500 MB) */
  MAX_DECOMPRESSED_SIZE_BYTES: 500 * 1024 * 1024,
  /** Maximum number of entries in the ZIP */
  MAX_ENTRIES: 500,
  /** Maximum nesting depth (ZIP within ZIP) */
  MAX_NESTING_DEPTH: 1,
  /** Maximum single file decompressed size (50 MB) */
  MAX_SINGLE_FILE_SIZE_BYTES: 50 * 1024 * 1024,
} as const;

export interface ZipSafetyResult {
  safe: boolean;
  reason?: string;
  stats: {
    compressedSize: number;
    estimatedDecompressedSize: number;
    compressionRatio: number;
    entryCount: number;
    hasNestedZip: boolean;
  };
}

/**
 * Parse ZIP central directory to extract entry metadata without decompressing.
 *
 * ZIP format: End of Central Directory (EOCD) is at the end of the file.
 * EOCD signature: 0x06054b50
 * Central directory entry signature: 0x02014b50
 */
export function validateZipSafety(buffer: Buffer): ZipSafetyResult {
  const compressedSize = buffer.length;

  // Find End of Central Directory record
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    return {
      safe: false,
      reason: 'Invalid ZIP: no End of Central Directory record found',
      stats: {
        compressedSize,
        estimatedDecompressedSize: 0,
        compressionRatio: 0,
        entryCount: 0,
        hasNestedZip: false,
      },
    };
  }

  // Parse EOCD
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  // Check entry count
  if (totalEntries > ZIP_SAFETY_LIMITS.MAX_ENTRIES) {
    return {
      safe: false,
      reason: `ZIP contains ${totalEntries} entries (max ${ZIP_SAFETY_LIMITS.MAX_ENTRIES})`,
      stats: {
        compressedSize,
        estimatedDecompressedSize: 0,
        compressionRatio: 0,
        entryCount: totalEntries,
        hasNestedZip: false,
      },
    };
  }

  // Walk central directory entries to sum uncompressed sizes
  let totalDecompressedSize = 0;
  let hasNestedZip = false;
  let offset = centralDirOffset;

  for (let i = 0; i < totalEntries && offset < buffer.length - 46; i++) {
    // Verify central directory entry signature
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x01 ||
      buffer[offset + 3] !== 0x02
    ) {
      break; // Corrupted directory
    }

    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);

    // Check single file size
    if (uncompressedSize > ZIP_SAFETY_LIMITS.MAX_SINGLE_FILE_SIZE_BYTES) {
      return {
        safe: false,
        reason: `Entry exceeds ${ZIP_SAFETY_LIMITS.MAX_SINGLE_FILE_SIZE_BYTES / 1024 / 1024}MB single file limit (${uncompressedSize} bytes)`,
        stats: {
          compressedSize,
          estimatedDecompressedSize: totalDecompressedSize + uncompressedSize,
          compressionRatio:
            compressedSize > 0 ? (totalDecompressedSize + uncompressedSize) / compressedSize : 0,
          entryCount: totalEntries,
          hasNestedZip,
        },
      };
    }

    totalDecompressedSize += uncompressedSize;

    // Check for nested ZIP files
    if (fileNameLen > 0) {
      const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLen);
      if (fileName.toLowerCase().endsWith('.zip')) {
        hasNestedZip = true;
      }
    }

    offset += 46 + fileNameLen + extraLen + commentLen;
  }

  // Check total decompressed size
  if (totalDecompressedSize > ZIP_SAFETY_LIMITS.MAX_DECOMPRESSED_SIZE_BYTES) {
    return {
      safe: false,
      reason: `Total decompressed size ${(totalDecompressedSize / 1024 / 1024).toFixed(1)}MB exceeds ${ZIP_SAFETY_LIMITS.MAX_DECOMPRESSED_SIZE_BYTES / 1024 / 1024}MB limit`,
      stats: {
        compressedSize,
        estimatedDecompressedSize: totalDecompressedSize,
        compressionRatio: compressedSize > 0 ? totalDecompressedSize / compressedSize : 0,
        entryCount: totalEntries,
        hasNestedZip,
      },
    };
  }

  // Check compression ratio
  const compressionRatio = compressedSize > 0 ? totalDecompressedSize / compressedSize : 0;
  if (compressionRatio > ZIP_SAFETY_LIMITS.MAX_COMPRESSION_RATIO) {
    return {
      safe: false,
      reason: `Compression ratio ${compressionRatio.toFixed(1)}:1 exceeds ${ZIP_SAFETY_LIMITS.MAX_COMPRESSION_RATIO}:1 limit (possible ZIP bomb)`,
      stats: {
        compressedSize,
        estimatedDecompressedSize: totalDecompressedSize,
        compressionRatio,
        entryCount: totalEntries,
        hasNestedZip,
      },
    };
  }

  // Check nested ZIPs
  if (hasNestedZip) {
    logger.warn('ZIP contains nested ZIP files', { compressedSize, entryCount: totalEntries });
    return {
      safe: false,
      reason: 'Nested ZIP archives are not allowed (potential recursive bomb)',
      stats: {
        compressedSize,
        estimatedDecompressedSize: totalDecompressedSize,
        compressionRatio,
        entryCount: totalEntries,
        hasNestedZip,
      },
    };
  }

  return {
    safe: true,
    stats: {
      compressedSize,
      estimatedDecompressedSize: totalDecompressedSize,
      compressionRatio,
      entryCount: totalEntries,
      hasNestedZip: false,
    },
  };
}
