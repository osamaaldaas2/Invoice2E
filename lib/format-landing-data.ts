/**
 * Static data for format-specific SEO landing pages.
 * Complements format-registry.ts with marketing copy keys and SEO metadata.
 */
import type { OutputFormat } from '@/types/canonical-invoice';

export interface FormatLandingConfig {
  formatId: OutputFormat;
  /** URL slug: /pdf-to-{slug} */
  slug: string;
  /** i18n namespace key under formatPages.{key} */
  i18nKey: string;
  /** Country flag emojis for display */
  flags: string;
  /** Output type badge */
  outputType: 'XML' | 'PDF';
  /** Whether this format has a mandatory date to highlight */
  hasMandatoryAlert: boolean;
  /** Whether Leitweg-ID is relevant */
  leitwegRelevant: boolean;
  /** Related format slugs for interlinking */
  relatedSlugs: string[];
  /** Number of FAQ items for this format */
  faqCount: number;
  /** Is this a "popular" format (shown first in hub) */
  popular: boolean;
}

export const FORMAT_LANDING_CONFIGS: FormatLandingConfig[] = [
  {
    formatId: 'xrechnung-cii',
    slug: 'pdf-to-xrechnung',
    i18nKey: 'xrechnungCii',
    flags: '🇩🇪',
    outputType: 'XML',
    hasMandatoryAlert: true,
    leitwegRelevant: true,
    relatedSlugs: ['pdf-to-xrechnung-ubl', 'pdf-to-zugferd', 'pdf-to-peppol'],
    faqCount: 5,
    popular: true,
  },
  {
    formatId: 'xrechnung-ubl',
    slug: 'pdf-to-xrechnung-ubl',
    i18nKey: 'xrechnungUbl',
    flags: '🇩🇪',
    outputType: 'XML',
    hasMandatoryAlert: true,
    leitwegRelevant: true,
    relatedSlugs: ['pdf-to-xrechnung', 'pdf-to-peppol', 'pdf-to-zugferd'],
    faqCount: 4,
    popular: true,
  },
  {
    formatId: 'facturx-en16931',
    slug: 'pdf-to-zugferd',
    i18nKey: 'zugferd',
    flags: '🇩🇪🇫🇷🇦🇹🇨🇭',
    outputType: 'PDF',
    hasMandatoryAlert: false,
    leitwegRelevant: false,
    relatedSlugs: ['pdf-to-xrechnung', 'pdf-to-facturx', 'pdf-to-peppol'],
    faqCount: 5,
    popular: true,
  },
  {
    formatId: 'facturx-basic',
    slug: 'pdf-to-facturx',
    i18nKey: 'facturx',
    flags: '🇫🇷',
    outputType: 'PDF',
    hasMandatoryAlert: false,
    leitwegRelevant: false,
    relatedSlugs: ['pdf-to-zugferd', 'pdf-to-peppol', 'pdf-to-xrechnung'],
    faqCount: 4,
    popular: false,
  },
  {
    formatId: 'peppol-bis',
    slug: 'pdf-to-peppol',
    i18nKey: 'peppol',
    flags: '🇪🇺',
    outputType: 'XML',
    hasMandatoryAlert: false,
    leitwegRelevant: false,
    relatedSlugs: ['pdf-to-xrechnung', 'pdf-to-zugferd', 'pdf-to-fatturapa'],
    faqCount: 4,
    popular: true,
  },
  {
    formatId: 'fatturapa',
    slug: 'pdf-to-fatturapa',
    i18nKey: 'fatturapa',
    flags: '🇮🇹',
    outputType: 'XML',
    hasMandatoryAlert: true,
    leitwegRelevant: false,
    relatedSlugs: ['pdf-to-peppol', 'pdf-to-xrechnung', 'pdf-to-ksef'],
    faqCount: 4,
    popular: false,
  },
  {
    formatId: 'ksef',
    slug: 'pdf-to-ksef',
    i18nKey: 'ksef',
    flags: '🇵🇱',
    outputType: 'XML',
    hasMandatoryAlert: true,
    leitwegRelevant: false,
    relatedSlugs: ['pdf-to-peppol', 'pdf-to-xrechnung', 'pdf-to-cius-ro'],
    faqCount: 4,
    popular: false,
  },
  {
    formatId: 'nlcius',
    slug: 'pdf-to-nlcius',
    i18nKey: 'nlcius',
    flags: '🇳🇱',
    outputType: 'XML',
    hasMandatoryAlert: false,
    leitwegRelevant: false,
    relatedSlugs: ['pdf-to-peppol', 'pdf-to-xrechnung', 'pdf-to-cius-ro'],
    faqCount: 4,
    popular: false,
  },
  {
    formatId: 'cius-ro',
    slug: 'pdf-to-cius-ro',
    i18nKey: 'ciusRo',
    flags: '🇷🇴',
    outputType: 'XML',
    hasMandatoryAlert: false,
    leitwegRelevant: false,
    relatedSlugs: ['pdf-to-peppol', 'pdf-to-xrechnung', 'pdf-to-nlcius'],
    faqCount: 4,
    popular: false,
  },
];

export function getFormatLandingBySlug(slug: string): FormatLandingConfig | undefined {
  return FORMAT_LANDING_CONFIGS.find((c) => c.slug === slug);
}

export function getFormatLandingById(formatId: OutputFormat): FormatLandingConfig | undefined {
  return FORMAT_LANDING_CONFIGS.find((c) => c.formatId === formatId);
}
