/**
 * GDPR Pseudonymization Service
 *
 * Provides HMAC-based pseudonymization (reversible with key), irreversible
 * anonymization for erasure requests, data export for portability, and
 * erasure request processing.
 *
 * Intent: Centralize all GDPR data transformation operations with full audit logging.
 * Compliance-critical — every operation is logged via the injected audit logger.
 *
 * @module lib/gdpr/pseudonymize
 */

import { createHmac, randomBytes } from 'crypto';
import type {
  PseudonymizationRequest,
  PseudonymizationResult,
  DataSubjectRequest,
  PortableUserData,
} from './types';
import { GdprError } from './types';
import { EXTRACTION_DATA_PII_FIELDS } from './personal-data-inventory';

/** Minimal interface for database operations — injected for testability */
export interface GdprDatabase {
  getUserById(userId: string): Promise<Record<string, unknown> | null>;
  updateUser(userId: string, data: Record<string, unknown>): Promise<void>;
  getExtractionsByUserId(userId: string): Promise<Record<string, unknown>[]>;
  updateExtraction(extractionId: string, data: Record<string, unknown>): Promise<void>;
  getConversionsByUserId(userId: string): Promise<Record<string, unknown>[]>;
  updateConversion(conversionId: string, data: Record<string, unknown>): Promise<void>;
  getPaymentsByUserId(userId: string): Promise<Record<string, unknown>[]>;
  deleteUserData(userId: string): Promise<void>;
  createGdprRequest(request: DataSubjectRequest): Promise<string>;
  updateGdprRequestStatus(requestId: string, status: string, notes?: string): Promise<void>;
}

/** Minimal interface for audit logging — injected for testability */
export interface GdprAuditLogger {
  log(params: {
    userId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    changes?: Record<string, unknown>;
  }): Promise<void>;
}

/** Configuration for the pseudonymization service */
export interface PseudonymizationConfig {
  /** HMAC secret key for generating pseudonyms (must be stored securely) */
  hmacSecret: string;
  /** Schema version for data exports */
  exportSchemaVersion: string;
}

const ANONYMOUS_PLACEHOLDER = '[ANONYMIZED]';
const USER_PII_FIELDS = [
  'email', 'first_name', 'last_name',
  'address_line_1', 'address_line_2', 'city',
  'postal_code', 'country', 'phone', 'tax_id',
];

/**
 * Service for GDPR pseudonymization, anonymization, and data subject requests.
 *
 * All methods require injected database and audit logger dependencies
 * to ensure testability and separation of concerns.
 */
export class PseudonymizationService {
  private readonly db: GdprDatabase;
  private readonly audit: GdprAuditLogger;
  private readonly config: PseudonymizationConfig;

  constructor(params: {
    db: GdprDatabase;
    audit: GdprAuditLogger;
    config: PseudonymizationConfig;
  }) {
    this.db = params.db;
    this.audit = params.audit;
    this.config = params.config;
  }

