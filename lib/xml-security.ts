/**
 * XML security utilities — defenses against XXE, DOCTYPE injection,
 * billion laughs, and namespace attacks.
 *
 * Intent: Provide pre-parse security checks for any XML input before
 * it reaches a parser. All e-invoice formats (CII, UBL, Factur-X, etc.)
 * use a known set of namespaces; anything outside that set is rejected.
 *
 * @module lib/xml-security
 */

import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum allowed XML input size in bytes (10 MB). */
const MAX_XML_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum number of entity-like references (&…;) allowed in a document. */
const MAX_ENTITY_REFERENCES = 500;

/**
 * Allowed namespace URIs for e-invoicing standards.
 * Any namespace not in this set triggers a rejection.
 */
export const ALLOWED_NAMESPACES: ReadonlySet<string> = new Set([
  // --- CII (Cross-Industry Invoice) ---
  'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',

  // --- UBL 2.1 ---
  'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',

  // --- CEN / EN 16931 ---
  'urn:cen.eu:en16931:2017',

  // --- XML Schema Instance ---
  'http://www.w3.org/2001/XMLSchema-instance',
  'http://www.w3.org/2001/XMLSchema',

  // --- FatturaPA (Italian) ---
  'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2',
  'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2.2',

  // --- KSeF (Polish) ---
  'http://crd.gov.pl/wzor/2023/06/29/12648/',

  // --- Factur-X / ZUGFeRD ---
  'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0',
]);

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Specific error for XML security violations. */
export class XmlSecurityError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'XmlSecurityError';
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options for {@link validateXmlSafety}. */
export interface XmlSafetyOptions {
  /** Override max size in bytes. Defaults to {@link MAX_XML_SIZE_BYTES}. */
  maxSizeBytes?: number;
  /** Override max entity reference count. Defaults to {@link MAX_ENTITY_REFERENCES}. */
  maxEntityReferences?: number;
  /** Skip namespace allowlist check (e.g. for internal trusted XML). */
  skipNamespaceCheck?: boolean;
}

/**
 * Result of {@link validateXmlSafety}.
 * When `safe` is false, `reason` explains why.
 */
export interface XmlSafetyResult {
  safe: boolean;
  reason?: string;
  code?: string;
}

/**
 * Sanitize raw XML string by stripping DOCTYPE declarations and
 * rejecting content that contains external entity references.
 *
 * This is a **destructive** operation — the returned string has all
 * `<!DOCTYPE …>` blocks removed. Use it when you need to feed
 * untrusted XML into a parser that does not support disabling DTDs.
 *
 * @param xml - Raw XML string
 * @returns Sanitized XML with DOCTYPE removed
 * @throws {XmlSecurityError} If external entity patterns are detected
 */
export function sanitizeXml(xml: string): string {
  if (!xml) return '';

  // Reject SYSTEM / PUBLIC entity declarations (XXE markers)
  if (hasExternalEntityPattern(xml)) {
    logger.warn('xml-security: External entity pattern detected — rejecting XML');
    throw new XmlSecurityError(
      'XML contains external entity references (potential XXE attack)',
      'XXE_DETECTED'
    );
  }

  // Strip DOCTYPE declarations (including internal subsets)
  const sanitized = stripDoctype(xml);

  return sanitized;
}

/**
 * Run pre-parse security checks on an XML string **without modifying it**.
 *
 * Checks performed (in order):
 * 1. Size limit
 * 2. DOCTYPE / DTD presence
 * 3. External entity patterns (SYSTEM, PUBLIC)
 * 4. Entity reference count (billion laughs heuristic)
 * 5. Namespace allowlist
 *
 * @param xml - Raw XML string
 * @param options - Optional overrides
 * @returns Safety result
 */
export function validateXmlSafety(
  xml: string,
  options: XmlSafetyOptions = {}
): XmlSafetyResult {
  const maxSize = options.maxSizeBytes ?? MAX_XML_SIZE_BYTES;
  const maxEntities = options.maxEntityReferences ?? MAX_ENTITY_REFERENCES;

  // 1. Size limit
  const byteLength = Buffer.byteLength(xml, 'utf8');
  if (byteLength > maxSize) {
    return {
      safe: false,
      reason: `XML size ${byteLength} bytes exceeds limit of ${maxSize} bytes`,
      code: 'XML_TOO_LARGE',
    };
  }

  // 2. DOCTYPE / DTD presence
  if (hasDoctypeDeclaration(xml)) {
    return {
      safe: false,
      reason: 'XML contains a DOCTYPE declaration — DTDs are not allowed',
      code: 'DOCTYPE_REJECTED',
    };
  }

  // 3. External entity patterns
  if (hasExternalEntityPattern(xml)) {
    return {
      safe: false,
      reason: 'XML contains external entity references (SYSTEM/PUBLIC)',
      code: 'XXE_DETECTED',
    };
  }

  // 4. Entity expansion count (billion laughs heuristic)
  const entityCount = countEntityReferences(xml);
  if (entityCount > maxEntities) {
    return {
      safe: false,
      reason: `XML contains ${entityCount} entity references (limit: ${maxEntities}) — possible billion laughs attack`,
      code: 'ENTITY_EXPANSION_LIMIT',
    };
  }

  // 5. Namespace allowlist
  if (!options.skipNamespaceCheck) {
    const unknownNs = findUnknownNamespaces(xml);
    if (unknownNs.length > 0) {
      return {
        safe: false,
        reason: `XML contains unknown namespace(s): ${unknownNs.join(', ')}`,
        code: 'UNKNOWN_NAMESPACE',
      };
    }
  }

  return { safe: true };
}

