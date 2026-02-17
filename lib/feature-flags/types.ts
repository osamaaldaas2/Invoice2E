/**
 * Feature Flag System — Type Definitions
 *
 * Defines the core types for the feature flag system including
 * flag configuration, targeting rules, and evaluation context.
 *
 * @module feature-flags/types
 */

import { z } from 'zod';

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

/** Allowed targeting rule fields */
export const TargetingFieldSchema = z.enum(['userId', 'role', 'country']);

/** Allowed targeting operators */
export const TargetingOperatorSchema = z.enum(['eq', 'in', 'not_in']);

/** Schema for a single targeting rule */
export const TargetingRuleSchema = z.object({
  field: TargetingFieldSchema,
  operator: TargetingOperatorSchema,
  value: z.union([z.string(), z.array(z.string())]),
});

/** Schema for evaluation context passed when checking a flag */
export const EvaluationContextSchema = z.object({
  userId: z.string().optional(),
  role: z.string().optional(),
  country: z.string().optional(),
  format: z.string().optional(),
});

/** Schema for a feature flag record */
export const FeatureFlagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  enabled: z.boolean(),
  rules: z.array(TargetingRuleSchema).optional(),
  percentage: z.number().min(0).max(100).optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Schema for creating/updating a flag */
export const SetFlagInputSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
});

// ─── TypeScript Types ─────────────────────────────────────────────────────────

/** A targeting rule that selectively enables a flag for specific users/groups */
export type TargetingRule = z.infer<typeof TargetingRuleSchema>;

/** Context provided when evaluating whether a flag is enabled for a request */
export type EvaluationContext = z.infer<typeof EvaluationContextSchema>;

/** A feature flag record stored in the database */
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

/** Allowed targeting fields */
export type TargetingField = z.infer<typeof TargetingFieldSchema>;

/** Allowed targeting operators */
export type TargetingOperator = z.infer<typeof TargetingOperatorSchema>;

/** Input for setting flag status */
export type SetFlagInput = z.infer<typeof SetFlagInputSchema>;