  /**
   * Generate an HMAC-SHA256 based pseudonym for a real value.
   * Deterministic — same input + secret always produces the same pseudonym.
   * Reversible only if you have the mapping table or the original value + secret.
   *
   * @param realValue - The original PII value
   * @param secret - HMAC secret key
   * @returns Hex-encoded pseudonym
   */
  generatePseudonym(realValue: string, secret: string): string {
    return createHmac('sha256', secret)
      .update(realValue)
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * Pseudonymize a user's personal data (HMAC-based, reversible with key).
   * Replaces PII fields with deterministic pseudonyms across all related tables.
   *
   * @param request - Pseudonymization request with userId, reason, and legal basis
   * @returns Result with number of fields processed and pseudonym ID
   * @throws {GdprError} If user not found or operation fails
   */
  async pseudonymizeUser(request: PseudonymizationRequest): Promise<PseudonymizationResult> {
    const { userId, reason, requestedBy, legalBasis } = request;

    const user = await this.db.getUserById(userId);
    if (!user) {
      throw new GdprError('USER_NOT_FOUND', `User ${userId} not found`);
    }

    const pseudonymId = this.generatePseudonym(userId, this.config.hmacSecret);
    let fieldsProcessed = 0;

    try {
      // Pseudonymize user profile fields
      const userUpdates: Record<string, unknown> = {};
      for (const field of USER_PII_FIELDS) {
        const value = user[field];
        if (value != null && typeof value === 'string' && value !== '') {
          userUpdates[field] = this.generatePseudonym(value, this.config.hmacSecret);
          fieldsProcessed++;
        }
      }

      if (Object.keys(userUpdates).length > 0) {
        await this.db.updateUser(userId, userUpdates);
      }

      // Pseudonymize extraction data PII fields
      const extractions = await this.db.getExtractionsByUserId(userId);
      for (const extraction of extractions) {
        const extractionData = extraction['extraction_data'] as Record<string, unknown> | null;
        if (!extractionData) continue;

        let modified = false;
        for (const piiField of EXTRACTION_DATA_PII_FIELDS) {
          const value = extractionData[piiField];
          if (value != null && typeof value === 'string' && value !== '') {
            extractionData[piiField] = this.generatePseudonym(value, this.config.hmacSecret);
            fieldsProcessed++;
            modified = true;
          }
        }

        if (modified) {
          await this.db.updateExtraction(
            extraction['id'] as string,
            { extraction_data: extractionData },
          );
        }
      }

      // Pseudonymize conversion buyer/email fields
      const conversions = await this.db.getConversionsByUserId(userId);
      for (const conversion of conversions) {
        const updates: Record<string, unknown> = {};
        if (conversion['buyer_name'] && typeof conversion['buyer_name'] === 'string') {
          updates['buyer_name'] = this.generatePseudonym(
            conversion['buyer_name'] as string,
            this.config.hmacSecret,
          );
          fieldsProcessed++;
        }
        if (conversion['email_recipient'] && typeof conversion['email_recipient'] === 'string') {
          updates['email_recipient'] = this.generatePseudonym(
            conversion['email_recipient'] as string,
            this.config.hmacSecret,
          );
          fieldsProcessed++;
        }
        if (Object.keys(updates).length > 0) {
          await this.db.updateConversion(conversion['id'] as string, updates);
        }
      }

      await this.audit.log({
        userId,
        action: 'gdpr.pseudonymize',
        resourceType: 'user',
        resourceId: userId,
        changes: {
          reason,
          requestedBy,
          legalBasis,
          fieldsProcessed,
          pseudonymId,
        },
      });

      return {
        userId,
        fieldsProcessed,
        pseudonymId,
        processedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      if (error instanceof GdprError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GdprError('PSEUDONYMIZATION_FAILED', `Pseudonymization failed for user ${userId}: ${message}`);
    }
  }

  /**
   * Irreversibly anonymize a user's personal data (for erasure requests).
   * Replaces PII with random tokens that cannot be reversed.
   *
   * @param userId - ID of the user to anonymize
   * @throws {GdprError} If user not found or operation fails
   */
  async anonymizeUser(userId: string): Promise<void> {
    const user = await this.db.getUserById(userId);
    if (!user) {
      throw new GdprError('USER_NOT_FOUND', `User ${userId} not found`);
    }

    try {
      // Anonymize user profile — replace with non-reversible random data
      const anonymizedUser: Record<string, unknown> = {};
      for (const field of USER_PII_FIELDS) {
        if (user[field] != null) {
          anonymizedUser[field] = `${ANONYMOUS_PLACEHOLDER}-${randomBytes(8).toString('hex')}`;
        }
      }

      if (Object.keys(anonymizedUser).length > 0) {
        await this.db.updateUser(userId, anonymizedUser);
      }

      // Anonymize extraction data
      const extractions = await this.db.getExtractionsByUserId(userId);
      for (const extraction of extractions) {
        const extractionData = extraction['extraction_data'] as Record<string, unknown> | null;
        if (!extractionData) continue;

        for (const piiField of EXTRACTION_DATA_PII_FIELDS) {
          if (extractionData[piiField] != null) {
            extractionData[piiField] = `${ANONYMOUS_PLACEHOLDER}-${randomBytes(8).toString('hex')}`;
          }
        }

        await this.db.updateExtraction(
          extraction['id'] as string,
          { extraction_data: extractionData },
        );
      }

      // Anonymize conversions
      const conversions = await this.db.getConversionsByUserId(userId);
      for (const conversion of conversions) {
        const updates: Record<string, unknown> = {};
        if (conversion['buyer_name'] != null) {
          updates['buyer_name'] = `${ANONYMOUS_PLACEHOLDER}-${randomBytes(8).toString('hex')}`;
        }
        if (conversion['email_recipient'] != null) {
          updates['email_recipient'] = `${ANONYMOUS_PLACEHOLDER}-${randomBytes(8).toString('hex')}`;
        }
        if (Object.keys(updates).length > 0) {
          await this.db.updateConversion(conversion['id'] as string, updates);
        }
      }

      await this.audit.log({
        userId,
        action: 'gdpr.anonymize',
        resourceType: 'user',
        resourceId: userId,
        changes: { irreversible: true },
      });
    } catch (error: unknown) {
      if (error instanceof GdprError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GdprError('ANONYMIZATION_FAILED', `Anonymization failed for user ${userId}: ${message}`);
    }
  }

  /**
   * Export all user data in a portable format (GDPR Art. 20 — Data Portability).
   * Returns a structured, machine-readable representation of all user data.
   *
   * @param userId - ID of the user whose data to export
   * @returns Portable user data object
   * @throws {GdprError} If user not found or export fails
   */
  async exportUserData(userId: string): Promise<PortableUserData> {
    const user = await this.db.getUserById(userId);
    if (!user) {
      throw new GdprError('USER_NOT_FOUND', `User ${userId} not found`);
    }

    try {
      const extractions = await this.db.getExtractionsByUserId(userId);
      const conversions = await this.db.getConversionsByUserId(userId);
      const payments = await this.db.getPaymentsByUserId(userId);

      await this.audit.log({
        userId,
        action: 'gdpr.export',
        resourceType: 'user',
        resourceId: userId,
        changes: {
          extractionCount: extractions.length,
          conversionCount: conversions.length,
          paymentCount: payments.length,
        },
      });

      return {
        exportedAt: new Date().toISOString(),
        schemaVersion: this.config.exportSchemaVersion,
        profile: user,
        extractions,
        conversions,
        payments,
      };
    } catch (error: unknown) {
      if (error instanceof GdprError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GdprError('EXPORT_FAILED', `Data export failed for user ${userId}: ${message}`);
    }
  }

  /**
   * Process a GDPR erasure request (Right to be Forgotten — Art. 17).
   * Anonymizes all user data and deletes where possible.
   *
   * @param request - The data subject erasure request
   * @throws {GdprError} If the request type is not erasure or processing fails
   */
  async processErasureRequest(request: DataSubjectRequest): Promise<void> {
    if (request.type !== 'erasure') {
      throw new GdprError('INVALID_REQUEST', `Expected erasure request, got ${request.type}`);
    }

    const { subjectId } = request;

    try {
      // First anonymize all PII (audit logs are preserved but anonymized)
      await this.anonymizeUser(subjectId);

      // Then delete user data where legally permissible
      await this.db.deleteUserData(subjectId);

      await this.audit.log({
        userId: subjectId,
        action: 'gdpr.erasure',
        resourceType: 'user',
        resourceId: subjectId,
        changes: {
          requestType: request.type,
          requestedAt: request.requestedAt,
          completedAt: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      if (error instanceof GdprError) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new GdprError('ERASURE_FAILED', `Erasure failed for user ${subjectId}: ${message}`);
    }
  }
}
