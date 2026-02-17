/**
 * Feature Flags — Barrel Export & Convenience Helper
 *
 * Re-exports all feature flag types, constants, and the service class.
 * Provides a convenience function `isFeatureEnabled` for quick checks.
 *
 * @module feature-flags
 */

export { FEATURE_FLAGS, FLAG_CACHE_TTL_MS } from './constants';
export type { FeatureFlagId } from './constants';

export {
  type FeatureFlag,
  type EvaluationContext,
  type TargetingRule,
  type SetFlagInput,
  FeatureFlagSchema,
  EvaluationContextSchema,
  TargetingRuleSchema,
  SetFlagInputSchema,
} from './types';

export { FeatureFlagService } from './flags';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { EvaluationContext } from './types';
import { FeatureFlagService } from './flags';

/**
 * Convenience function: check if a flag is enabled for a given context.
 *
 * Creates an ephemeral FeatureFlagService per call — prefer injecting
 * a shared instance in long-lived services for better cache utilisation.
 *
 * @param supabase - Supabase client instance
 * @param flagId   - Flag identifier (use FEATURE_FLAGS constants)
 * @param context  - Optional evaluation context
 * @returns `true` if the flag is enabled
 */
export async function isFeatureEnabled(
  supabase: SupabaseClient,
  flagId: string,
  context?: EvaluationContext,
): Promise<boolean> {
  const service = new FeatureFlagService(supabase);
  return service.isEnabled(flagId, context);
}
