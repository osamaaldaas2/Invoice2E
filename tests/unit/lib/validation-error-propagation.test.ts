/**
 * B-01 regression test: ValidationError.details.structuredErrors propagation.
 *
 * Verifies that ValidationError stores structuredErrors in `.details`
 * (not as a direct property) and that code reading `.details?.structuredErrors`
 * retrieves the correct value.
 */
import { describe, it, expect } from 'vitest';
import { ValidationError, AppError } from '@/lib/errors';

describe('ValidationError structuredErrors propagation (B-01)', () => {
  const sampleErrors = [
    { ruleId: 'BR-DE-01', message: 'Missing Leitweg-ID', suggestion: 'Add buyer reference' },
    { ruleId: 'SCHEMA-003', message: 'Seller name required' },
  ];

  it('stores structuredErrors in .details, not as a direct property', () => {
    const err = new ValidationError('Validation failed', {
      structuredErrors: sampleErrors as unknown as Record<string, unknown>,
    });

    // B-01 BUG: old code accessed (err as any).structuredErrors → undefined
    expect((err as any).structuredErrors).toBeUndefined();

    // B-01 FIX: new code accesses err.details?.structuredErrors → populated
    expect(err.details?.structuredErrors).toBeDefined();
    expect(err.details?.structuredErrors).toEqual(sampleErrors);
  });

  it('has correct status code (400) and code (VALIDATION_ERROR)', () => {
    const err = new ValidationError('test', {
      structuredErrors: [] as unknown as Record<string, unknown>,
    });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('is instanceof AppError', () => {
    const err = new ValidationError('test');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('returns structuredErrors as array with ruleIds when present', () => {
    const err = new ValidationError('Validation failed', {
      structuredErrors: sampleErrors as unknown as Record<string, unknown>,
    });

    const structuredErrors = err.details?.structuredErrors;
    expect(Array.isArray(structuredErrors)).toBe(true);

    // Simulate the ruleId extraction logic from convert/route.ts
    const ruleIds = (structuredErrors as { ruleId?: string }[])
      .map((e) => e.ruleId)
      .filter(Boolean);
    expect(ruleIds).toEqual(['BR-DE-01', 'SCHEMA-003']);
  });

  it('returns undefined when details not provided', () => {
    const err = new ValidationError('No details');
    expect(err.details).toBeUndefined();
    expect(err.details?.structuredErrors).toBeUndefined();
  });
});
