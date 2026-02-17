/**
 * File Quarantine Service Tests
 *
 * Covers: valid PDF passes, invalid extension blocked,
 * magic bytes mismatch caught, oversized file rejected.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuarantineService } from '@/lib/file-quarantine';
import type {
  QuarantineEntry,
  QuarantineServiceDeps,
} from '@/types/file-quarantine.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal valid PDF buffer */
function makePdfBuffer(size = 1024): Buffer {
  const buf = Buffer.alloc(size);
  buf.write('%PDF-1.4', 0, 'latin1');
  return buf;
}

/** Create a valid PNG buffer */
function makePngBuffer(size = 1024): Buffer {
  const buf = Buffer.alloc(size);
  const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  pngHeader.forEach((b, i) => { buf[i] = b; });
  return buf;
}

/** Create a valid JPEG buffer */
function makeJpegBuffer(size = 1024): Buffer {
  const buf = Buffer.alloc(size);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

/** Build mock dependencies with sensible defaults */
function createMockDeps(overrides: Partial<QuarantineServiceDeps> = {}): QuarantineServiceDeps {
  const entries = new Map<string, QuarantineEntry>();
  const buffers = new Map<string, Buffer>();

  return {
    storeQuarantine: vi.fn(async (id: string, buffer: Buffer) => {
      buffers.set(id, buffer);
    }),
    readQuarantine: vi.fn(async (id: string) => {
      const buf = buffers.get(id);
      if (!buf) throw new Error(`No buffer for ${id}`);
      return buf;
    }),
    moveToProduction: vi.fn(async (id: string, name: string) => `/production/${id}/${name}`),
    deleteQuarantine: vi.fn(async () => {}),
    insertEntry: vi.fn(async (entry: QuarantineEntry) => {
      entries.set(entry.id, { ...entry });
    }),
    updateEntry: vi.fn(async (id: string, updates: Partial<QuarantineEntry>) => {
      const existing = entries.get(id);
      if (existing) entries.set(id, { ...existing, ...updates });
    }),
    getEntry: vi.fn(async (id: string) => entries.get(id) ?? null),
    getExpiredEntries: vi.fn(async () => []),
    ...overrides,
  };
}

const VALID_METADATA = {
  originalName: 'invoice.pdf',
  mimeType: 'application/pdf',
  uploadedBy: '00000000-0000-0000-0000-000000000001',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('QuarantineService', () => {
  let service: QuarantineService;
  let deps: QuarantineServiceDeps;

  beforeEach(() => {
    deps = createMockDeps();
    service = new QuarantineService(deps);
  });

  describe('quarantine', () => {
    it('should store file and create entry', async () => {
      const buffer = makePdfBuffer();
      const entry = await service.quarantine(buffer, VALID_METADATA);

      expect(entry.id).toBeDefined();
      expect(entry.status).toBe('quarantined');
      expect(entry.originalName).toBe('invoice.pdf');
      expect(entry.size).toBe(buffer.length);
      expect(deps.storeQuarantine).toHaveBeenCalledOnce();
      expect(deps.insertEntry).toHaveBeenCalledOnce();
    });

    it('should reject invalid metadata', async () => {
      const buffer = makePdfBuffer();
      await expect(
        service.quarantine(buffer, { originalName: '', mimeType: '', uploadedBy: 'bad' }),
      ).rejects.toThrow();
    });
  });

  describe('scan', () => {
    it('should pass a valid PDF file', async () => {
      const buffer = makePdfBuffer();
      const entry = await service.quarantine(buffer, VALID_METADATA);
      const result = await service.scan(entry.id);

      expect(result.isClean).toBe(true);
      expect(result.checks).toHaveLength(4);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });

    it('should pass a valid PNG file', async () => {
      const buffer = makePngBuffer();
      const entry = await service.quarantine(buffer, {
        originalName: 'receipt.png',
        mimeType: 'image/png',
        uploadedBy: '00000000-0000-0000-0000-000000000001',
      });
      const result = await service.scan(entry.id);

      expect(result.isClean).toBe(true);
    });

    it('should pass a valid JPEG file', async () => {
      const buffer = makeJpegBuffer();
      const entry = await service.quarantine(buffer, {
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        uploadedBy: '00000000-0000-0000-0000-000000000001',
      });
      const result = await service.scan(entry.id);

      expect(result.isClean).toBe(true);
    });

    it('should reject file with invalid extension', async () => {
      const buffer = makePdfBuffer();
      const entry = await service.quarantine(buffer, {
        ...VALID_METADATA,
        originalName: 'malware.exe',
      });
      const result = await service.scan(entry.id);

      expect(result.isClean).toBe(false);
      const extCheck = result.checks.find((c) => c.name === 'extension_allowlist');
      expect(extCheck?.passed).toBe(false);
    });

    it('should reject file with magic bytes mismatch', async () => {
      // Claim PDF but buffer is actually PNG
      const buffer = makePngBuffer();
      const entry = await service.quarantine(buffer, {
        ...VALID_METADATA,
        originalName: 'fake.pdf',
        mimeType: 'application/pdf',
      });
      const result = await service.scan(entry.id);

      expect(result.isClean).toBe(false);
      const magicCheck = result.checks.find((c) => c.name === 'magic_bytes');
      expect(magicCheck?.passed).toBe(false);
    });

    it('should reject oversized file', async () => {
      // 26 MB buffer (exceeds 25 MB limit)
      const buffer = makePdfBuffer(26 * 1024 * 1024);
      const entry = await service.quarantine(buffer, VALID_METADATA);
      const result = await service.scan(entry.id);

      expect(result.isClean).toBe(false);
      const sizeCheck = result.checks.find((c) => c.name === 'file_size');
      expect(sizeCheck?.passed).toBe(false);
    });

    it('should reject file with disallowed MIME type', async () => {
      const buffer = makePdfBuffer();
      const entry = await service.quarantine(buffer, {
        ...VALID_METADATA,
        originalName: 'doc.html',
        mimeType: 'text/html',
      });
      const result = await service.scan(entry.id);

      expect(result.isClean).toBe(false);
      const mimeCheck = result.checks.find((c) => c.name === 'mime_type_allowlist');
      expect(mimeCheck?.passed).toBe(false);
    });

    it('should throw when scanning non-quarantined entry', async () => {
      const buffer = makePdfBuffer();
      const entry = await service.quarantine(buffer, VALID_METADATA);
      await service.scan(entry.id); // moves to clean
      await expect(service.scan(entry.id)).rejects.toThrow('Cannot scan file');
    });
  });

  describe('promote', () => {
    it('should promote a clean file', async () => {
      const buffer = makePdfBuffer();
      const entry = await service.quarantine(buffer, VALID_METADATA);
      await service.scan(entry.id);
      const path = await service.promote(entry.id);

      expect(path).toContain('/production/');
      expect(deps.moveToProduction).toHaveBeenCalledOnce();
    });

    it('should throw when promoting non-clean file', async () => {
      const buffer = makePdfBuffer();
      const entry = await service.quarantine(buffer, VALID_METADATA);
      // Still in 'quarantined' status
      await expect(service.promote(entry.id)).rejects.toThrow('Cannot promote file');
    });
  });

  describe('reject', () => {
    it('should reject a quarantined file with reason', async () => {
      const buffer = makePdfBuffer();
      const entry = await service.quarantine(buffer, VALID_METADATA);
      await service.reject(entry.id, 'Manual review: suspicious content');

      expect(deps.updateEntry).toHaveBeenCalledWith(entry.id, expect.objectContaining({
        status: 'rejected',
        rejectionReason: 'Manual review: suspicious content',
      }));
    });

    it('should throw when rejecting promoted file', async () => {
      const buffer = makePdfBuffer();
      const entry = await service.quarantine(buffer, VALID_METADATA);
      await service.scan(entry.id);
      await service.promote(entry.id);
      await expect(service.reject(entry.id, 'too late')).rejects.toThrow('Cannot reject');
    });

    it('should throw on empty reason', async () => {
      const buffer = makePdfBuffer();
      const entry = await service.quarantine(buffer, VALID_METADATA);
      await expect(service.reject(entry.id, '')).rejects.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should clean expired entries', async () => {
      const expiredEntry: QuarantineEntry = {
        id: 'expired-1',
        originalName: 'old.pdf',
        mimeType: 'application/pdf',
        size: 100,
        status: 'quarantined',
        scanResult: null,
        uploadedBy: '00000000-0000-0000-0000-000000000001',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        promotedAt: null,
        rejectedAt: null,
        rejectionReason: null,
      };

      const depsWithExpired = createMockDeps({
        getExpiredEntries: vi.fn(async () => [expiredEntry]),
      });
      const svc = new QuarantineService(depsWithExpired);
      const cleaned = await svc.cleanup(3600000);

      expect(cleaned).toBe(1);
      expect(depsWithExpired.deleteQuarantine).toHaveBeenCalledWith('expired-1');
    });

    it('should throw on non-positive olderThanMs', async () => {
      await expect(service.cleanup(0)).rejects.toThrow('olderThanMs must be positive');
      await expect(service.cleanup(-1)).rejects.toThrow('olderThanMs must be positive');
    });
  });
});
