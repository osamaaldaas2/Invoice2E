/**
 * Format Registry — metadata for all supported e-invoicing output formats.
 * @module lib/format-registry
 */

import type { OutputFormat } from '@/types/canonical-invoice';

export interface FormatMetadata {
  id: OutputFormat;
  displayName: string;
  description: string;
  countries: string[];
  syntaxType: 'UBL' | 'CII' | 'FatturaPA' | 'KSeF' | 'PDF+CII';
  mimeType: string;
  fileExtension: string;
  isEU: boolean;
}

const EU_PEPPOL_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'NO', 'IS', 'LI',
];

const FACTURX_COUNTRIES = ['FR', 'DE', 'AT', 'CH', 'LU', 'BE'];

const FORMAT_REGISTRY: ReadonlyMap<OutputFormat, FormatMetadata> = new Map<OutputFormat, FormatMetadata>([
  ['xrechnung-cii', {
    id: 'xrechnung-cii',
    displayName: 'XRechnung (CII)',
    description: 'German e-invoicing standard based on UN/CEFACT Cross-Industry Invoice syntax.',
    countries: ['DE'],
    syntaxType: 'CII',
    mimeType: 'application/xml',
    fileExtension: '.xml',
    isEU: true,
  }],
  ['xrechnung-ubl', {
    id: 'xrechnung-ubl',
    displayName: 'XRechnung (UBL)',
    description: 'German e-invoicing standard based on UBL 2.1 syntax.',
    countries: ['DE'],
    syntaxType: 'UBL',
    mimeType: 'application/xml',
    fileExtension: '.xml',
    isEU: true,
  }],
  ['peppol-bis', {
    id: 'peppol-bis',
    displayName: 'PEPPOL BIS 3.0',
    description: 'Pan-European e-invoicing format for the PEPPOL network.',
    countries: EU_PEPPOL_COUNTRIES,
    syntaxType: 'UBL',
    mimeType: 'application/xml',
    fileExtension: '.xml',
    isEU: true,
  }],
  ['facturx-en16931', {
    id: 'facturx-en16931',
    displayName: 'Factur-X EN 16931',
    description: 'Hybrid PDF/A-3 invoice with embedded CII XML at EN 16931 conformance level.',
    countries: FACTURX_COUNTRIES,
    syntaxType: 'PDF+CII',
    mimeType: 'application/pdf',
    fileExtension: '.pdf',
    isEU: true,
  }],
  ['facturx-basic', {
    id: 'facturx-basic',
    displayName: 'Factur-X Basic',
    description: 'Hybrid PDF/A-3 invoice with embedded CII XML at Basic conformance level.',
    countries: FACTURX_COUNTRIES,
    syntaxType: 'PDF+CII',
    mimeType: 'application/pdf',
    fileExtension: '.pdf',
    isEU: true,
  }],
  ['fatturapa', {
    id: 'fatturapa',
    displayName: 'FatturaPA',
    description: 'Italian electronic invoicing format mandated by the Agenzia delle Entrate.',
    countries: ['IT'],
    syntaxType: 'FatturaPA',
    mimeType: 'application/xml',
    fileExtension: '.xml',
    isEU: true,
  }],
  ['ksef', {
    id: 'ksef',
    displayName: 'KSeF FA(2)',
    description: 'Polish structured e-invoice for the Krajowy System e-Faktur.',
    countries: ['PL'],
    syntaxType: 'KSeF',
    mimeType: 'application/xml',
    fileExtension: '.xml',
    isEU: true,
  }],
  ['nlcius', {
    id: 'nlcius',
    displayName: 'NLCIUS / SI-UBL 2.0',
    description: 'Dutch CIUS of EN 16931 based on UBL, also known as SI-UBL 2.0.',
    countries: ['NL'],
    syntaxType: 'UBL',
    mimeType: 'application/xml',
    fileExtension: '.xml',
    isEU: true,
  }],
  ['cius-ro', {
    id: 'cius-ro',
    displayName: 'CIUS-RO',
    description: 'Romanian CIUS of EN 16931 based on UBL for the RO e-Factura system.',
    countries: ['RO'],
    syntaxType: 'UBL',
    mimeType: 'application/xml',
    fileExtension: '.xml',
    isEU: true,
  }],
]);

export function getFormatMetadata(id: OutputFormat): FormatMetadata {
  const meta = FORMAT_REGISTRY.get(id);
  if (!meta) {
    throw new Error(`Unknown output format: ${id}`);
  }
  return meta;
}

export function getAllFormats(): FormatMetadata[] {
  return Array.from(FORMAT_REGISTRY.values());
}

export function getFormatsByCountry(countryCode: string): FormatMetadata[] {
  const code = countryCode.toUpperCase();
  return Array.from(FORMAT_REGISTRY.values()).filter(f => f.countries.includes(code));
}
