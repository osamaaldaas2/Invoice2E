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

  // S3 wire-in flags (all default OFF in DB)
  USE_STATE_MACHINE: 'use_state_machine',
  USE_CIRCUIT_BREAKER: 'use_circuit_breaker',
  USE_FILE_QUARANTINE: 'use_file_quarantine',
  USE_GRANULAR_RBAC: 'use_granular_rbac',
  USE_FIELD_ENCRYPTION: 'use_field_encryption',
  USE_OUTBOX: 'use_outbox',
  USE_DI_CONTAINER: 'use_di_container',
  USE_AUDIT_HASH_VERIFY: 'use_audit_hash_verify',
  USE_DATA_RETENTION: 'use_data_retention',
  USE_GDPR_ENDPOINTS: 'use_gdpr_endpoints',
} as const;

/** Union type of all known flag IDs */
export type FeatureFlagId = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/** Default TTL for the in-memory flag cache (milliseconds) */
export const FLAG_CACHE_TTL_MS = 60_000;
