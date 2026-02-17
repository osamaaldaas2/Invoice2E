/**
 * PEPPOL BIS Billing 3.0 profile-specific validation rules.
 * Implements PEPPOL-EN16931 rules on top of EN 16931 base rules.
 *
 * Code list aligned with Peppol BIS Billing 3.0 v3.0.20 (2024-10-09).
 * EAS codes sourced from the CEF EAS code list (mandatory from 2026-02-23).
 */

import type { CanonicalInvoice } from '@/types/canonical-invoice';
import { createError, type ValidationError } from './validation-result';

/**
 * Valid PEPPOL EndpointID scheme identifiers (CEF EAS code list).
 * Updated to reflect additions in Peppol BIS 3.0 v3.0.20.
 * Codes 0217-0221 were added in the 2023-2024 cycle.
 */
const VALID_ENDPOINT_SCHEME_IDS = new Set([
  '0002',
  '0007',
  '0009',
  '0010',
  '0011',
  '0012',
  '0013',
  '0014',
  '0015',
  '0016',
  '0017',
  '0018',
  '0019',
  '0020',
  '0021',
  '0022',
  '0023',
  '0024',
  '0025',
  '0026',
  '0027',
  '0028',
  '0029',
  '0030',
  '0031',
  '0032',
  '0033',
  '0034',
  '0035',
  '0036',
  '0037',
  '0038',
  '0039',
  '0040',
  '0041',
  '0042',
  '0043',
  '0044',
  '0045',
  '0046',
  '0047',
  '0048',
  '0049',
  '0050',
  '0051',
  '0052',
  '0053',
  '0054',
  '0055',
  '0056',
  '0057',
  '0058',
  '0059',
  '0060',
  '0088',
  '0096',
  '0097',
  '0106',
  '0130',
  '0135',
  '0142',
  '0147',
  '0151',
  '0170',
  '0183',
  '0184',
  '0188',
  '0190',
  '0191',
  '0192',
  '0193',
  '0194',
  '0195',
  '0196',
  '0198',
  '0199',
  '0200',
  '0201',
  '0202',
  '0203',
  '0204',
  '0208',
  '0209',
  '0210',
  '0211',
  '0212',
  '0213',
  '0215',
  '0216',
  // Added in 2023-2024 (Peppol BIS 3.0 v3.0.18+)
  '0217',
  '0218',
  '0219',
  '0220',
  '0221',
  '9901',
  '9910',
  '9913',
  '9914',
  '9915',
  '9918',
  '9919',
  '9920',
  '9922',
  '9923',
  '9924',
  '9925',
  '9926',
  '9927',
  '9928',
  '9929',
  '9930',
  '9931',
  '9932',
  '9933',
  '9934',
  '9935',
  '9936',
  '9937',
  '9938',
  '9939',
  '9940',
  '9941',
  '9942',
  '9943',
  '9944',
  '9945',
  '9946',
  '9947',
  '9948',
  '9949',
  '9950',
  '9951',
  '9952',
  '9953',
  '9954',
  '9955',
  '9956',
  '9957',
  '9958',
]);

/** PEPPOL allowed tax category codes */
const PEPPOL_TAX_CATEGORIES = new Set(['S', 'Z', 'E', 'AE', 'K', 'G', 'O', 'L', 'M']);

/** PEPPOL UNCL4461 payment means code subset */
const PEPPOL_PAYMENT_MEANS_CODES = new Set([
  '1',
  '2',
  '3',
  '4',
  '5',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '39',
  '40',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
  '49',
  '50',
  '51',
  '52',
  '53',
  '54',
  '55',
  '56',
  '57',
  '58',
  '59',
  '60',
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '67',
  '68',
  '69',
  '70',
  '74',
  '75',
  '76',
  '77',
  '78',
  '91',
  '92',
  '93',
  '94',
  '95',
  '96',
  '97',
  'ZZZ',
]);

/** ISO 3166-1 alpha-2 country code pattern */
const ISO_COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

/**
 * Run all PEPPOL BIS 3.0 specific validation rules.
 */
