import { describe, it, expect } from 'vitest';
import { escapeXml, formatDateISO, formatDateCII, formatAmount } from '@/lib/xml-utils';

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets', () => {
    expect(escapeXml('<tag>')).toBe('&lt;tag&gt;');
  });

  it('escapes quotes', () => {
    expect(escapeXml('"hello" \'world\'')).toBe('&quot;hello&quot; &apos;world&apos;');
  });

  it('strips control characters', () => {
    expect(escapeXml('hello\x00\x01\x08world')).toBe('helloworld');
  });

  it('preserves tabs and newlines', () => {
    expect(escapeXml('hello\tworld\n')).toBe('hello\tworld\n');
  });

  it('returns empty string for empty input', () => {
    expect(escapeXml('')).toBe('');
  });

  it('handles multiple special characters together', () => {
    expect(escapeXml('A & B < C > D "E" \'F\'')).toBe(
      'A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;'
    );
  });
});

describe('formatDateISO', () => {
  it('passes through ISO dates', () => {
    expect(formatDateISO('2024-01-30')).toBe('2024-01-30');
  });

  it('truncates ISO datetime to date', () => {
    expect(formatDateISO('2024-01-30T12:00:00Z')).toBe('2024-01-30');
  });

  it('converts German DD.MM.YYYY', () => {
    expect(formatDateISO('30.01.2024')).toBe('2024-01-30');
  });

  it('converts German with single-digit day/month', () => {
    expect(formatDateISO('5.3.2024')).toBe('2024-03-05');
  });

  it('converts YYYYMMDD', () => {
    expect(formatDateISO('20240130')).toBe('2024-01-30');
  });

  it('rejects ambiguous slash formats', () => {
    expect(() => formatDateISO('01/02/2024')).toThrow('Ambiguous');
  });

  it('returns empty for empty input', () => {
    expect(formatDateISO('')).toBe('');
  });
});

describe('formatDateCII', () => {
  it('passes through YYYYMMDD', () => {
    expect(formatDateCII('20240130')).toBe('20240130');
  });

  it('converts ISO date', () => {
    expect(formatDateCII('2024-01-30')).toBe('20240130');
  });

  it('converts German DD.MM.YYYY', () => {
    expect(formatDateCII('30.01.2024')).toBe('20240130');
  });

  it('rejects ambiguous slash formats', () => {
    expect(() => formatDateCII('01/02/2024')).toThrow('Ambiguous');
  });

  it('returns empty for empty input', () => {
    expect(formatDateCII('')).toBe('');
  });
});

describe('formatAmount', () => {
  it('formats integers with 2 decimals', () => {
    expect(formatAmount(100)).toBe('100.00');
  });

  it('formats with existing decimals', () => {
    expect(formatAmount(99.9)).toBe('99.90');
  });

  it('rounds to 2 decimals', () => {
    expect(formatAmount(10.555)).toBe('10.56');
  });

  it('handles zero', () => {
    expect(formatAmount(0)).toBe('0.00');
  });

  it('handles negative amounts', () => {
    expect(formatAmount(-50.1)).toBe('-50.10');
  });
});
