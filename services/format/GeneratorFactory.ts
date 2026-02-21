/**
 * Factory for format generators.
 * Follows the ExtractorFactory pattern — cached singleton instances selected by OutputFormat.
 *
 * @module services/format/GeneratorFactory
 */

import { logger } from '@/lib/logger';
import type { OutputFormat } from '@/types/canonical-invoice';
import type { IFormatGenerator } from './IFormatGenerator';
import { XRechnungCIIGenerator } from './xrechnung-cii.generator';
import { XRechnungUBLGenerator } from './xrechnung-ubl.generator';
import { PeppolBISGenerator } from './peppol/peppol-bis.generator';
import { FacturXGenerator } from './facturx/facturx.generator';
import { KsefGenerator } from './ksef/ksef.generator';
import { FatturapaGenerator } from './fatturapa/fatturapa.generator';
import { NLCIUSGenerator } from './nlcius/nlcius.generator';
import { CIUSROGenerator } from './ciusro/ciusro.generator';

export class GeneratorFactory {
  private static instances = new Map<OutputFormat, IFormatGenerator>();

  /**
   * Get a format generator for the given output format.
   * Returns a cached singleton instance.
   */
  static create(format: OutputFormat): IFormatGenerator {
    const cached = this.instances.get(format);
    if (cached) return cached;

    let generator: IFormatGenerator;

    switch (format) {
      case 'xrechnung-cii':
        generator = new XRechnungCIIGenerator();
        break;
      case 'xrechnung-ubl':
        generator = new XRechnungUBLGenerator();
        break;
      case 'peppol-bis':
        generator = new PeppolBISGenerator();
        break;
      case 'facturx-en16931':
      case 'facturx-basic':
        generator = new FacturXGenerator(format);
        break;
      case 'fatturapa':
        generator = new FatturapaGenerator();
        break;
      case 'nlcius':
        generator = new NLCIUSGenerator();
        break;
      case 'cius-ro':
        generator = new CIUSROGenerator();
        break;
      case 'ksef':
        generator = new KsefGenerator();
        break;
      default: {
        const _exhaustive: never = format;
        throw new Error(`Unknown output format: ${_exhaustive}`);
      }
    }

    this.instances.set(format, generator);
    logger.info('Format generator created', { format, name: generator.formatName });
    return generator;
  }

  /**
   * All implemented formats. This list must match the OutputFormat union exactly.
   * The exhaustive switch in create() ensures compile-time safety for new formats,
   * but this array must also be updated when adding a new format.
   */
  private static readonly implementedFormats: readonly OutputFormat[] = [
    'xrechnung-cii',
    'xrechnung-ubl',
    'peppol-bis',
    'facturx-en16931',
    'facturx-basic',
    'fatturapa',
    'ksef',
    'nlcius',
    'cius-ro',
  ] as const satisfies readonly OutputFormat[];

  /**
   * Get all currently available output formats.
   * Derived from the set of formats that have working generators.
   */
  static getAvailableFormats(): OutputFormat[] {
    return [...this.implementedFormats];
  }

  /**
   * Get version information for all implemented format engines.
   * Useful for health checks, debugging, and admin dashboards.
   * @returns Array of objects containing format id, name, generator version, spec version, and deprecation status.
   */
  static getEngineVersions(): Array<{
    formatId: OutputFormat;
    formatName: string;
    version: string;
    specVersion: string;
    specDate: string;
    deprecated: boolean;
  }> {
    return this.implementedFormats.map((format) => {
      const gen = this.create(format);
      return {
        formatId: gen.formatId,
        formatName: gen.formatName,
        version: gen.version,
        specVersion: gen.specVersion,
        specDate: gen.specDate,
        deprecated: gen.deprecated ?? false,
      };
    });
  }

  /**
   * Clear the instance cache (useful for testing).
   */
  static clear(): void {
    this.instances.clear();
  }
}
