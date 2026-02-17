/**
 * Data Retention Module — barrel export
 *
 * @module lib/retention
 */

// Types
export type {
  RetentionPolicy,
  RetentionAction,
  RetentionSchedule,
  RetentionResult,
  RetentionError,
  RetentionReport,
  RetainableEntityType,
  Jurisdiction,
  RetentionPolicyRow,
  RetentionLogRow,
} from './types';

// Policies
export {
  RETENTION_POLICIES,
  getPolicyForJurisdiction,
  getAllPoliciesForJurisdiction,
} from './policies';

// Engine
export {
  RetentionEngine,
  hashPii,
} from './engine';
export type {
  RetentionDatabaseAdapter,
  RetainableEntity,
  RetentionLogger,
} from './engine';
