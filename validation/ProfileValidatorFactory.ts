/**
 * Factory for profile validators.
 * Returns the appropriate IProfileValidator for a given profile ID.
 *
 * @module validation/ProfileValidatorFactory
 */

import type { IProfileValidator, ProfileId } from './profiles/IProfileValidator';
import type { ValidationError } from './validation-result';
import type { CanonicalInvoice } from '@/types/canonical-invoice';
import { validateXRechnungRules } from './xrechnung-rules';
import { validatePeppolRules } from './peppol-rules';
import { validateFacturXRules } from './facturx-rules';
import { validateNLCIUSRules } from './nlcius-rules';
import { validateCIUSRORules } from './ciusro-rules';
import { validateKsefRules } from './ksef-rules';
import { validateFatturapaRules } from './fatturapa-rules';

/**
 * XRechnung profile validator (wraps existing rules).
 */
class XRechnungProfileValidator implements IProfileValidator {
  readonly profileId: ProfileId = 'xrechnung-cii';
  readonly profileName = 'XRechnung 3.0';

  validate(data: CanonicalInvoice): ValidationError[] {
    return validateXRechnungRules(data);
  }
}

/**
 * XRechnung UBL profile validator (same rules as CII — both are XRechnung CIUS).
 */
class XRechnungUBLProfileValidator implements IProfileValidator {
  readonly profileId: ProfileId = 'xrechnung-ubl';
  readonly profileName = 'XRechnung 3.0 (UBL)';

  validate(data: CanonicalInvoice): ValidationError[] {
    return validateXRechnungRules(data);
  }
}

/**
 * PEPPOL BIS Billing 3.0 profile validator.
 */
class PeppolProfileValidator implements IProfileValidator {
  readonly profileId: ProfileId = 'peppol-bis';
  readonly profileName = 'PEPPOL BIS Billing 3.0';

  validate(data: CanonicalInvoice): ValidationError[] {
    return validatePeppolRules(data);
  }
}

/**
 * Factur-X EN 16931 profile validator.
 */
class FacturXEN16931ProfileValidator implements IProfileValidator {
  readonly profileId: ProfileId = 'facturx-en16931';
  readonly profileName = 'Factur-X EN 16931';

  validate(data: CanonicalInvoice): ValidationError[] {
    return validateFacturXRules(data, 'en16931');
  }
}

/**
 * Factur-X BASIC profile validator.
 */
class FacturXBasicProfileValidator implements IProfileValidator {
  readonly profileId: ProfileId = 'facturx-basic';
  readonly profileName = 'Factur-X BASIC';

  validate(data: CanonicalInvoice): ValidationError[] {
    return validateFacturXRules(data, 'basic');
  }
}

/**
 * FatturaPA (Italian SDI) profile validator.
 */
class FatturapaProfileValidator implements IProfileValidator {
  readonly profileId: ProfileId = 'fatturapa';
  readonly profileName = 'FatturaPA';

  validate(data: CanonicalInvoice): ValidationError[] {
    return validateFatturapaRules(data);
  }
}

/**
 * Base EN 16931 validator — no profile-specific rules.
 */
class EN16931BaseProfileValidator implements IProfileValidator {
  readonly profileId: ProfileId = 'en16931-base';
  readonly profileName = 'EN 16931 Base';

  validate(_data: CanonicalInvoice): ValidationError[] {
    // No profile-specific rules — only base rules run by the pipeline
    return [];
  }
}

/**
 * KSeF FA(2) profile validator (Poland).
 */
class KsefProfileValidator implements IProfileValidator {
  readonly profileId: ProfileId = 'ksef';
  readonly profileName = 'KSeF FA(2) — Poland';

  validate(data: CanonicalInvoice): ValidationError[] {
    return validateKsefRules(data);
  }
}

/**
 * NLCIUS profile validator (Netherlands).
 */
class NLCIUSProfileValidator implements IProfileValidator {
  readonly profileId: ProfileId = 'nlcius';
  readonly profileName = 'NLCIUS / SI-UBL 2.0 (Netherlands)';

  validate(data: CanonicalInvoice): ValidationError[] {
    return validateNLCIUSRules(data);
  }
}

/**
 * CIUS-RO profile validator (Romania).
 */
class CIUSROProfileValidator implements IProfileValidator {
  readonly profileId: ProfileId = 'cius-ro';
  readonly profileName = 'CIUS-RO (Romania)';

  validate(data: CanonicalInvoice): ValidationError[] {
    return validateCIUSRORules(data);
  }
}

/** Cached validator instances */
const validators = new Map<ProfileId, IProfileValidator>();

/**
 * Get a profile validator by profile ID.
 * Uses cached singleton instances.
 */
export function getProfileValidator(profileId: ProfileId): IProfileValidator {
  const cached = validators.get(profileId);
  if (cached) return cached;

  let validator: IProfileValidator;

  switch (profileId) {
    case 'xrechnung-cii':
      validator = new XRechnungProfileValidator();
      break;
    case 'xrechnung-ubl':
      validator = new XRechnungUBLProfileValidator();
      break;
    case 'peppol-bis':
      validator = new PeppolProfileValidator();
      break;
    case 'facturx-en16931':
      validator = new FacturXEN16931ProfileValidator();
      break;
    case 'facturx-basic':
      validator = new FacturXBasicProfileValidator();
      break;
    case 'fatturapa':
      validator = new FatturapaProfileValidator();
      break;
    case 'ksef':
      validator = new KsefProfileValidator();
      break;
    case 'nlcius':
      validator = new NLCIUSProfileValidator();
      break;
    case 'cius-ro':
      validator = new CIUSROProfileValidator();
      break;
    case 'en16931-base':
      validator = new EN16931BaseProfileValidator();
      break;
    default:
      profileId satisfies never;
      // For not-yet-implemented profiles, fall back to base
      validator = new EN16931BaseProfileValidator();
      break;
  }

  validators.set(profileId, validator);
  return validator;
}

/**
 * All available profile IDs. Must match the ProfileId union type.
 * TypeScript will error if a value is not a valid ProfileId.
 */
const ALL_PROFILES = [
  'xrechnung-cii',
  'xrechnung-ubl',
  'peppol-bis',
  'facturx-en16931',
  'facturx-basic',
  'fatturapa',
  'ksef',
  'nlcius',
  'cius-ro',
  'en16931-base',
] as const satisfies readonly ProfileId[];

/**
 * Get all available profile IDs.
 */
export function getAvailableProfiles(): ProfileId[] {
  return [...ALL_PROFILES];
}
