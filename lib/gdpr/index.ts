/**
 * GDPR Compliance Module — barrel export
 *
 * @module lib/gdpr
 */

export {
  PseudonymizationService,
} from './pseudonymize';
export type {
  GdprDatabase,
  GdprAuditLogger,
  PseudonymizationConfig,
} from './pseudonymize';

export {
  PERSONAL_DATA_INVENTORY,
  EXTRACTION_DATA_PII_FIELDS,
  isPersonalData,
  getEntityPiiMapping,
  getAllPiiEntities,
} from './personal-data-inventory';

export { GdprError } from './types';
export type {
  PseudonymizationRequest,
  PseudonymizationResult,
  DataSubjectRequest,
  DataSubjectRequestType,
  DataSubjectRequestStatus,
  PersonalDataInventory,
  EntityPiiMapping,
  LegalBasis,
  GdprRequestRow,
  PortableUserData,
  GdprErrorCode,
} from './types';
