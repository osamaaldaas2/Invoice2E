import { describe, it, expect } from 'vitest';
import {
  getFormatMetadata,
  getAllFormats,
  getFormatsByCountry,
} from '@/lib/format-registry';
import type { OutputFormat } from '@/types/canonical-invoice';

const ALL_FORMAT_IDS: OutputFormat[] = [
  'xrechnung-cii', 'xrechnung-ubl', 'peppol-bis',
  'facturx-en16931', 'facturx-basic',
  'fatturapa', 'ksef', 'nlcius', 'cius-ro',
];

describe('Format Registry', () => {
  it('registers all 9 formats', () => {
    const formats = getAllFormats();
    expect(formats).toHaveLength(9);
  });

  it('returns metadata for every known format', () => {
    for (const id of ALL_FORMAT_IDS) {
      const meta = getFormatMetadata(id);
      expect(meta.id).toBe(id);
      expect(meta.displayName).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.countries.length).toBeGreaterThan(0);
      expect(meta.mimeType).toBeTruthy();
      expect(meta.fileExtension).toMatch(/^\./);
      expect(typeof meta.isEU).toBe('boolean');
    }
  });

  it('throws for unknown format', () => {
    expect(() => getFormatMetadata('unknown' as OutputFormat)).toThrow('Unknown output format');
  });

  it('getFormatsByCountry returns German formats', () => {
    const de = getFormatsByCountry('DE');
    const ids = de.map(f => f.id);
    expect(ids).toContain('xrechnung-cii');
    expect(ids).toContain('xrechnung-ubl');
    expect(ids).toContain('peppol-bis');
    expect(ids).toContain('facturx-en16931');
  });

  it('getFormatsByCountry is case-insensitive', () => {
    const it1 = getFormatsByCountry('it');
    expect(it1.some(f => f.id === 'fatturapa')).toBe(true);
  });

  it('getFormatsByCountry returns empty for non-EU country', () => {
    expect(getFormatsByCountry('US')).toHaveLength(0);
  });

  it('Factur-X formats have PDF mime type and .pdf extension', () => {
    for (const id of ['facturx-en16931', 'facturx-basic'] as OutputFormat[]) {
      const meta = getFormatMetadata(id);
      expect(meta.mimeType).toBe('application/pdf');
      expect(meta.fileExtension).toBe('.pdf');
      expect(meta.syntaxType).toBe('PDF+CII');
    }
  });

  it('XML formats have application/xml mime type', () => {
    const xmlFormats: OutputFormat[] = [
      'xrechnung-cii', 'xrechnung-ubl', 'peppol-bis',
      'fatturapa', 'ksef', 'nlcius', 'cius-ro',
    ];
    for (const id of xmlFormats) {
      expect(getFormatMetadata(id).mimeType).toBe('application/xml');
    }
  });
});
