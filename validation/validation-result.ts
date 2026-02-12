/**
 * Structured validation error model for EN 16931 compliance.
 * Used by the validation pipeline and returned to API consumers.
 */

export interface ValidationError {
  level: 'error' | 'warning' | 'info';
  ruleId: string;
  location: string;
  message: string;
  expected?: string;
  actual?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  profile: string;
  errors: ValidationError[];
  warnings: ValidationError[];
  timestamp: string;
}

/**
 * Create a validation error entry.
 */
export function createError(
  ruleId: string,
  location: string,
  message: string,
  opts?: { expected?: string; actual?: string; suggestion?: string }
): ValidationError {
  return {
    level: 'error',
    ruleId,
    location,
    message,
    ...opts,
  };
}

/**
 * Create a validation warning entry.
 */
export function createWarning(
  ruleId: string,
  location: string,
  message: string,
  opts?: { expected?: string; actual?: string; suggestion?: string }
): ValidationError {
  return {
    level: 'warning',
    ruleId,
    location,
    message,
    ...opts,
  };
}

/**
 * Build a ValidationResult from a list of validation entries.
 */
export function buildValidationResult(
  profile: string,
  entries: ValidationError[]
): ValidationResult {
  const errors = entries.filter((e) => e.level === 'error');
  const warnings = entries.filter((e) => e.level === 'warning');
  return {
    valid: errors.length === 0,
    profile,
    errors,
    warnings,
    timestamp: new Date().toISOString(),
  };
}
