/**
 * Codelist validation for EN 16931 invoice data.
 * Validates document type codes, currency codes, country codes,
 * tax category codes, payment means codes, and unit codes.
 */

import type { XRechnungInvoiceData } from '@/services/xrechnung/types';
import { createError, createWarning, type ValidationError } from './validation-result';

/** EN 16931 document type codes (BT-3) */
const VALID_DOCUMENT_TYPE_CODES = new Set([380, 381, 384, 389]);

/** ISO 4217 currency codes — common EU + major world currencies */
const VALID_CURRENCY_CODES = new Set([
  'EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF',
  'RON', 'BGN', 'HRK', 'ISK', 'TRY', 'RUB', 'UAH', 'JPY', 'CNY', 'AUD',
  'CAD', 'NZD', 'ZAR', 'BRL', 'MXN', 'INR', 'KRW', 'SGD', 'HKD', 'TWD',
  'THB', 'MYR', 'PHP', 'IDR', 'AED', 'SAR', 'ILS', 'EGP', 'ARS', 'CLP',
  'COP', 'PEN',
]);

/** ISO 3166-1 alpha-2 country codes */
const VALID_COUNTRY_CODES = new Set([
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
  'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
  'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
  'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
  'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
  'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
]);

/** UNCL5305 VAT category codes supported by EN 16931 */
const VALID_TAX_CATEGORY_CODES = new Set(['S', 'Z', 'E', 'AE', 'K', 'G', 'O', 'L']);

/** BR-DE-13: Allowed payment means codes for XRechnung (used by builder, exported for reference) */
export const VALID_PAYMENT_MEANS_CODES = new Set([10, 30, 48, 49, 57, 58, 59, 97]);

/** Common UNECE Recommendation 20 unit codes */
const VALID_UNIT_CODES = new Set([
  'C62', 'EA', 'HUR', 'DAY', 'MON', 'ANN', 'H87', 'KGM', 'MTR', 'LTR',
  'MTK', 'MTQ', 'TNE', 'KWH', 'MIN', 'SEC', 'SET', 'PR', 'BX', 'CT',
  'PK', 'LS', 'XPK', 'XBX', 'XCT', 'KMT', 'CMT', 'MMT', 'GRM', 'MLT',
  'CLT', 'DLT', 'HLT', 'PCE', 'NAR', 'NPR', 'XPA', 'XUN', 'XSA',
  'LM', 'WEE', 'MOQ', 'QAN',
]);

/**
 * Validate codelist values in invoice data.
 * Returns validation errors for invalid codelist entries.
 */
export function validateCodelists(data: XRechnungInvoiceData): ValidationError[] {
  const errors: ValidationError[] = [];

  // BT-3: Document type code
  const docType = data.documentTypeCode ?? 380;
  if (!VALID_DOCUMENT_TYPE_CODES.has(docType)) {
    errors.push(
      createError(
        'CL-BT-3',
        'invoice.documentTypeCode',
        `Invalid document type code: ${docType}. Allowed values: 380 (invoice), 381 (credit note), 384 (corrected invoice), 389 (self-billed invoice).`,
        { expected: '380, 381, 384, 389', actual: String(docType) }
      )
    );
  }

  // BT-5: Currency code
  const currency = data.currency?.trim().toUpperCase();
  if (currency && !VALID_CURRENCY_CODES.has(currency)) {
    errors.push(
      createWarning(
        'CL-BT-5',
        'invoice.currency',
        `Unrecognized currency code: ${currency}. Expected ISO 4217 code (e.g. EUR, USD, GBP).`,
        { actual: currency }
      )
    );
  }

  // BT-40: Seller country code
  const sellerCountry = data.sellerCountryCode?.trim().toUpperCase();
  if (sellerCountry && !VALID_COUNTRY_CODES.has(sellerCountry)) {
    errors.push(
      createError(
        'CL-BT-40',
        'invoice.seller.countryCode',
        `Invalid seller country code: ${sellerCountry}. Expected ISO 3166-1 alpha-2 code.`,
        { actual: sellerCountry }
      )
    );
  }

  // BT-55: Buyer country code
  const buyerCountry = data.buyerCountryCode?.trim().toUpperCase();
  if (buyerCountry && !VALID_COUNTRY_CODES.has(buyerCountry)) {
    errors.push(
      createError(
        'CL-BT-55',
        'invoice.buyer.countryCode',
        `Invalid buyer country code: ${buyerCountry}. Expected ISO 3166-1 alpha-2 code.`,
        { actual: buyerCountry }
      )
    );
  }

  // BT-151: Tax category codes on line items
  const items = data.lineItems || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.taxCategoryCode && !VALID_TAX_CATEGORY_CODES.has(item.taxCategoryCode)) {
      errors.push(
        createError(
          'CL-BT-151',
          `invoice.lineItems[${i}].taxCategoryCode`,
          `Invalid tax category code: ${item.taxCategoryCode}. Allowed: S, Z, E, AE, K, G, O, L.`,
          { expected: 'S, Z, E, AE, K, G, O, L', actual: item.taxCategoryCode }
        )
      );
    }

    // Unit codes
    if (item?.unitCode && !VALID_UNIT_CODES.has(item.unitCode)) {
      errors.push(
        createWarning(
          'CL-UNIT',
          `invoice.lineItems[${i}].unitCode`,
          `Unrecognized unit code: ${item.unitCode}. Common codes: C62 (unit), EA (each), HUR (hour), DAY (day), KGM (kg).`,
          { actual: item.unitCode }
        )
      );
    }
  }

  // Allowance/charge tax category codes
  const allowanceCharges = data.allowanceCharges || [];
  for (let i = 0; i < allowanceCharges.length; i++) {
    const ac = allowanceCharges[i];
    if (ac?.taxCategoryCode && !VALID_TAX_CATEGORY_CODES.has(ac.taxCategoryCode)) {
      errors.push(
        createError(
          'CL-BT-95',
          `invoice.allowanceCharges[${i}].taxCategoryCode`,
          `Invalid tax category code on allowance/charge: ${ac.taxCategoryCode}. Allowed: S, Z, E, AE, K, G, O, L.`,
          { expected: 'S, Z, E, AE, K, G, O, L', actual: ac.taxCategoryCode }
        )
      );
    }
  }

  return errors;
}
