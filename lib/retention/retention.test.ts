/**
 * Data Retention Engine — Unit Tests
 *
 * Tests policy lookup, retention evaluation, anonymization hashing,
 * and engine execution with mocked database adapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPolicyForJurisdiction,
  getAllPoliciesForJurisdiction,
  RETENTION_POLICIES,
} from './policies';
import {
  RetentionEngine,
  hashPii,
} from './engine';
import type {
  RetentionDatabaseAdapter,
  RetainableEntity,
  RetentionLogger,
} from './engine';
import type { RetentionSchedule } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockLogger(): RetentionLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function createMockDb(overrides: Partial<RetentionDatabaseAdapter> = {}): RetentionDatabaseAdapter {
  return {
    findExpiredEntities: vi.fn().mockResolvedValue([]),
    archiveEntities: vi.fn().mockResolvedValue(undefined),
    anonymizeEntities: vi.fn().mockResolvedValue(undefined),
    deleteEntities: vi.fn().mockResolvedValue(undefined),
    writeRetentionLog: vi.fn().mockResolvedValue(undefined),
    getDueSchedules: vi.fn().mockResolvedValue([]),
    updateScheduleNextRun: vi.fn().mockResolvedValue(undefined),
    countRetainedEntities: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function createExpiredEntity(id: string): RetainableEntity {
  return {
    id,
    entityType: 'invoice',
    userId: 'user-1',
    country: 'DE',
    createdAt: new Date('2015-01-01'),
    isArchived: false,
  };
}

// ─── Policy Lookup Tests ──────────────────────────────────────────────────────

describe('getPolicyForJurisdiction', () => {
  it('should return DE invoice policy with 10-year retention', () => {
    const policy = getPolicyForJurisdiction('DE', 'invoice');
    expect(policy).not.toBeNull();
    expect(policy?.jurisdiction).toBe('DE');
    expect(policy?.retentionDays).toBe(10 * 365);
    expect(policy?.legalBasis).toContain('§14b UStG');
  });

  it('should return DE correspondence policy with 6-year retention', () => {
    const policy = getPolicyForJurisdiction('DE', 'business_correspondence');
    expect(policy).not.toBeNull();
    expect(policy?.retentionDays).toBe(6 * 365);
    expect(policy?.legalBasis).toContain('§257 HGB');
  });

  it('should return FR invoice policy with 10-year retention', () => {
    const policy = getPolicyForJurisdiction('FR', 'invoice');
    expect(policy).not.toBeNull();
    expect(policy?.jurisdiction).toBe('FR');
    expect(policy?.retentionDays).toBe(10 * 365);
  });

  it('should return IT invoice policy with 10-year retention', () => {
    const policy = getPolicyForJurisdiction('IT', 'invoice');
    expect(policy).not.toBeNull();
    expect(policy?.jurisdiction).toBe('IT');
    expect(policy?.retentionDays).toBe(10 * 365);
  });

  it('should return EU GDPR erasure policy for user entity type', () => {
    const policy = getPolicyForJurisdiction('EU', 'user');
    expect(policy).not.toBeNull();
    expect(policy?.retentionDays).toBe(0);
    expect(policy?.legalBasis).toContain('GDPR Art. 17');
  });

  it('should fall back to EU policy for unknown country with user type', () => {
    const policy = getPolicyForJurisdiction('PL', 'user');
    expect(policy).not.toBeNull();
    expect(policy?.jurisdiction).toBe('EU');
  });

  it('should fall back to DEFAULT for unknown jurisdiction and entity type', () => {
    const policy = getPolicyForJurisdiction('JP', 'invoice');
    expect(policy).not.toBeNull();
    expect(policy?.jurisdiction).toBe('DEFAULT');
    expect(policy?.retentionDays).toBe(7 * 365);
  });

  it('should return null for completely unknown entity type', () => {
    // Cast to bypass type check for testing
    const policy = getPolicyForJurisdiction('DE', 'unknown' as never);
    expect(policy).toBeNull();
  });
});

describe('getAllPoliciesForJurisdiction', () => {
  it('should return multiple policies for DE', () => {
    const policies = getAllPoliciesForJurisdiction('DE');
    expect(policies.length).toBeGreaterThanOrEqual(5);
    const entityTypes = policies.map((p) => p.entityType);
    expect(entityTypes).toContain('invoice');
    expect(entityTypes).toContain('business_correspondence');
  });

  it('should include DEFAULT fallbacks for entity types not covered by jurisdiction', () => {
    const policies = getAllPoliciesForJurisdiction('FR');
    const auditPolicy = policies.find((p) => p.entityType === 'audit_log');
    expect(auditPolicy).not.toBeNull();
    expect(auditPolicy?.jurisdiction).toBe('DEFAULT');
  });
});

// ─── hashPii Tests ────────────────────────────────────────────────────────────

describe('hashPii', () => {
  it('should return a 64-character hex string', () => {
    const hash = hashPii('test@example.com');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce deterministic output', () => {
    expect(hashPii('hello')).toBe(hashPii('hello'));
  });

  it('should produce different hashes for different inputs', () => {
    expect(hashPii('alice@test.com')).not.toBe(hashPii('bob@test.com'));
  });
});

// ─── RetentionEngine Tests ────────────────────────────────────────────────────

describe('RetentionEngine', () => {
  let db: RetentionDatabaseAdapter;
  let logger: RetentionLogger;
  let engine: RetentionEngine;

  beforeEach(() => {
    db = createMockDb();
    logger = createMockLogger();
    engine = new RetentionEngine({ db, logger, executedBy: 'test-runner' });
  });

  describe('evaluateRetention', () => {
    it('should skip evaluation for zero-retention policies (GDPR erasure)', async () => {
      const policy = getPolicyForJurisdiction('EU', 'user')!;
      const result = await engine.evaluateRetention(policy);
      expect(result).toEqual([]);
      expect(db.findExpiredEntities).not.toHaveBeenCalled();
    });

    it('should find expired entities for a valid policy', async () => {
      const entity = createExpiredEntity('inv-1');
      (db.findExpiredEntities as ReturnType<typeof vi.fn>).mockResolvedValue([entity]);

      const policy = getPolicyForJurisdiction('DE', 'invoice')!;
      const result = await engine.evaluateRetention(policy);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('inv-1');
      expect(db.findExpiredEntities).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'invoice',
          limit: 500,
        }),
      );
    });
  });

  describe('archive', () => {
    it('should archive entities and log each action', async () => {
      const result = await engine.archive(['inv-1', 'inv-2'], 'invoice');

      expect(result.processed).toBe(2);
      expect(result.archived).toBe(2);
      expect(result.anonymized).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(db.archiveEntities).toHaveBeenCalledWith(['inv-1', 'inv-2'], 'invoice');
      expect(db.writeRetentionLog).toHaveBeenCalledTimes(2);
    });

    it('should record errors when archiving fails', async () => {
      (db.archiveEntities as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));

      const result = await engine.archive(['inv-1'], 'invoice');

      expect(result.archived).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.message).toBe('DB down');
    });
  });

  describe('anonymize', () => {
    it('should anonymize entities and return correct counts', async () => {
      const result = await engine.anonymize(['inv-1'], 'invoice');

      expect(result.anonymized).toBe(1);
      expect(result.archived).toBe(0);
      expect(db.anonymizeEntities).toHaveBeenCalledWith(['inv-1'], 'invoice');
    });
  });

  describe('deleteExpired', () => {
    it('should delete entities and return correct counts', async () => {
      const result = await engine.deleteExpired(['inv-1', 'inv-2', 'inv-3'], 'invoice');

      expect(result.deleted).toBe(3);
      expect(db.deleteEntities).toHaveBeenCalledWith(['inv-1', 'inv-2', 'inv-3'], 'invoice');
    });
  });

  describe('processRetentionSchedule', () => {
    it('should process due schedules and aggregate results', async () => {
      const schedule: RetentionSchedule = {
        policyId: 'de-invoice-10y',
        entityType: 'invoice',
        action: 'archive',
        nextRunAt: new Date('2026-01-01'),
      };

      (db.getDueSchedules as ReturnType<typeof vi.fn>).mockResolvedValue([schedule]);
      (db.findExpiredEntities as ReturnType<typeof vi.fn>).mockResolvedValue([
        createExpiredEntity('inv-1'),
      ]);

      const result = await engine.processRetentionSchedule();

      expect(result.processed).toBe(1);
      expect(result.archived).toBe(1);
      expect(db.updateScheduleNextRun).toHaveBeenCalled();
    });

    it('should skip schedules with unknown policies', async () => {
      const schedule: RetentionSchedule = {
        policyId: 'nonexistent-policy',
        entityType: 'invoice',
        action: 'delete',
        nextRunAt: new Date('2026-01-01'),
      };

      (db.getDueSchedules as ReturnType<typeof vi.fn>).mockResolvedValue([schedule]);

      const result = await engine.processRetentionSchedule();

      expect(result.processed).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle empty schedule gracefully', async () => {
      const result = await engine.processRetentionSchedule();

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('generateRetentionReport', () => {
    it('should generate a compliance report', async () => {
      (db.countRetainedEntities as ReturnType<typeof vi.fn>).mockResolvedValue(42);

      const report = await engine.generateRetentionReport({
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2026-01-01'),
      });

      expect(report.generatedAt).toBeTruthy();
      expect(report.policiesEvaluated).toBeGreaterThan(0);
      expect(report.entitiesRetained).toBeGreaterThan(0);
    });
  });
});

// ─── RETENTION_POLICIES integrity ─────────────────────────────────────────────

describe('RETENTION_POLICIES', () => {
  it('should have unique IDs', () => {
    const ids = RETENTION_POLICIES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have non-negative retentionDays for all policies', () => {
    for (const policy of RETENTION_POLICIES) {
      expect(policy.retentionDays).toBeGreaterThanOrEqual(0);
    }
  });

  it('should have non-empty legalBasis for all policies', () => {
    for (const policy of RETENTION_POLICIES) {
      expect(policy.legalBasis.length).toBeGreaterThan(0);
    }
  });
});
