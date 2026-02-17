import type { OutputFormat } from '@/types/canonical-invoice';
import type { ProfileId } from '@/validation/profiles/IProfileValidator';

/** Explicit mapping from OutputFormat to ProfileId for validation. */
export function formatToProfileId(format: OutputFormat): ProfileId {
  switch (format) {
    case 'xrechnung-cii':
      return 'xrechnung-cii';
    case 'xrechnung-ubl':
      return 'xrechnung-ubl';
    case 'peppol-bis':
      return 'peppol-bis';
    case 'facturx-en16931':
      return 'facturx-en16931';
    case 'facturx-basic':
      return 'facturx-basic';
    case 'fatturapa':
      return 'fatturapa';
    case 'ksef':
      return 'ksef';
    case 'nlcius':
      return 'nlcius';
    case 'cius-ro':
      return 'cius-ro';
    default:
      return format satisfies never;
  }
}

/** Map legacy format strings to OutputFormat */
export function resolveOutputFormat(format: string): OutputFormat {
  switch (format) {
    case 'CII':
      return 'xrechnung-cii';
    case 'UBL':
      return 'xrechnung-ubl';
    default:
      return format as OutputFormat;
  }
}

/** Map OutputFormat back to legacy DB format string */
export function toLegacyFormat(format: OutputFormat): string {
  switch (format) {
    case 'xrechnung-cii':
      return 'XRechnung';
    case 'xrechnung-ubl':
      return 'UBL';
    case 'peppol-bis':
      return 'PEPPOL BIS';
    case 'facturx-en16931':
      return 'Factur-X EN16931';
    case 'facturx-basic':
      return 'Factur-X Basic';
    case 'fatturapa':
      return 'FatturaPA';
    case 'ksef':
      return 'KSeF';
    case 'nlcius':
      return 'NLCIUS';
    case 'cius-ro':
      return 'CIUS-RO';
    default:
      return format;
  }
}
