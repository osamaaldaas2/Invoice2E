import { describe, it, expect } from 'vitest';
import { buildRetryPrompt, shouldRetry } from '@/lib/extraction-retry';

describe('shouldRetry', () => {
  it('returns true for attempt 0', () => {
    expect(shouldRetry(0)).toBe(true);
  });

  it('returns true for attempt 1', () => {
    expect(shouldRetry(1)).toBe(true);
  });

  it('returns false when attempt >= EXTRACTION_MAX_RETRIES', () => {
    expect(shouldRetry(2)).toBe(false);
    expect(shouldRetry(5)).toBe(false);
  });
});

describe('buildRetryPrompt', () => {
  it('includes validation errors in the prompt', () => {
    const prompt = buildRetryPrompt({
      originalJson: '{"totalAmount": 100}',
      validationErrors: [{ field: 'subtotal', message: 'sum mismatch', expected: 80, actual: 100 }],
      attempt: 1,
    });

    expect(prompt).toContain('subtotal');
    expect(prompt).toContain('sum mismatch');
    expect(prompt).toContain('expected: 80');
    expect(prompt).toContain('"totalAmount": 100');
  });

  it('includes extracted text when provided', () => {
    const prompt = buildRetryPrompt({
      originalJson: '{}',
      validationErrors: [{ field: 'x', message: 'bad' }],
      extractedText: 'Invoice text content here',
      attempt: 1,
    });

    expect(prompt).toContain('Invoice text content here');
    expect(prompt).toContain('EXTRACTED TEXT');
  });

  it('truncates long extracted text', () => {
    const longText = 'A'.repeat(5000);
    const prompt = buildRetryPrompt({
      originalJson: '{}',
      validationErrors: [{ field: 'x', message: 'bad' }],
      extractedText: longText,
      attempt: 1,
    });

    expect(prompt).toContain('[... truncated]');
    expect(prompt.length).toBeLessThan(longText.length);
  });

  it('omits extracted text section when not provided', () => {
    const prompt = buildRetryPrompt({
      originalJson: '{}',
      validationErrors: [{ field: 'x', message: 'bad' }],
      attempt: 1,
    });

    expect(prompt).not.toContain('EXTRACTED TEXT');
  });
});
