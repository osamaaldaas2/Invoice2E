/**
 * GDPR Pseudonymization Service Tests
 *
 * Tests pseudonymization roundtrip, anonymization irreversibility,
 * data export format, erasure request processing, and personal data inventory.
 *
 * @module lib/gdpr/gdpr.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PseudonymizationService } from './pseudonymize';
import type { GdprDatabase, GdprAuditLogger, PseudonymizationConfig } from './pseudonymize';
import type { DataSubjectRequest } from './types';
import { GdprError } from './types';
import { isPersonalData, getAllPiiEntities, PERSONAL_DATA_INVENTORY } from './personal-data-inventory';

// --- Mock factories ---

function createMockUser(): Record<string, unknown> {
  return {
    id: 'user-123',
    email: 'john@example.com',
    first_name: 'John',
    last_name: 'Doe',
    address_line_1: '123 Main St',
    address_line_2: null,
    city: 'Berlin',
    postal_code: '10115',
    country: 'DE',
    phone: '+491234567890',
    tax_id: 'DE123456789',
  };
}

function createMockExtraction(): Record<string, unknown> {
  return {
    id: 'ext-1',
    user_id: 'user-123',
    extraction_data: {
      sellerName: 'ACME GmbH',
      sellerEmail: 'invoice@acme.de',
      sellerTaxId: 'DE999888777',
      buyerName: 'John Doe',
      buyerEmail: 'john@example.com',
      invoiceNumber: 'INV-001',
      totalAmount: 119.0,
    },
  };
}

function createMockConversion(): Record<string, unknown> {
  return {
    id: 'conv-1',
    user_id: 'user-123',
    buyer_name: 'John Doe',
    email_recipient: 'john@example.com',
  };
}

function createMockDb(overrides: Partial<GdprDatabase> = {}): GdprDatabase {
  return {
    getUserById: vi.fn().mockResolvedValue(createMockUser()),
    updateUser: vi.fn().mockResolvedValue(undefined),
    getExtractionsByUserId: vi.fn().mockResolvedValue([createMockExtraction()]),
    updateExtraction: vi.fn().mockResolvedValue(undefined),
    getConversionsByUserId: vi.fn().mockResolvedValue([createMockConversion()]),
    updateConversion: vi.fn().mockResolvedValue(undefined),
    getPaymentsByUserId: vi.fn().mockResolvedValue([{ id: 'pay-1', amount: 9.99 }]),
    deleteUserData: vi.fn().mockResolvedValue(undefined),
    createGdprRequest: vi.fn().mockResolvedValue('req-1'),
    updateGdprRequestStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockAudit(): GdprAuditLogger {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  };
}

const TEST_CONFIG: PseudonymizationConfig = {
  hmacSecret: 'test-secret-key-for-hmac-operations-32chars!',
  exportSchemaVersion: '1.0.0',
};

// --- Tests ---

describe('PseudonymizationService', () => {
  let db: GdprDatabase;
  let audit: GdprAuditLogger;
  let service: PseudonymizationService;

  beforeEach(() => {
    db = createMockDb();
    audit = createMockAudit();
    service = new PseudonymizationService({ db, audit, config: TEST_CONFIG });
  });

  describe('generatePseudonym', () => {
    it('should produce deterministic output for same input and secret', () => {
      const result1 = service.generatePseudonym('john@example.com', 'secret');
      const result2 = service.generatePseudonym('john@example.com', 'secret');
      expect(result1).toBe(result2);
    });

    it('should produce different output for different inputs', () => {
      const result1 = service.generatePseudonym('john@example.com', 'secret');
      const result2 = service.generatePseudonym('jane@example.com', 'secret');
      expect(result1).not.toBe(result2);
    });

    it('should produce different output for different secrets', () => {
      const result1 = service.generatePseudonym('john@example.com', 'secret-a');
      const result2 = service.generatePseudonym('john@example.com', 'secret-b');
      expect(result1).not.toBe(result2);
    });

    it('should return a 32-character hex string', () => {
      const result = service.generatePseudonym('test', 'secret');
      expect(result).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('pseudonymizeUser', () => {
    it('should pseudonymize user profile fields and return result', async () => {
      const result = await service.pseudonymizeUser({
        userId: 'user-123',
        reason: 'Data minimization',
        requestedBy: 'admin-1',
        legalBasis: 'legitimate_interests',
      });

      expect(result.userId).toBe('user-123');
      expect(result.fieldsProcessed).toBeGreaterThan(0);
      expect(result.pseudonymId).toMatch(/^[0-9a-f]{32}$/);
      expect(result.processedAt).toBeTruthy();

      // Verify user was updated
      expect(db.updateUser).toHaveBeenCalledWith('user-123', expect.any(Object));

      // Verify pseudonymized values are HMAC hashes, not originals
      const updateCall = (db.updateUser as ReturnType<typeof vi.fn>).mock.calls[0];
      const updates = updateCall[1] as Record<string, string>;
      expect(updates['email']).not.toBe('john@example.com');
      expect(updates['email']).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should pseudonymize extraction data PII fields', async () => {
      await service.pseudonymizeUser({
        userId: 'user-123',
        reason: 'test',
        requestedBy: 'admin',
        legalBasis: 'consent',
      });

      expect(db.updateExtraction).toHaveBeenCalledWith('ext-1', expect.any(Object));
    });

    it('should pseudonymize conversion fields', async () => {
      await service.pseudonymizeUser({
        userId: 'user-123',
        reason: 'test',
        requestedBy: 'admin',
        legalBasis: 'consent',
      });

      expect(db.updateConversion).toHaveBeenCalledWith('conv-1', expect.objectContaining({
        buyer_name: expect.stringMatching(/^[0-9a-f]{32}$/),
        email_recipient: expect.stringMatching(/^[0-9a-f]{32}$/),
      }));
    });

    it('should audit-log the pseudonymization', async () => {
      await service.pseudonymizeUser({
        userId: 'user-123',
        reason: 'test',
        requestedBy: 'admin',
        legalBasis: 'consent',
      });

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-123',
        action: 'gdpr.pseudonymize',
      }));
    });

    it('should throw GdprError when user not found', async () => {
      db = createMockDb({ getUserById: vi.fn().mockResolvedValue(null) });
      service = new PseudonymizationService({ db, audit, config: TEST_CONFIG });

      await expect(service.pseudonymizeUser({
        userId: 'nonexistent',
        reason: 'test',
        requestedBy: 'admin',
        legalBasis: 'consent',
      })).rejects.toThrow(GdprError);
    });

    it('should be deterministic — same pseudonym for same input', async () => {
      const result1 = await service.pseudonymizeUser({
        userId: 'user-123',
        reason: 'test',
        requestedBy: 'admin',
        legalBasis: 'consent',
      });

      // Reset mocks to allow second call
      db = createMockDb();
      service = new PseudonymizationService({ db, audit, config: TEST_CONFIG });

      const result2 = await service.pseudonymizeUser({
        userId: 'user-123',
        reason: 'test',
        requestedBy: 'admin',
        legalBasis: 'consent',
      });

      expect(result1.pseudonymId).toBe(result2.pseudonymId);
    });
  });

  describe('anonymizeUser — irreversibility', () => {
    it('should replace PII with random non-reversible values', async () => {
      await service.anonymizeUser('user-123');

      expect(db.updateUser).toHaveBeenCalledWith('user-123', expect.any(Object));

      const updates = (db.updateUser as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, string>;

      // Anonymized values should contain the ANONYMIZED marker
      for (const value of Object.values(updates)) {
        expect(value).toContain('[ANONYMIZED]');
      }
    });

    it('should produce different anonymous values each call (non-deterministic)', async () => {
      await service.anonymizeUser('user-123');
      const firstCall = (db.updateUser as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, string>;

      // Reset and call again
      db = createMockDb();
      service = new PseudonymizationService({ db, audit, config: TEST_CONFIG });
      await service.anonymizeUser('user-123');
      const secondCall = (db.updateUser as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, string>;

      // Random portions should differ (astronomically unlikely to match)
      expect(firstCall['email']).not.toBe(secondCall['email']);
    });

    it('should anonymize extraction and conversion data', async () => {
      await service.anonymizeUser('user-123');

      expect(db.updateExtraction).toHaveBeenCalled();
      expect(db.updateConversion).toHaveBeenCalled();
    });

    it('should audit-log the anonymization', async () => {
      await service.anonymizeUser('user-123');

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'gdpr.anonymize',
        changes: { irreversible: true },
      }));
    });

    it('should throw GdprError when user not found', async () => {
      db = createMockDb({ getUserById: vi.fn().mockResolvedValue(null) });
      service = new PseudonymizationService({ db, audit, config: TEST_CONFIG });

      await expect(service.anonymizeUser('nonexistent')).rejects.toThrow(GdprError);
    });
  });

  describe('exportUserData — data portability', () => {
    it('should return all user data in portable format', async () => {
      const exported = await service.exportUserData('user-123');

      expect(exported.schemaVersion).toBe('1.0.0');
      expect(exported.exportedAt).toBeTruthy();
      expect(exported.profile).toEqual(createMockUser());
      expect(exported.extractions).toHaveLength(1);
      expect(exported.conversions).toHaveLength(1);
      expect(exported.payments).toHaveLength(1);
    });

    it('should include exportedAt as ISO timestamp', async () => {
      const exported = await service.exportUserData('user-123');
      expect(() => new Date(exported.exportedAt)).not.toThrow();
      expect(new Date(exported.exportedAt).toISOString()).toBe(exported.exportedAt);
    });

    it('should audit-log the export', async () => {
      await service.exportUserData('user-123');

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'gdpr.export',
      }));
    });

    it('should throw GdprError when user not found', async () => {
      db = createMockDb({ getUserById: vi.fn().mockResolvedValue(null) });
      service = new PseudonymizationService({ db, audit, config: TEST_CONFIG });

      await expect(service.exportUserData('nonexistent')).rejects.toThrow(GdprError);
    });
  });

  describe('processErasureRequest', () => {
    it('should anonymize and delete user data', async () => {
      const request: DataSubjectRequest = {
        type: 'erasure',
        subjectId: 'user-123',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };

      await service.processErasureRequest(request);

      // Should have anonymized (updateUser called) and deleted
      expect(db.updateUser).toHaveBeenCalled();
      expect(db.deleteUserData).toHaveBeenCalledWith('user-123');
    });

    it('should reject non-erasure requests', async () => {
      const request: DataSubjectRequest = {
        type: 'access',
        subjectId: 'user-123',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };

      await expect(service.processErasureRequest(request)).rejects.toThrow(GdprError);
    });

    it('should audit-log the erasure', async () => {
      const request: DataSubjectRequest = {
        type: 'erasure',
        subjectId: 'user-123',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };

      await service.processErasureRequest(request);

      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'gdpr.erasure',
      }));
    });
  });
});

describe('Personal Data Inventory', () => {
  it('should identify user email as personal data', () => {
    expect(isPersonalData('users', 'email')).toBe(true);
  });

  it('should identify user name fields as personal data', () => {
    expect(isPersonalData('users', 'first_name')).toBe(true);
    expect(isPersonalData('users', 'last_name')).toBe(true);
  });

  it('should identify audit log user references as personal data', () => {
    expect(isPersonalData('audit_logs', 'user_id')).toBe(true);
    expect(isPersonalData('audit_logs', 'ip_address')).toBe(true);
  });

  it('should return false for non-PII fields', () => {
    expect(isPersonalData('users', 'language')).toBe(false);
    expect(isPersonalData('users', 'role')).toBe(false);
  });

  it('should return false for unknown tables', () => {
    expect(isPersonalData('nonexistent_table', 'email')).toBe(false);
  });

  it('should list all PII entities', () => {
    const entities = getAllPiiEntities();
    expect(entities).toContain('users');
    expect(entities).toContain('invoice_extractions');
    expect(entities).toContain('audit_logs');
    expect(entities).toContain('invoice_conversions');
  });

  it('should have descriptions for all entities', () => {
    for (const [, mapping] of Object.entries(PERSONAL_DATA_INVENTORY)) {
      expect(mapping.description).toBeTruthy();
      expect(mapping.fields.length).toBeGreaterThan(0);
    }
  });
});
