/**
 * Interface for profile-specific validation.
 * Each e-invoicing profile (XRechnung, PEPPOL BIS, Factur-X, etc.)
 * implements this to add its own validation rules on top of EN 16931 base rules.
 * 
 * @module validation/profiles/IProfileValidator
 */

import type { CanonicalInvoice } from '@/types/canonical-invoice';
import type { ValidationError } from '@/validation/validation-result';

/** Profile identifier for validation */
export type ProfileId =
  | 'xrechnung-cii'
  | 'xrechnung-ubl'
  | 'peppol-bis'
  | 'facturx-en16931'
  | 'facturx-basic'
  | 'fatturapa'
  | 'ksef'
  | 'nlcius'
  | 'cius-ro'
  | 'en16931-base';

/** Interface that all profile validators must implement */
export interface IProfileValidator {
  /** Profile identifier */
  readonly profileId: ProfileId;

  /** Human-readable profile name */
  readonly profileName: string;

  /**
   * Run profile-specific validation rules.
   * Returns only the errors/warnings specific to this profile.
   * Base EN 16931 rules are run separately by the pipeline.
   * 
   * @param data - Canonical invoice data to validate
   * @returns Array of validation errors/warnings
   */
  validate(data: CanonicalInvoice): ValidationError[];
}
