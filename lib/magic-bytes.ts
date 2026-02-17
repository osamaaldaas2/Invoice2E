/**
 * Magic Bytes Detection
 *
 * Identifies file types by inspecting the first bytes of a file buffer.
 * Prevents MIME type spoofing by verifying actual file content.
 */

/** Mapping of detected file type to its MIME type */
export type DetectedFileType = {
  mime: string;
  extension: string;
};

/**
 * Known magic byte signatures.
 * Each entry: [header bytes, mime type, extension].
 */
const SIGNATURES: ReadonlyArray<{
  bytes: readonly number[];
  mime: string;
  extension: string;
}> = [
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf', extension: 'pdf' }, // %PDF
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: 'image/png', extension: 'png' },       // PNG
  { bytes: [0xff, 0xd8, 0xff], mime: 'image/jpeg', extension: 'jpg' },             // JPEG
  { bytes: [0x49, 0x49, 0x2a, 0x00], mime: 'image/tiff', extension: 'tiff' },      // TIFF (little-endian)
  { bytes: [0x4d, 0x4d, 0x00, 0x2a], mime: 'image/tiff', extension: 'tiff' },      // TIFF (big-endian)
] as const;

/**
 * Detect file type from buffer magic bytes.
 *
 * @param buffer - File content buffer (at least first 8 bytes needed)
 * @returns Detected file type or null if unknown
 */
export function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (buffer.length < 4) {
    return null;
  }

  for (const sig of SIGNATURES) {
    if (buffer.length < sig.bytes.length) continue;

    const isMatch = sig.bytes.every((byte, index) => buffer[index] === byte);
    if (isMatch) {
      return { mime: sig.mime, extension: sig.extension };
    }
  }

  return null;
}

/**
 * Check whether a buffer's magic bytes match the claimed MIME type.
 *
 * @param buffer - File content buffer
 * @param claimedMime - The MIME type claimed by the uploader
 * @returns true if magic bytes match or are compatible with the claimed type
 */
export function verifyMagicBytes(buffer: Buffer, claimedMime: string): boolean {
  const detected = detectFileType(buffer);
  if (!detected) return false;

  // JPEG variants: image/jpeg covers jpg/jpeg
  if (claimedMime === 'image/jpeg' && detected.mime === 'image/jpeg') return true;
  if (claimedMime === 'image/jpg' && detected.mime === 'image/jpeg') return true;

  return detected.mime === claimedMime;
}
