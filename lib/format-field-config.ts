/**
 * FORMAT_FIELD_CONFIG — Single source of truth for per-format field requirements.
 *
 * Derived directly from the validation rule files:
 *   validation/xrechnung-rules.ts  (BR-DE-*)
 *   validation/peppol-rules.ts     (PEPPOL-EN16931-*)
 *   validation/fatturapa-rules.ts  (FPA-*)
 *   validation/ksef-rules.ts       (KSEF-*)
 *   validation/nlcius-rules.ts     (NLCIUS-*)
 *   validation/facturx-rules.ts    (FX-*)
 *   validation/ciusro-rules.ts     (CIUS-RO-*)
 *   validation/business-rules.ts   (BR-CO-25, BR-S-*, etc.)
 *
 * Consumers:
 *   - components/forms/invoice-review/* (show/hide/require fields dynamically)
 *   - components/forms/BulkUploadForm.tsx (readiness checks per format)
 *   - services/batch/batch.processor.ts (auto-detect format from countryCode)
 *
 * @module lib/format-field-config
 */

import type { OutputFormat } from '@/types/canonical-invoice';

/** How a field behaves for a given format */
export type FieldVisibility = 'required' | 'optional' | 'hidden';

export interface FormatFieldConfig {
  // ── Seller ──────────────────────────────────────────────────────────────
  sellerPhone: FieldVisibility; // BR-DE-2 (XRechnung)
  sellerEmail: FieldVisibility; // BR-DE-2 (XRechnung)
  sellerContactName: FieldVisibility; // BR-DE-2 (XRechnung)
  sellerIban: FieldVisibility; // BR-DE-23-a (XRechnung SEPA)
  sellerBic: FieldVisibility;
  sellerVatId: FieldVisibility; // EU VAT / NIP / Partita IVA / NL BTW
  sellerTaxNumber: FieldVisibility; // Steuernummer / CUI-CIF
  sellerElectronicAddress: FieldVisibility; // BT-34 Peppol participant ID
  sellerElectronicAddressScheme: FieldVisibility; // EAS code (0088, 0190, 0106, …)
  sellerStreet: FieldVisibility;
  sellerCity: FieldVisibility;
  sellerPostalCode: FieldVisibility;
  sellerCountryCode: FieldVisibility;

  // ── Buyer ───────────────────────────────────────────────────────────────
  buyerStreet: FieldVisibility; // BR-DE-6 (XRechnung)
  buyerCity: FieldVisibility; // BR-DE-7
  buyerPostalCode: FieldVisibility; // BR-DE-8
  buyerCountryCode: FieldVisibility; // BR-DE-11, FX-COMMON-007
  buyerVatId: FieldVisibility; // FPA-020 (FatturaPA)
  buyerTaxNumber: FieldVisibility; // FPA-020 / CIUS-RO CUI
  buyerReference: FieldVisibility; // Leitweg-ID BR-DE-15 (warning)
  buyerElectronicAddress: FieldVisibility; // BT-49 Peppol / SDI CodiceDestinatario
  buyerElectronicAddressScheme: FieldVisibility;
  buyerCodiceDestinatario: FieldVisibility; // FPA — 7-char SDI routing code

  // ── Invoice ─────────────────────────────────────────────────────────────
  currency: FieldVisibility;
  paymentTerms: FieldVisibility; // BR-CO-25
  notes: FieldVisibility;

  // ── Format-specific UI hints (shown below the field input) ──────────────
  hints: Partial<
    Record<
      | 'sellerVatId'
      | 'sellerTaxNumber'
      | 'sellerElectronicAddress'
      | 'sellerElectronicAddressScheme'
      | 'buyerElectronicAddress'
      | 'buyerElectronicAddressScheme'
      | 'buyerCodiceDestinatario'
      | 'buyerReference'
      | 'buyerVatId'
      | 'buyerTaxNumber'
      | 'currency'
      | 'sellerIban'
      | 'sellerPhone',
      string
    >
  >;
}

// ─── Per-format configurations ───────────────────────────────────────────────

