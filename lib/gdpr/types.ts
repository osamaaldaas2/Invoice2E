/**
 * GDPR Pseudonymization & Data Subject Request Types
 *
 * Type definitions for GDPR compliance workflows including pseudonymization,
 * anonymization, data portability, and erasure requests.
 *
 * Intent: Provide strongly-typed contracts for all GDPR data processing operations.
 * Compliance-critical — all operations using these types must be audit-logged.
 *
 * @module lib/gdpr/types
 */

/** Legal basis for pseudonymization under GDPR Art. 6 */
export type LegalBasis =
  | 'consent'
  | 'contract'
  | 'legal_obligation'
  | 'vital_interests'
  | 'public_task'
  | 'legitimate_interests';

/** Request to pseudonymize a user's personal data */
export interface PseudonymizationRequest {
  /** ID of the user whose data should be pseudonymized */
  userId: string;
  /** Human-readable reason for pseudonymization */
  reason: string;
  /** ID of the person/system requesting pseudonymization */
  requestedBy: string;
  /** GDPR legal basis for processing */
  legalBasis: LegalBasis;
}

/** Result of a pseudonymization operation */
export interface PseudonymizationResult {
  /** ID of the user whose data was pseudonymized */
  userId: string;
  /** Number of fields that were processed */
  fieldsProcessed: number;
  /** Generated pseudonym identifier (HMAC-based, reversible with key) */
  pseudonymId: string;
  /** ISO 8601 timestamp of when pseudonymization was performed */
  processedAt: string;
}

/** Types of data subject requests under GDPR */
export type DataSubjectRequestType = 'access' | 'erasure' | 'rectification' | 'portability';

/** Status of a data subject request */
export type DataSubjectRequestStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'failed';

/** A data subject request (GDPR Art. 15–20) */
export interface DataSubjectRequest {
  /** Type of GDPR right being exercised */
  type: DataSubjectRequestType;
  /** ID of the data subject */
  subjectId: string;
  /** ISO 8601 timestamp of when the request was made */
  requestedAt: string;
  /** Current status of the request */
  status: DataSubjectRequestStatus;
  /** ID of the person/system processing the request */
  processedBy?: string;
  /** ISO 8601 timestamp of when processing completed */
  completedAt?: string;
  /** Notes or reason for rejection */
  notes?: string;
}

/** Describes which fields in a given entity contain personal data */
export interface EntityPiiMapping {
  /** Table/entity name */
  entity: string;
  /** List of field names containing PII */
  fields: string[];
  /** Description of the PII category */
  description: string;
}

/**
 * Maps entity types to their PII fields.
 * Used to inventory all personal data across the system.
 */
export type PersonalDataInventory = Record<string, EntityPiiMapping>;

/** Row shape for the gdpr_requests database table */
export interface GdprRequestRow {
  id: string;
  subject_id: string;
  request_type: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  requested_at: string;
  processed_by: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Exported user data for portability (GDPR Art. 20) */
export interface PortableUserData {
  /** Export metadata */
  exportedAt: string;
  /** Schema version for forward compatibility */
  schemaVersion: string;
  /** User profile data */
  profile: Record<string, unknown>;
  /** User's invoice extractions */
  extractions: Record<string, unknown>[];
  /** User's invoice conversions */
  conversions: Record<string, unknown>[];
  /** User's payment transactions */
  payments: Record<string, unknown>[];
}

/** Error codes specific to GDPR operations */
export type GdprErrorCode =
  | 'USER_NOT_FOUND'
  | 'PSEUDONYMIZATION_FAILED'
  | 'ANONYMIZATION_FAILED'
  | 'EXPORT_FAILED'
  | 'ERASURE_FAILED'
  | 'INVALID_REQUEST';

/** Custom error for GDPR operations */
export class GdprError extends Error {
  public readonly code: GdprErrorCode;

  constructor(code: GdprErrorCode, message: string) {
    super(message);
    this.name = 'GdprError';
    this.code = code;
  }
}