/**
 * Safe XML parsing wrapper. Validates security constraints, sanitizes,
 * then returns the cleaned XML string ready for a parser.
 *
 * This does NOT invoke a DOM parser (the project has no XML parsing library).
 * It returns the sanitized string that can be safely passed to any parser
 * configured with external entities disabled.
 *
 * @param xml - Raw untrusted XML input
 * @param options - Optional safety overrides
 * @returns Sanitized XML string
 * @throws {XmlSecurityError} If any security check fails
 */
export function parseXmlSafe(
  xml: string,
  options: XmlSafetyOptions = {}
): string {
  if (!xml || xml.trim().length === 0) {
    throw new XmlSecurityError('XML input is empty', 'EMPTY_XML');
  }

  const safetyResult = validateXmlSafety(xml, options);
  if (!safetyResult.safe) {
    logger.warn('xml-security: parseXmlSafe rejected XML', {
      code: safetyResult.code,
      reason: safetyResult.reason,
    });
    throw new XmlSecurityError(
      safetyResult.reason ?? 'XML failed security validation',
      safetyResult.code ?? 'SECURITY_CHECK_FAILED'
    );
  }

  // Return sanitized version (strips any residual DOCTYPE if present)
  return sanitizeXml(xml);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Check whether the XML contains a DOCTYPE declaration.
 * Uses a case-insensitive check to catch `<!doctype`, `<!DOCTYPE`, etc.
 */
function hasDoctypeDeclaration(xml: string): boolean {
  // Match <!DOCTYPE with optional whitespace variations
  return /<!DOCTYPE\s/i.test(xml);
}

/**
 * Check for external entity patterns: SYSTEM or PUBLIC keywords
 * inside entity declarations or DOCTYPE.
 */
function hasExternalEntityPattern(xml: string): boolean {
  // SYSTEM or PUBLIC inside a declaration context
  return /<!ENTITY[^>]*\bSYSTEM\b/i.test(xml)
    || /<!ENTITY[^>]*\bPUBLIC\b/i.test(xml)
    || /<!DOCTYPE[^>]*\bSYSTEM\b/i.test(xml)
    || /<!DOCTYPE[^>]*\bPUBLIC\b/i.test(xml);
}

/**
 * Count entity references (&name;) in the XML.
 * Built-in XML entities (&amp; &lt; &gt; &quot; &apos;) and
 * numeric character references (&#…;) are excluded.
 */
function countEntityReferences(xml: string): number {
  // Match &name; but exclude built-in and numeric refs
  const matches = xml.match(/&(?!amp;|lt;|gt;|quot;|apos;|#)[a-zA-Z_][\w.-]{0,100};/g);
  return matches?.length ?? 0;
}

/**
 * Strip all DOCTYPE declarations from XML, including internal subsets.
 * Handles `<!DOCTYPE … [ … ]>` and simple `<!DOCTYPE …>`.
 */
function stripDoctype(xml: string): string {
  // DOCTYPE with internal subset: <!DOCTYPE name [ ... ]>
  let result = xml.replace(/<!DOCTYPE\s[^[>]*\[[^\]]*\]>/gi, '');
  // Simple DOCTYPE: <!DOCTYPE name SYSTEM "..." >
  result = result.replace(/<!DOCTYPE\s[^>]*>/gi, '');
  return result;
}

/**
 * Extract namespace URIs from xmlns declarations and check against allowlist.
 * Returns array of unknown namespace URIs.
 */
function findUnknownNamespaces(xml: string): string[] {
  const nsPattern = /xmlns(?::[a-zA-Z][\w-]{0,50})?="([^"]{1,500})"/g;
  const unknown: string[] = [];
  let match: RegExpExecArray | null = nsPattern.exec(xml);

  while (match) {
    const uri = match[1];
    if (uri && !ALLOWED_NAMESPACES.has(uri)) {
      unknown.push(uri);
    }
    match = nsPattern.exec(xml);
  }

  return [...new Set(unknown)];
}
