/**
 * Feature Flag Constants
 *
 * Centralized predefined flag IDs for the application.
 * All flag references should use these constants — never raw strings.
 *
 * @module feature-flags/constants
 */

/** Predefined feature flag identifiers */
export const FEATURE_FLAGS = {
  /** Peppol v2 format engine rollout */
  PEPPOL_V2_ENGINE: 'peppol_v2_engine',
  /** Batch processing v2 pipeline */
  BATCH_PROCESSING_V2: 'batch_processing_v2',
  /** Envelope-level encryption for stored invoices */
  ENVELOPE_ENCRYPTION: 'envelope_encryption',
  /** New AI extraction model rollout */
  NEW_EXTRACTION_MODEL: 'new_extraction_model',
  /** Enhanced validation rule set */
  ENHANCED_VALIDATION: 'enhanced_validation',
} as const;

/** Union type of all known flag IDs */
export type FeatureFlagId = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/** Default TTL for the in-memory flag cache (milliseconds) */
export const FLAG_CACHE_TTL_MS = 60_000;