export function validatePeppolRules(data: CanonicalInvoice): ValidationError[] {
  const errors: ValidationError[] = [];

  // PEPPOL-EN16931-R010: Buyer electronic address (BT-49 EndpointID) is required
  if (!data.buyer?.electronicAddress?.trim()) {
    errors.push(
      createError(
        'PEPPOL-EN16931-R010',
        'invoice.buyer.electronicAddress',
        'Buyer electronic address (BT-49 EndpointID) is required for PEPPOL',
        { suggestion: 'Provide buyer electronic address (e.g. PEPPOL participant ID)' }
      )
    );
  } else if (
    data.buyer?.electronicAddressScheme &&
    !VALID_ENDPOINT_SCHEME_IDS.has(data.buyer.electronicAddressScheme)
  ) {
    errors.push(
      createError(
        'PEPPOL-EN16931-R010-SCHEME',
        'invoice.buyer.electronicAddressScheme',
        `Buyer endpoint scheme ID "${data.buyer.electronicAddressScheme}" is not a valid EAS code`,
        { suggestion: 'Use a valid EAS scheme identifier (e.g. "0088" for EAN, "0184" for PEPPOL)' }
      )
    );
  }

  // PEPPOL-EN16931-R020: Seller electronic address (BT-34 EndpointID) is required
  if (!data.seller?.electronicAddress?.trim()) {
    errors.push(
      createError(
        'PEPPOL-EN16931-R020',
        'invoice.seller.electronicAddress',
        'Seller electronic address (BT-34 EndpointID) is required for PEPPOL',
        { suggestion: 'Provide seller electronic address (e.g. PEPPOL participant ID)' }
      )
    );
  } else if (
    data.seller?.electronicAddressScheme &&
    !VALID_ENDPOINT_SCHEME_IDS.has(data.seller.electronicAddressScheme)
  ) {
    errors.push(
      createError(
        'PEPPOL-EN16931-R020-SCHEME',
        'invoice.seller.electronicAddressScheme',
        `Seller endpoint scheme ID "${data.seller.electronicAddressScheme}" is not a valid EAS code`,
        { suggestion: 'Use a valid EAS scheme identifier (e.g. "0088" for EAN, "0184" for PEPPOL)' }
      )
    );
  }

  // PEPPOL tax category validation on line items
  const items = data.lineItems || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const taxCat = item.taxCategoryCode?.trim();
    if (taxCat && !PEPPOL_TAX_CATEGORIES.has(taxCat)) {
      errors.push(
        createError(
          'PEPPOL-EN16931-CL001',
          `invoice.lineItems[${i}].taxCategoryCode`,
          `Tax category code "${taxCat}" is not in the PEPPOL allowed set (${[...PEPPOL_TAX_CATEGORIES].join(', ')})`,
          { actual: taxCat }
        )
      );
    }
  }

  // PEPPOL payment means code validation
  // Payment means code is not in PaymentInfo; skip for now
  // (payment means type code is set during XML generation, not in canonical model)
  const paymentMeansCode: string | undefined = undefined;
  if (paymentMeansCode && !PEPPOL_PAYMENT_MEANS_CODES.has(paymentMeansCode)) {
    errors.push(
      createError(
        'PEPPOL-EN16931-CL002',
        'invoice.payment.meansCode',
        `Payment means code "${paymentMeansCode}" is not in the PEPPOL UNCL4461 subset`,
        { actual: paymentMeansCode }
      )
    );
  }

  // Country code validation (ISO 3166-1 alpha-2)
  const countryChecks: Array<{ value?: string; field: string; label: string }> = [
    {
      value: data.seller?.countryCode ?? undefined,
      field: 'invoice.seller.countryCode',
      label: 'Seller',
    },
    {
      value: data.buyer?.countryCode ?? undefined,
      field: 'invoice.buyer.countryCode',
      label: 'Buyer',
    },
  ];

  for (const check of countryChecks) {
    const code = check.value?.trim();
    if (code && !ISO_COUNTRY_CODE_PATTERN.test(code)) {
      errors.push(
        createError(
          'PEPPOL-EN16931-CL005',
          check.field,
          `${check.label} country code "${code}" is not a valid ISO 3166-1 alpha-2 code`,
          {
            actual: code,
            suggestion: 'Use a 2-letter uppercase country code (e.g. "DE", "SE", "NO")',
          }
        )
      );
    }
  }

  // Seller tax identifier is required
  const hasSellerVatId = !!data.seller?.vatId?.trim();
  const hasSellerTaxNumber = !!data.seller?.taxNumber?.trim();
  const hasSellerTaxId = !!data.seller?.taxId?.trim();
  if (!hasSellerVatId && !hasSellerTaxNumber && !hasSellerTaxId) {
    errors.push(
      createError(
        'PEPPOL-EN16931-R004',
        'invoice.seller.taxIdentifier',
        'At least one seller tax identifier is required (BT-31, BT-32, or BT-63)',
        { suggestion: 'Provide seller VAT ID or tax registration number' }
      )
    );
  }

  // BR-AE-01: Reverse charge — seller and buyer VAT IDs required
  const hasAELine = items.some((item) => item.taxCategoryCode?.trim() === 'AE');
  if (hasAELine) {
    if (!data.seller?.vatId?.trim()) {
      errors.push(
        createError(
          'BR-AE-01',
          'invoice.seller.vatId',
          'Reverse charge (AE): Seller VAT ID (BT-31) is required when tax category AE is used',
          { suggestion: 'Provide seller VAT ID for reverse charge invoices' }
        )
      );
    }
    if (!data.buyer?.vatId?.trim()) {
      errors.push(
        createError(
          'BR-AE-01',
          'invoice.buyer.vatId',
          'Reverse charge (AE): Buyer VAT ID (BT-48) is required when tax category AE is used',
          { suggestion: 'Provide buyer VAT ID for reverse charge invoices' }
        )
      );
    }
  }

  // BR-E-01: Exempt lines must have 0% tax rate
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.taxCategoryCode?.trim() === 'E' && item.taxRate != null && item.taxRate !== 0) {
      errors.push(
        createError(
          'BR-E-01',
          `invoice.lineItems[${i}].taxRate`,
          `Exempt (E) line item ${i + 1}: tax rate must be 0%, got ${item.taxRate}%`,
          { actual: String(item.taxRate), suggestion: 'Set tax rate to 0 for exempt items' }
        )
      );
    }
  }

  // Credit note must have preceding invoice reference
  const docType = data.documentTypeCode ?? 380;
  if (docType === 381 && !data.precedingInvoiceReference?.trim()) {
    errors.push(
      createError(
        'PEPPOL-EN16931-R006',
        'invoice.precedingInvoiceReference',
        'Credit notes (TypeCode 381) must include a preceding invoice reference (BT-25)',
        { suggestion: 'Provide the original invoice number this credit note relates to' }
      )
    );
  }

  return errors;
}