export const FORMAT_FIELD_CONFIG: Record<OutputFormat, FormatFieldConfig> = {
  // ── XRechnung CII (German standard) ────────────────────────────────────
  'xrechnung-cii': {
    sellerPhone: 'required',
    sellerEmail: 'required',
    sellerContactName: 'required',
    sellerIban: 'required',
    sellerBic: 'optional',
    sellerVatId: 'required', // or sellerTaxNumber (at least one)
    sellerTaxNumber: 'optional',
    sellerElectronicAddress: 'required', // BT-34
    sellerElectronicAddressScheme: 'optional',
    sellerStreet: 'required',
    sellerCity: 'required',
    sellerPostalCode: 'required',
    sellerCountryCode: 'required',
    buyerStreet: 'required',
    buyerCity: 'required',
    buyerPostalCode: 'required',
    buyerCountryCode: 'required',
    buyerVatId: 'optional',
    buyerTaxNumber: 'optional',
    buyerReference: 'required', // Leitweg-ID — BR-DE-15 / DE-R-015 (fatal)
    buyerElectronicAddress: 'required', // BT-49
    buyerElectronicAddressScheme: 'optional',
    buyerCodiceDestinatario: 'hidden',
    currency: 'required',
    paymentTerms: 'required',
    notes: 'optional',
    hints: {
      sellerVatId: 'USt-IdNr. z.B. DE123456789 — oder Steuernummer angeben',
      sellerTaxNumber: 'Steuernummer z.B. 12/345/67890 — alternativ zur USt-IdNr.',
      sellerElectronicAddress: 'BT-34 — z.B. E-Mail-Adresse des Rechnungsstellers',
      buyerElectronicAddress: 'BT-49 — z.B. E-Mail-Adresse des Rechnungsempfängers',
      buyerReference: 'Leitweg-ID (BR-DE-15) — Pflichtfeld für XRechnung',
      currency: 'Muss EUR sein (BR-DE-18)',
      sellerIban: 'IBAN für SEPA-Überweisung (BR-DE-23-a)',
    },
  },

  // ── XRechnung UBL (same rules as CII) ──────────────────────────────────
  'xrechnung-ubl': {
    sellerPhone: 'required',
    sellerEmail: 'required',
    sellerContactName: 'required',
    sellerIban: 'required',
    sellerBic: 'optional',
    sellerVatId: 'required',
    sellerTaxNumber: 'optional',
    sellerElectronicAddress: 'required',
    sellerElectronicAddressScheme: 'optional',
    sellerStreet: 'required',
    sellerCity: 'required',
    sellerPostalCode: 'required',
    sellerCountryCode: 'required',
    buyerStreet: 'required',
    buyerCity: 'required',
    buyerPostalCode: 'required',
    buyerCountryCode: 'required',
    buyerVatId: 'optional',
    buyerTaxNumber: 'optional',
    buyerReference: 'required', // Leitweg-ID — BR-DE-15 / DE-R-015 (fatal)
    buyerElectronicAddress: 'required',
    buyerElectronicAddressScheme: 'optional',
    buyerCodiceDestinatario: 'hidden',
    currency: 'required',
    paymentTerms: 'required',
    notes: 'optional',
    hints: {
      sellerVatId: 'USt-IdNr. z.B. DE123456789 — oder Steuernummer angeben',
      sellerElectronicAddress: 'BT-34 — z.B. E-Mail-Adresse des Rechnungsstellers',
      buyerElectronicAddress: 'BT-49 — z.B. E-Mail-Adresse des Rechnungsempfängers',
      buyerReference: 'Leitweg-ID (BR-DE-15) — Pflichtfeld für XRechnung',
      currency: 'Muss EUR sein (BR-DE-18)',
      sellerIban: 'IBAN für SEPA-Überweisung (BR-DE-23-a)',
    },
  },

  // ── Peppol BIS Billing 3.0 ──────────────────────────────────────────────
  'peppol-bis': {
    sellerPhone: 'optional',
    sellerEmail: 'optional',
    sellerContactName: 'optional',
    sellerIban: 'optional',
    sellerBic: 'optional',
    sellerVatId: 'required',
    sellerTaxNumber: 'optional',
    sellerElectronicAddress: 'required', // BT-34
    sellerElectronicAddressScheme: 'required', // EAS code
    sellerStreet: 'required',
    sellerCity: 'required',
    sellerPostalCode: 'required',
    sellerCountryCode: 'required',
    buyerStreet: 'optional',
    buyerCity: 'optional',
    buyerPostalCode: 'optional',
    buyerCountryCode: 'optional',
    buyerVatId: 'optional',
    buyerTaxNumber: 'optional',
    buyerReference: 'optional',
    buyerElectronicAddress: 'required', // BT-49
    buyerElectronicAddressScheme: 'required',
    buyerCodiceDestinatario: 'hidden',
    currency: 'required',
    paymentTerms: 'required',
    notes: 'optional',
    hints: {
      sellerVatId: 'EU VAT ID required for Peppol (e.g. DE123456789)',
      sellerElectronicAddress: 'Peppol Participant ID (BT-34) — e.g. 0088:1234567890123',
      sellerElectronicAddressScheme: 'EAS scheme code, e.g. 0088 (EAN), 0192 (NO:ORG), 0184 (DK:P)',
      buyerElectronicAddress: 'Peppol Participant ID (BT-49) — e.g. 0088:9876543210987',
      buyerElectronicAddressScheme: 'EAS scheme code, e.g. 0088 (EAN), 0192 (NO:ORG)',
    },
  },

  // ── FatturaPA (Italy) ───────────────────────────────────────────────────
  fatturapa: {
    sellerPhone: 'optional',
    sellerEmail: 'optional',
    sellerContactName: 'optional',
    sellerIban: 'optional',
    sellerBic: 'optional',
    sellerVatId: 'required', // Partita IVA IT format
    sellerTaxNumber: 'optional',
    sellerElectronicAddress: 'hidden',
    sellerElectronicAddressScheme: 'hidden',
    sellerStreet: 'required',
    sellerCity: 'required',
    sellerPostalCode: 'required',
    sellerCountryCode: 'required',
    buyerStreet: 'optional',
    buyerCity: 'optional',
    buyerPostalCode: 'optional',
    buyerCountryCode: 'optional',
    buyerVatId: 'required', // or buyerTaxNumber (FPA-020)
    buyerTaxNumber: 'optional', // Codice Fiscale
    buyerReference: 'optional',
    buyerElectronicAddress: 'required', // CodiceDestinatario or PEC
    buyerElectronicAddressScheme: 'hidden',
    buyerCodiceDestinatario: 'required', // 7-char SDI routing code
    currency: 'required',
    paymentTerms: 'optional',
    notes: 'optional',
    hints: {
      sellerVatId: 'Partita IVA — formato IT + 11 cifre, es. IT01234567890',
      buyerVatId: 'P.IVA acquirente — o Codice Fiscale se soggetto privato',
      buyerElectronicAddress: 'CodiceDestinatario (7 caratteri, es. ABCDEF1) o indirizzo PEC',
      buyerCodiceDestinatario: 'Codice SDI — 7 caratteri alfanumerici per instradamento',
    },
  },

  // ── KSeF FA(3) (Poland, mandatory since 2026-02-01) ─────────────────────
  ksef: {
    sellerPhone: 'optional',
    sellerEmail: 'optional',
    sellerContactName: 'optional',
    sellerIban: 'optional',
    sellerBic: 'optional',
    sellerVatId: 'required', // NIP 10-digit
    sellerTaxNumber: 'optional',
    sellerElectronicAddress: 'hidden',
    sellerElectronicAddressScheme: 'hidden',
    sellerStreet: 'optional',
    sellerCity: 'optional',
    sellerPostalCode: 'optional',
    sellerCountryCode: 'optional',
    buyerStreet: 'optional',
    buyerCity: 'optional',
    buyerPostalCode: 'optional',
    buyerCountryCode: 'optional',
    buyerVatId: 'optional', // Buyer NIP or just name
    buyerTaxNumber: 'optional',
    buyerReference: 'optional',
    buyerElectronicAddress: 'hidden',
    buyerElectronicAddressScheme: 'hidden',
    buyerCodiceDestinatario: 'hidden',
    currency: 'required',
    paymentTerms: 'optional',
    notes: 'hidden',
    hints: {
      sellerVatId: 'NIP — dokładnie 10 cyfr, np. 1234567890',
      buyerVatId: 'NIP nabywcy (10 cyfr) — lub podaj nazwę firmy jeśli brak NIP',
    },
  },

  // ── NLCIUS / SI-UBL 2.0 (Netherlands) ──────────────────────────────────
  nlcius: {
    sellerPhone: 'optional',
    sellerEmail: 'optional',
    sellerContactName: 'optional',
    sellerIban: 'optional',
    sellerBic: 'optional',
    sellerVatId: 'required', // Dutch BTW: NL+9+B+2
    sellerTaxNumber: 'optional',
    sellerElectronicAddress: 'required', // OIN (0190) or KVK (0106)
    sellerElectronicAddressScheme: 'required',
    sellerStreet: 'required',
    sellerCity: 'required',
    sellerPostalCode: 'required',
    sellerCountryCode: 'required',
    buyerStreet: 'optional',
    buyerCity: 'optional',
    buyerPostalCode: 'optional',
    buyerCountryCode: 'optional',
    buyerVatId: 'optional',
    buyerTaxNumber: 'optional',
    buyerReference: 'optional',
    buyerElectronicAddress: 'required', // OIN or KVK
    buyerElectronicAddressScheme: 'required',
    buyerCodiceDestinatario: 'hidden',
    currency: 'required',
    paymentTerms: 'required',
    notes: 'optional',
    hints: {
      sellerVatId: 'BTW-nummer: NL + 9 cijfers + B + 2 cijfers, bijv. NL123456789B01',
      sellerElectronicAddress: 'OIN (schema 0190, 20 cijfers) of KVK (schema 0106, 8 cijfers)',
      sellerElectronicAddressScheme: '0190 voor OIN, 0106 voor KVK',
      buyerElectronicAddress: 'OIN (schema 0190, 20 cijfers) of KVK (schema 0106, 8 cijfers)',
      buyerElectronicAddressScheme: '0190 voor OIN, 0106 voor KVK',
    },
  },

  // ── Factur-X EN 16931 (France/DACH, hybrid PDF+XML) ────────────────────
  'facturx-en16931': {
    sellerPhone: 'optional',
    sellerEmail: 'optional',
    sellerContactName: 'optional',
    sellerIban: 'optional',
    sellerBic: 'optional',
    sellerVatId: 'required',
    sellerTaxNumber: 'optional',
    sellerElectronicAddress: 'optional', // Only required when sent via Peppol
    sellerElectronicAddressScheme: 'optional',
    sellerStreet: 'required',
    sellerCity: 'required',
    sellerPostalCode: 'required',
    sellerCountryCode: 'required',
    buyerStreet: 'optional',
    buyerCity: 'optional',
    buyerPostalCode: 'optional',
    buyerCountryCode: 'required',
    buyerVatId: 'optional',
    buyerTaxNumber: 'optional',
    buyerReference: 'optional',
    buyerElectronicAddress: 'optional', // Only required when sent via Peppol
    buyerElectronicAddressScheme: 'optional',
    buyerCodiceDestinatario: 'hidden',
    currency: 'required',
    paymentTerms: 'required',
    notes: 'optional',
    hints: {
      sellerVatId: 'EU VAT ID required, e.g. FR12345678901 or DE123456789',
    },
  },

  // ── Factur-X Basic (simplified profile, more lenient) ──────────────────
  'facturx-basic': {
    sellerPhone: 'optional',
    sellerEmail: 'optional',
    sellerContactName: 'optional',
    sellerIban: 'optional',
    sellerBic: 'optional',
    sellerVatId: 'required',
    sellerTaxNumber: 'optional',
    sellerElectronicAddress: 'optional', // Only required when sent via Peppol
    sellerElectronicAddressScheme: 'optional',
    sellerStreet: 'required',
    sellerCity: 'required',
    sellerPostalCode: 'required',
    sellerCountryCode: 'required',
    buyerStreet: 'optional',
    buyerCity: 'optional',
    buyerPostalCode: 'optional',
    buyerCountryCode: 'required',
    buyerVatId: 'optional',
    buyerTaxNumber: 'optional',
    buyerReference: 'optional',
    buyerElectronicAddress: 'optional', // Only required when sent via Peppol
    buyerElectronicAddressScheme: 'optional',
    buyerCodiceDestinatario: 'hidden',
    currency: 'required',
    paymentTerms: 'optional', // Basic profile is more lenient
    notes: 'optional',
    hints: {
      sellerVatId: 'EU VAT ID required, e.g. FR12345678901 or DE123456789',
    },
  },

  // ── CIUS-RO (Romania, extends Peppol) ──────────────────────────────────
  'cius-ro': {
    sellerPhone: 'optional',
    sellerEmail: 'optional',
    sellerContactName: 'optional',
    sellerIban: 'optional',
    sellerBic: 'optional',
    sellerVatId: 'required', // RO + 2-10 digits
    sellerTaxNumber: 'optional', // CUI/CIF
    sellerElectronicAddress: 'required', // Peppol inherited
    sellerElectronicAddressScheme: 'required',
    sellerStreet: 'required',
    sellerCity: 'required',
    sellerPostalCode: 'required',
    sellerCountryCode: 'required',
    buyerStreet: 'optional',
    buyerCity: 'optional',
    buyerPostalCode: 'optional',
    buyerCountryCode: 'optional',
    buyerVatId: 'optional',
    buyerTaxNumber: 'optional', // CUI/CIF
    buyerReference: 'optional',
    buyerElectronicAddress: 'required', // Peppol inherited
    buyerElectronicAddressScheme: 'required',
    buyerCodiceDestinatario: 'hidden',
    currency: 'required',
    paymentTerms: 'required',
    notes: 'optional',
    hints: {
      sellerVatId: 'CIF/TVA: RO + 2-10 cifre, ex. RO12345678',
      sellerTaxNumber: 'CUI/CIF: prefixul RO opțional + până la 10 cifre',
      buyerTaxNumber: 'CUI/CIF cumpărător: prefixul RO opțional + până la 10 cifre',
      sellerElectronicAddress: 'ID Participant Peppol (BT-34)',
      buyerElectronicAddress: 'ID Participant Peppol (BT-49)',
    },
  },
};

