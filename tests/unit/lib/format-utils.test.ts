/**
 * B-02 regression test: format-utils mapping correctness.
 * Ensures formatToProfileId returns format-specific IDs (not 'en16931-base').
 */
import { describe, it, expect } from 'vitest';
import { formatToProfileId, resolveOutputFormat, toLegacyFormat } from '@/lib/format-utils';
import type { OutputFormat } from '@/types/canonical-invoice';

describe('formatToProfileId', () => {
  // B-02 regression: these were both mapping to 'en16931-base'
  it('maps facturx-en16931 → facturx-en16931 (not en16931-base)', () => {
    expect(formatToProfileId('facturx-en16931')).toBe('facturx-en16931');
  });

  it('maps facturx-basic → facturx-basic (not en16931-base)', () => {
    expect(formatToProfileId('facturx-basic')).toBe('facturx-basic');
  });

  // Verify all other formats remain identity-mapped
  const expectedMappings: [OutputFormat, string][] = [
    ['xrechnung-cii', 'xrechnung-cii'],
    ['xrechnung-ubl', 'xrechnung-ubl'],
    ['peppol-bis', 'peppol-bis'],
    ['fatturapa', 'fatturapa'],
    ['ksef', 'ksef'],
    ['nlcius', 'nlcius'],
    ['cius-ro', 'cius-ro'],
  ];

  it.each(expectedMappings)('maps %s → %s', (format, expected) => {
    expect(formatToProfileId(format)).toBe(expected);
  });
});

describe('resolveOutputFormat', () => {
  it('maps legacy CII → xrechnung-cii', () => {
    expect(resolveOutputFormat('CII')).toBe('xrechnung-cii');
  });

  it('maps legacy UBL → xrechnung-ubl', () => {
    expect(resolveOutputFormat('UBL')).toBe('xrechnung-ubl');
  });

  it('passes through modern format strings', () => {
    expect(resolveOutputFormat('facturx-en16931')).toBe('facturx-en16931');
    expect(resolveOutputFormat('ksef')).toBe('ksef');
  });
});

describe('toLegacyFormat', () => {
  it('maps xrechnung-cii → XRechnung', () => {
    expect(toLegacyFormat('xrechnung-cii')).toBe('XRechnung');
  });

  it('maps facturx-en16931 → Factur-X EN16931', () => {
    expect(toLegacyFormat('facturx-en16931')).toBe('Factur-X EN16931');
  });

  it('maps facturx-basic → Factur-X Basic', () => {
    expect(toLegacyFormat('facturx-basic')).toBe('Factur-X Basic');
  });
});
