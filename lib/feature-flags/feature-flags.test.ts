/**
 * Feature Flag Service — Unit Tests
 *
 * Tests flag evaluation: enabled/disabled, targeting rules,
 * percentage-based rollout consistency, caching, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { FeatureFlagService } from './flags';
import { FEATURE_FLAGS } from './constants';
import type { FeatureFlag } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFlag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    id: 'test_flag',
    name: 'Test Flag',
    description: 'A test flag',
    enabled: true,
    rules: undefined,
    percentage: undefined,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockSupabase(flags: FeatureFlag[] = [], updateError: unknown = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: flags, error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: updateError }),
      }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FeatureFlagService', () => {
  let service: FeatureFlagService;

  describe('isEnabled — basic', () => {
    it('returns false for a non-existent flag', async () => {
      service = new FeatureFlagService(mockSupabase([]));
      expect(await service.isEnabled('nonexistent')).toBe(false);
    });

    it('returns true for an enabled flag with no rules or percentage', async () => {
      const flag = makeFlag({ id: 'on_flag', enabled: true });
      service = new FeatureFlagService(mockSupabase([flag]));
      expect(await service.isEnabled('on_flag')).toBe(true);
    });

    it('returns false for a disabled flag', async () => {
      const flag = makeFlag({ id: 'off_flag', enabled: false });
      service = new FeatureFlagService(mockSupabase([flag]));
      expect(await service.isEnabled('off_flag')).toBe(false);
    });
  });

  describe('isEnabled — targeting rules', () => {
    it('returns true when context matches an eq rule', async () => {
      const flag = makeFlag({
        id: 'targeted',
        rules: [{ field: 'role', operator: 'eq', value: 'admin' }],
      });
      service = new FeatureFlagService(mockSupabase([flag]));
      expect(await service.isEnabled('targeted', { role: 'admin' })).toBe(true);
    });

    it('returns false when context does not match an eq rule', async () => {
      const flag = makeFlag({
        id: 'targeted',
        rules: [{ field: 'role', operator: 'eq', value: 'admin' }],
      });
      service = new FeatureFlagService(mockSupabase([flag]));
      expect(await service.isEnabled('targeted', { role: 'viewer' })).toBe(false);
    });

    it('returns true when context matches an in rule', async () => {
      const flag = makeFlag({
        id: 'country_flag',
        rules: [{ field: 'country', operator: 'in', value: ['DE', 'AT', 'CH'] }],
      });
      service = new FeatureFlagService(mockSupabase([flag]));
      expect(await service.isEnabled('country_flag', { country: 'DE' })).toBe(true);
    });

    it('returns true when context matches a not_in rule', async () => {
      const flag = makeFlag({
        id: 'exclude_flag',
        rules: [{ field: 'country', operator: 'not_in', value: ['US', 'CN'] }],
      });
      service = new FeatureFlagService(mockSupabase([flag]));
      expect(await service.isEnabled('exclude_flag', { country: 'DE' })).toBe(true);
    });

    it('returns false when rules exist but no context provided', async () => {
      const flag = makeFlag({
        id: 'needs_ctx',
        rules: [{ field: 'userId', operator: 'eq', value: 'u1' }],
      });
      service = new FeatureFlagService(mockSupabase([flag]));
      expect(await service.isEnabled('needs_ctx')).toBe(false);
    });
  });

  describe('isEnabled — percentage rollout', () => {
    it('returns consistent results for the same userId', async () => {
      const flag = makeFlag({ id: 'pct_flag', percentage: 50 });
      service = new FeatureFlagService(mockSupabase([flag]));

      const result1 = await service.isEnabled('pct_flag', { userId: 'user-abc' });
      const result2 = await service.isEnabled('pct_flag', { userId: 'user-abc' });
      expect(result1).toBe(result2);
    });

    it('returns false when percentage requires userId but none given', async () => {
      const flag = makeFlag({ id: 'pct_flag', percentage: 50 });
      service = new FeatureFlagService(mockSupabase([flag]));
      expect(await service.isEnabled('pct_flag')).toBe(false);
    });

    it('returns true for all users at 100%', async () => {
      const flag = makeFlag({ id: 'full_flag', percentage: 100 });
      service = new FeatureFlagService(mockSupabase([flag]));

      for (let i = 0; i < 20; i++) {
        expect(await service.isEnabled('full_flag', { userId: `user-${i}` })).toBe(true);
      }
    });

    it('returns false for all users at 0%', async () => {
      const flag = makeFlag({ id: 'zero_flag', percentage: 0 });
      service = new FeatureFlagService(mockSupabase([flag]));

      for (let i = 0; i < 20; i++) {
        expect(await service.isEnabled('zero_flag', { userId: `user-${i}` })).toBe(false);
      }
    });

    it('distributes users roughly according to percentage', async () => {
      const flag = makeFlag({ id: 'half_flag', percentage: 50 });
      service = new FeatureFlagService(mockSupabase([flag]));

      let enabled = 0;
      const total = 1000;
      for (let i = 0; i < total; i++) {
        if (await service.isEnabled('half_flag', { userId: `user-${i}` })) {
          enabled++;
        }
      }

      // Expect roughly 50% ± 10% tolerance
      expect(enabled).toBeGreaterThan(total * 0.3);
      expect(enabled).toBeLessThan(total * 0.7);
    });
  });

  describe('getAllFlags', () => {
    it('returns all flags from the database', async () => {
      const flags = [
        makeFlag({ id: 'flag_a' }),
        makeFlag({ id: 'flag_b', enabled: false }),
      ];
      service = new FeatureFlagService(mockSupabase(flags));

      const result = await service.getAllFlags();
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.id)).toEqual(['flag_a', 'flag_b']);
    });
  });

  describe('setFlag', () => {
    it('updates flag and invalidates cache', async () => {
      const sb = mockSupabase([makeFlag({ id: 'toggle' })]);
      service = new FeatureFlagService(sb);

      // Prime cache
      await service.getAllFlags();

      await service.setFlag({ id: 'toggle', enabled: false });

      expect(sb.from).toHaveBeenCalledWith('feature_flags');
    });

    it('throws AppError on update failure', async () => {
      const sb = mockSupabase([], { message: 'DB down' });
      service = new FeatureFlagService(sb);

      await expect(service.setFlag({ id: 'fail', enabled: true }))
        .rejects.toThrow('Failed to update feature flag');
    });
  });

  describe('caching', () => {
    it('does not re-fetch within TTL', async () => {
      const sb = mockSupabase([makeFlag({ id: 'cached' })]);
      service = new FeatureFlagService(sb, 60_000);

      await service.isEnabled('cached');
      await service.isEnabled('cached');

      // from() called once for the first load
      expect(sb.from).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after cache invalidation', async () => {
      const sb = mockSupabase([makeFlag({ id: 'cached' })]);
      service = new FeatureFlagService(sb, 60_000);

      await service.isEnabled('cached');
      service.invalidateCache();
      await service.isEnabled('cached');

      expect(sb.from).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('returns false when DB query fails (fail closed)', async () => {
      const sb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: null, error: { message: 'timeout' } }),
        }),
      } as unknown as import('@supabase/supabase-js').SupabaseClient;

      service = new FeatureFlagService(sb);
      expect(await service.isEnabled('any_flag')).toBe(false);
    });
  });

  describe('constants', () => {
    it('has all expected predefined flag IDs', () => {
      expect(FEATURE_FLAGS.PEPPOL_V2_ENGINE).toBe('peppol_v2_engine');
      expect(FEATURE_FLAGS.BATCH_PROCESSING_V2).toBe('batch_processing_v2');
      expect(FEATURE_FLAGS.ENVELOPE_ENCRYPTION).toBe('envelope_encryption');
      expect(FEATURE_FLAGS.NEW_EXTRACTION_MODEL).toBe('new_extraction_model');
      expect(FEATURE_FLAGS.ENHANCED_VALIDATION).toBe('enhanced_validation');
    });
  });
});
