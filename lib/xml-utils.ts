/**
 * Shared XML utilities for all format generators.
 * Extracted from UBLService and XRechnungBuilder to avoid duplication.
 * 
 * @module lib/xml-utils
 */

import { roundMoney } from '@/lib/monetary';
import { logger } from '@/lib/logger';

// Re-export XML security utilities for consumers that import from xml-utils
export { sanitizeXml, validateXmlSafety, parseXmlSafe, ALLOWED_NAMESPACES } from '@/lib/xml-security';
export type { XmlSafetyOptions, XmlSafetyResult } from '@/lib/xml-security';
export { XmlSecurityError } from '@/lib/xml-security';

/**
 * Escape XML special characters and strip invalid control characters.
 */
export function escapeXml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/**
 * Format date to ISO YYYY-MM-DD (used by UBL).
 * Supports: YYYY-MM-DD, DD.MM.YYYY (German), YYYYMMDD.
 * Rejects ambiguous slash formats.
 */
export function formatDateISO(date: string): string {
  if (!date) return '';

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
    return date.substring(0, 10);
  }

  // German DD.MM.YYYY
  const germanMatch = date.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanMatch) {
    const [, day, month, year] = germanMatch;
    if (day && month && year) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // YYYYMMDD
  if (/^\d{8}$/.test(date)) {
    return `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
  }

  // Reject ambiguous slash formats
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
    logger.warn('xml-utils: Ambiguous date format rejected', { date });
    throw new Error(`Ambiguous date format "${date}". Use ISO (YYYY-MM-DD) or German (DD.MM.YYYY)`);
  }

  const d = new Date(date);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0] || '';
  }

  logger.warn('xml-utils: Could not parse date', { date });
  throw new Error(`Invalid date format "${date}". Use ISO (YYYY-MM-DD) or German (DD.MM.YYYY)`);
}

/**
 * Format date to YYYYMMDD (CII format 102).
 * Supports: YYYY-MM-DD, DD.MM.YYYY (German), YYYYMMDD.
 * Rejects ambiguous slash formats.
 */
export function formatDateCII(dateString: string): string {
  if (!dateString) return '';

  // Already YYYYMMDD
  if (/^\d{8}$/.test(dateString)) {
    return dateString;
  }

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
    return dateString.substring(0, 10).replace(/-/g, '');
  }

  // German DD.MM.YYYY
  const germanMatch = dateString.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (germanMatch) {
    const [, day, month, year] = germanMatch;
    if (day && month && year) {
      return `${year}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
    }
  }

  // Reject ambiguous slash formats
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateString)) {
    logger.warn('xml-utils: Ambiguous date format rejected', { date: dateString });
    throw new Error(`Ambiguous date format "${dateString}". Use ISO (YYYY-MM-DD) or German (DD.MM.YYYY)`);
  }

  // Last resort: parse as Date
  try {
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}${month}${day}`;
    }
  } catch {
    // Fall through
  }

  logger.warn('xml-utils: Could not parse date', { date: dateString });
  throw new Error(`Invalid date format "${dateString}". Use ISO (YYYY-MM-DD) or German (DD.MM.YYYY)`);
}

/**
 * Format a monetary amount to 2 decimal places using banker's rounding.
 */
export function formatAmount(amount: number): string {
  return roundMoney(amount).toFixed(2);
}
