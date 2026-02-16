import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratorFactory } from '@/services/format/GeneratorFactory';

describe('GeneratorFactory', () => {
  beforeEach(() => {
    GeneratorFactory.clear();
  });

  it('creates xrechnung-cii generator', () => {
    const gen = GeneratorFactory.create('xrechnung-cii');
    expect(gen.formatId).toBe('xrechnung-cii');
    expect(gen.formatName).toBeDefined();
  });

  it('creates xrechnung-ubl generator', () => {
    const gen = GeneratorFactory.create('xrechnung-ubl');
    expect(gen.formatId).toBe('xrechnung-ubl');
  });

  it('returns cached singleton instances', () => {
    const gen1 = GeneratorFactory.create('xrechnung-cii');
    const gen2 = GeneratorFactory.create('xrechnung-cii');
    expect(gen1).toBe(gen2);
  });

  it('returns different instances for different formats', () => {
    const cii = GeneratorFactory.create('xrechnung-cii');
    const ubl = GeneratorFactory.create('xrechnung-ubl');
    expect(cii).not.toBe(ubl);
  });

  it('creates fatturapa generator', () => {
    const gen = GeneratorFactory.create('fatturapa');
    expect(gen.formatId).toBe('fatturapa');
    expect(gen.formatName).toBeDefined();
  });

  it('lists available formats', () => {
    const formats = GeneratorFactory.getAvailableFormats();
    expect(formats).toContain('xrechnung-cii');
    expect(formats).toContain('xrechnung-ubl');
    expect(formats).toContain('peppol-bis');
    expect(formats).toContain('facturx-en16931');
    expect(formats).toContain('facturx-basic');
    expect(formats).toContain('fatturapa');
    expect(formats.length).toBeGreaterThanOrEqual(6);
  });

  it('clear resets the cache', () => {
    const gen1 = GeneratorFactory.create('xrechnung-cii');
    GeneratorFactory.clear();
    const gen2 = GeneratorFactory.create('xrechnung-cii');
    expect(gen1).not.toBe(gen2);
  });
});