// ─── Helper utilities ────────────────────────────────────────────────────────

/** Returns true if the field is required for the given format */
export function isFieldRequired(
  format: OutputFormat,
  field: keyof Omit<FormatFieldConfig, 'hints'>
): boolean {
  return FORMAT_FIELD_CONFIG[format][field] === 'required';
}

/** Returns true if the field should be visible (required or optional) */
export function isFieldVisible(
  format: OutputFormat,
  field: keyof Omit<FormatFieldConfig, 'hints'>
): boolean {
  return FORMAT_FIELD_CONFIG[format][field] !== 'hidden';
}

/** Returns the hint text for a field in the given format, or undefined */
export function getFieldHint(
  format: OutputFormat,
  field: keyof FormatFieldConfig['hints']
): string | undefined {
  return FORMAT_FIELD_CONFIG[format].hints[field];
}

/**
 * Auto-detect the most appropriate output format from extraction data.
 * Used by the batch processor to suggest a format per invoice.
 * Falls back to 'xrechnung-cii' (safe default for EU).
 */
export function detectFormatFromData(data: {
  sellerCountryCode?: string | null;
  buyerCountryCode?: string | null;
  sellerElectronicAddress?: string | null;
}): OutputFormat {
  const sellerCC = (data.sellerCountryCode || '').toUpperCase().trim();
  const buyerCC = (data.buyerCountryCode || '').toUpperCase().trim();

  // Italian invoices → FatturaPA
  if (sellerCC === 'IT') return 'fatturapa';

  // Polish invoices → KSeF
  if (sellerCC === 'PL') return 'ksef';

  // Dutch invoices → NLCIUS
  if (sellerCC === 'NL') return 'nlcius';

  // Romanian invoices → CIUS-RO
  if (sellerCC === 'RO') return 'cius-ro';

  // French invoices → Factur-X EN16931
  if (sellerCC === 'FR' || buyerCC === 'FR') return 'facturx-en16931';

  // Has Peppol participant address → Peppol BIS
  if (
    data.sellerElectronicAddress?.includes(':') ||
    data.sellerElectronicAddress?.match(/^\d{4}:/)
  ) {
    return 'peppol-bis';
  }

  // German invoices (and all other EU) → XRechnung CII (safe default)
  return 'xrechnung-cii';
}
