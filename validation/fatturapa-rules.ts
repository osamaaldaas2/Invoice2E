/**
 * FatturaPA (Italian e-invoicing) validation rules.
 * FatturaPA is NOT EN16931 — it follows the Italian SDI specification.
 */

import type { CanonicalInvoice } from '@/types/canonical-invoice';
import { createError, createWarning, type ValidationError } from './validation-result';

/** Map canonical document type codes to FatturaPA TipoDocumento */
const DOC_TYPE_MAP: Record<number, string> = {
  380: 'TD01', // Invoice
  381: 'TD04', // Credit note
  384: 'TD05', // Corrected invoice (debit note)
  389: 'TD01', // Self-billed → treat as TD01
};

/** CodiceDestinatario pattern: exactly 7 alphanumeric characters */
const CODICE_DESTINATARIO_PATTERN = /^[A-Z0-9]{7}$/;

/** ISO 4217 currency code pattern */
const ISO_4217_PATTERN = /^[A-Z]{3}$/;

/**
 * Run FatturaPA-specific validation rules.
 */
export function validateFatturapaRules(data: CanonicalInvoice): ValidationError[] {
  const errors: ValidationError[] = [];

  // FPA-001: Invoice number required
  if (!data.invoiceNumber?.trim()) {
    errors.push(
      createError(
        'FPA-001',
        'invoice.invoiceNumber',
        'Invoice number (Numero) is required for FatturaPA'
      )
    );
  }

  // FPA-002: Invoice date required
  if (!data.invoiceDate?.trim()) {
    errors.push(
      createError(
        'FPA-002',
        'invoice.invoiceDate',
        'Invoice date (Data) is required for FatturaPA'
      )
    );
  }

  // FPA-003: Currency code required (Divisa)
  const currency = data.currency?.trim();
  if (!currency) {
    errors.push(
      createError(
        'FPA-003',
        'invoice.currency',
        'Currency code (Divisa) is required for FatturaPA'
      )
    );
  } else if (!ISO_4217_PATTERN.test(currency.toUpperCase())) {
    errors.push(
      createError(
        'FPA-003a',
        'invoice.currency',
        `Currency "${currency}" is not a valid ISO 4217 code`,
        { actual: currency }
      )
    );
  }

  // FPA-004: Document type must map to valid TipoDocumento
  const docType = data.documentTypeCode ?? 380;
  const tipoDoc = DOC_TYPE_MAP[docType];
  if (!tipoDoc) {
    errors.push(
      createError(
        'FPA-004',
        'invoice.documentTypeCode',
        `Document type code ${docType} cannot be mapped to a valid FatturaPA TipoDocumento`,
        { actual: String(docType), suggestion: 'Use 380 (invoice) or 381 (credit note)' }
      )
    );
  }

  // FPA-010: Seller VAT ID required (IdFiscaleIVA = IdPaese + IdCodice)
  const sellerVatId = data.seller?.vatId?.trim();
  if (!sellerVatId) {
    errors.push(
      createError(
        'FPA-010',
        'invoice.seller.vatId',
        'Seller VAT ID (IdFiscaleIVA) is required for FatturaPA',
        { suggestion: 'Provide VAT ID with country prefix (e.g. "IT01234567890")' }
      )
    );
  } else if (sellerVatId.length < 4) {
    errors.push(
      createError(
        'FPA-010a',
        'invoice.seller.vatId',
        `Seller VAT ID "${sellerVatId}" is too short — must contain country code + VAT number`,
        { actual: sellerVatId }
      )
    );
  }

  // FPA-011: Seller address required
  if (!data.seller?.address?.trim()) {
    errors.push(
      createError(
        'FPA-011',
        'invoice.seller.address',
        'Seller street address (Indirizzo) is required for FatturaPA'
      )
    );
  }
  if (!data.seller?.city?.trim()) {
    errors.push(
      createError(
        'FPA-012',
        'invoice.seller.city',
        'Seller city (Comune) is required for FatturaPA'
      )
    );
  }
  if (!data.seller?.postalCode?.trim()) {
    errors.push(
      createError(
        'FPA-013',
        'invoice.seller.postalCode',
        'Seller postal code (CAP) is required for FatturaPA'
      )
    );
  }
  if (!data.seller?.countryCode?.trim()) {
    errors.push(
      createError(
        'FPA-014',
        'invoice.seller.countryCode',
        'Seller country code (Nazione) is required for FatturaPA'
      )
    );
  }

  // FPA-020: Buyer identification required (VAT ID or fiscal code/taxNumber)
  const buyerVatId = data.buyer?.vatId?.trim();
  const buyerTaxNumber = data.buyer?.taxNumber?.trim();
  const buyerTaxId = data.buyer?.taxId?.trim();
  if (!buyerVatId && !buyerTaxNumber && !buyerTaxId) {
    errors.push(
      createError(
        'FPA-020',
        'invoice.buyer.identification',
        'Buyer identification is required for FatturaPA (VAT ID or fiscal code)',
        { suggestion: 'Provide buyer VAT ID (IdFiscaleIVA) or fiscal code (CodiceFiscale)' }
      )
    );
  }

  // FPA-021: CodiceDestinatario — check buyer electronicAddress
  const codiceDestinatario = data.buyer?.electronicAddress?.trim();
  if (codiceDestinatario && codiceDestinatario !== '0000000') {
    if (!CODICE_DESTINATARIO_PATTERN.test(codiceDestinatario)) {
      errors.push(
        createWarning(
          'FPA-021',
          'invoice.buyer.electronicAddress',
          `CodiceDestinatario "${codiceDestinatario}" should be exactly 7 alphanumeric characters`,
          { actual: codiceDestinatario, suggestion: 'Use 7-character SDI code or "0000000" for PEC delivery' }
        )
      );
    }
  }

  // FPA-030: At least one line item required
  const items = data.lineItems || [];
  if (items.length === 0) {
    errors.push(
      createError(
        'FPA-030',
        'invoice.lineItems',
        'At least one line item (DettaglioLinee) is required for FatturaPA'
      )
    );
  }

  // FPA-031–033: Line item validation
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;

    if (!item.description?.trim()) {
      errors.push(
        createError(
          'FPA-031',
          `invoice.lineItems[${i}].description`,
          `Line item ${i + 1}: description (Descrizione) is required`
        )
      );
    }

    if (item.quantity == null || item.quantity <= 0) {
      errors.push(
        createError(
          'FPA-032',
          `invoice.lineItems[${i}].quantity`,
          `Line item ${i + 1}: quantity (Quantita) must be a positive number`
        )
      );
    }

    if (item.unitPrice == null) {
      errors.push(
        createError(
          'FPA-033',
          `invoice.lineItems[${i}].unitPrice`,
          `Line item ${i + 1}: unit price (PrezzoUnitario) is required`
        )
      );
    }

    if (item.taxRate == null) {
      errors.push(
        createError(
          'FPA-034',
          `invoice.lineItems[${i}].taxRate`,
          `Line item ${i + 1}: tax rate (AliquotaIVA) is required`
        )
      );
    }

    // FPA-035: Reverse charge (AE) lines must have 0% tax rate
    if (item.taxCategoryCode?.trim() === 'AE' && item.taxRate != null && item.taxRate !== 0) {
      errors.push(
        createError(
          'FPA-035',
          `invoice.lineItems[${i}].taxRate`,
          `Line item ${i + 1}: reverse charge (AE) tax rate must be 0%, got ${item.taxRate}%`,
          { actual: String(item.taxRate), suggestion: 'Set tax rate to 0 for reverse charge items' }
        )
      );
    }
  }

  // FPA-035: Natura code — 0% VAT lines should have taxCategoryCode set
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.taxRate === 0 && !item.taxCategoryCode) {
      errors.push(
        createWarning(
          'FPA-035',
          `invoice.lineItems[${i}].taxCategoryCode`,
          `Line item ${i + 1}: 0% VAT rate requires a tax category code to determine Natura (e.g. E, Z, AE, K, G, O)`,
          { suggestion: 'Set taxCategoryCode to map to the correct FatturaPA Natura code' }
        )
      );
    }
  }

  // FPA-036: RegimeFiscale validation (RF01–RF19)
  const taxRegime = data.seller?.taxRegime?.trim();
  if (taxRegime && !/^RF(0[1-9]|1[0-9])$/.test(taxRegime)) {
    errors.push(
      createError(
        'FPA-036',
        'invoice.seller.taxRegime',
        `RegimeFiscale "${taxRegime}" is not valid — must be RF01 through RF19`,
        { actual: taxRegime, suggestion: 'Use RF01 (ordinario) unless a special regime applies' }
      )
    );
  }

  return errors;
}
