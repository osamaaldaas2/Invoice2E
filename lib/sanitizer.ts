/**
 * XSS Protection Utilities
 * Provides sanitization functions for user-generated content
 */

import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Create a JSDOM window for server-side DOMPurify
const window = new JSDOM('').window;

const purify = DOMPurify(window as any);

/**
 * Sanitize HTML content to prevent XSS attacks
 * Removes dangerous tags and attributes while preserving safe HTML
 */
export function sanitizeHtml(dirty: string): string {
  return purify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'span'],
    ALLOWED_ATTR: ['class'],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitize text content - strips all HTML
 * Use for user inputs that should not contain any HTML
 */
export function sanitizeText(dirty: string): string {
  return purify
    .sanitize(dirty, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    })
    .trim();
}

/**
 * Sanitize a value for safe display
 * Returns empty string for null/undefined, sanitizes strings
 */
export function sanitizeForDisplay(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return sanitizeText(value);
  }

  return String(value);
}

/**
 * Sanitize object values recursively
 * Useful for sanitizing form data or API responses
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = sanitizeText(value);
    } else if (Array.isArray(value)) {
      result[key] = sanitizeArray(value);
    } else if (value !== null && typeof value === 'object') {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Sanitize array values recursively
 */
export function sanitizeArray(arr: unknown[]): unknown[] {
  return arr.map((item) => {
    if (typeof item === 'string') {
      return sanitizeText(item);
    } else if (Array.isArray(item)) {
      return sanitizeArray(item);
    } else if (item !== null && typeof item === 'object') {
      return sanitizeObject(item as Record<string, unknown>);
    }
    return item;
  });
}
