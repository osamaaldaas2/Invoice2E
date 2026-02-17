/**
 * Feature Flag Service
 *
 * Provides DB-backed feature flags with in-memory caching, targeting rules,
 * and percentage-based rollout. Uses Supabase as the storage backend.
 *
 * Why: Enables safe, incremental rollouts of new features (format engines,
 * extraction models, etc.) without code deployments. Flags can target
 * specific users, roles, or countries, and support percentage-based rollout
 * for gradual exposure.
 *
 * @module feature-flags/flags
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';

import type {
  FeatureFlag,
  EvaluationContext,
  TargetingRule,
  SetFlagInput,
} from './types';
import { SetFlagInputSchema, EvaluationContextSchema } from './types';
import { FLAG_CACHE_TTL_MS } from './constants';

// ─── Cache Types ──────────────────────────────────────────────────────────────

interface CacheEntry {
  flags: Map<string, FeatureFlag>;
  fetchedAt: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Feature flag evaluation and management service.
 *
 * Uses an in-memory cache with configurable TTL to reduce DB round-trips.
 * Percentage-based rollout hashes the userId for consistent assignment.
 */
export class FeatureFlagService {
  private cache: CacheEntry | null = null;
  private readonly cacheTtlMs: number;
  private readonly supabase: SupabaseClient;

  /**
   * @param supabase - Supabase client instance (injected for testability)
   * @param cacheTtlMs - Cache time-to-live in ms (default 60 000)
   */
  constructor(supabase: SupabaseClient, cacheTtlMs: number = FLAG_CACHE_TTL_MS) {
    this.supabase = supabase;
    this.cacheTtlMs = cacheTtlMs;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Check whether a feature flag is enabled, optionally for a given context.
   *
   * Evaluation order:
   * 1. Flag must exist and be globally enabled.
   * 2. If targeting rules exist, at least one must match the context.
   * 3. If a percentage is set, the userId is hashed for consistent bucketing.
   *
   * @param flagId  - The flag identifier (use FEATURE_FLAGS constants)
   * @param context - Optional evaluation context (userId, role, country, format)
   * @returns `true` if the flag is enabled for the given context
   */
  async isEnabled(flagId: string, context?: EvaluationContext): Promise<boolean> {
    if (context) {
      EvaluationContextSchema.parse(context);
    }

    try {
      const flags = await this.loadFlags();
      const flag = flags.get(flagId);

      if (!flag) {
        logger.debug('Feature flag not found, defaulting to disabled', { flagId });
        return false;
      }

      if (!flag.enabled) {
        return false;
      }

      // Evaluate targeting rules (if any)
      if (flag.rules && flag.rules.length > 0) {
        if (!context) {
          // Rules exist but no context provided — cannot match
          return false;
        }
        const matchesAnyRule = flag.rules.some((rule) => this.evaluateRule(rule, context));
        if (!matchesAnyRule) {
          return false;
        }
      }

      // Evaluate percentage rollout
      if (flag.percentage !== undefined && flag.percentage !== null) {
        if (!context?.userId) {
          // Percentage rollout requires a userId for consistent hashing
          return false;
        }
        const bucket = this.hashToBucket(flagId, context.userId);
        return bucket < flag.percentage;
      }

      return true;
    } catch (error) {
      logger.error('Failed to evaluate feature flag', { flagId, error });
      // Fail closed — disabled on error
      return false;
    }
  }

  /**
   * Retrieve all feature flags from the database (cached).
   *
   * @returns Array of all feature flags
   */
  async getAllFlags(): Promise<FeatureFlag[]> {
    const flags = await this.loadFlags();
    return Array.from(flags.values());
  }

  /**
   * Update the enabled status of a feature flag.
   *
   * @param input - Flag ID and new enabled state
   * @throws AppError if the update fails
   */
  async setFlag(input: SetFlagInput): Promise<void> {
    const validated = SetFlagInputSchema.parse(input);

    const { error } = await this.supabase
      .from('feature_flags')
      .update({ enabled: validated.enabled, updated_at: new Date().toISOString() })
      .eq('id', validated.id);

    if (error) {
      throw new AppError(
        'FEATURE_FLAG_UPDATE_FAILED',
        `Failed to update feature flag '${validated.id}': ${error.message}`,
        500,
        { flagId: validated.id }
      );
    }

    // Invalidate cache so next read picks up the change
    this.invalidateCache();

    logger.info('Feature flag updated', { flagId: validated.id, enabled: validated.enabled });
  }

  /**
   * Clear the in-memory cache, forcing a fresh DB read on next access.
   */
  invalidateCache(): void {
    this.cache = null;
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Load flags from DB or return cached version if still fresh.
   */
  private async loadFlags(): Promise<Map<string, FeatureFlag>> {
    if (this.cache && Date.now() - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.flags;
    }

    const { data, error } = await this.supabase
      .from('feature_flags')
      .select('*');

    if (error) {
      throw new AppError(
        'FEATURE_FLAG_LOAD_FAILED',
        `Failed to load feature flags: ${error.message}`,
        500
      );
    }

    const flagMap = new Map<string, FeatureFlag>();
    for (const row of data ?? []) {
      flagMap.set(row.id, row as FeatureFlag);
    }

    this.cache = { flags: flagMap, fetchedAt: Date.now() };
    return flagMap;
  }

  /**
   * Evaluate a single targeting rule against the provided context.
   */
  private evaluateRule(rule: TargetingRule, context: EvaluationContext): boolean {
    const contextValue = context[rule.field as keyof EvaluationContext];
    if (contextValue === undefined) {
      return false;
    }

    switch (rule.operator) {
      case 'eq':
        return contextValue === rule.value;
      case 'in':
        return Array.isArray(rule.value) && rule.value.includes(contextValue);
      case 'not_in':
        return Array.isArray(rule.value) && !rule.value.includes(contextValue);
      default:
        return false;
    }
  }

  /**
   * Hash a flagId + userId into a 0–99 bucket for percentage-based rollout.
   * Uses a simple but consistent hash (djb2 variant) so the same user
   * always lands in the same bucket for a given flag.
   */
  private hashToBucket(flagId: string, userId: string): number {
    const input = `${flagId}:${userId}`;
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % 100;
  }
}
