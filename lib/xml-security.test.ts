/**
 * Tests for XML security utilities.
 * Covers: XXE, DOCTYPE injection, billion laughs, oversized XML, namespace attacks.
 *
 * @module lib/xml-security.test
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeXml,
  validateXmlSafety,
  parseXmlSafe,
  XmlSecurityError,
  ALLOWED_NAMESPACES,
} from './xml-security';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid CII XML for testing. */
const VALID_CII_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
                          xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
                          xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument>
    <ram:ID>INV-001</ram:ID>
  </rsm:ExchangedDocument>
</rsm:CrossIndustryInvoice>`;

/** Minimal valid UBL XML for testing. */
const VALID_UBL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-001</cbc:ID>
</Invoice>`;

// ---------------------------------------------------------------------------
// sanitizeXml
// ---------------------------------------------------------------------------

describe('sanitizeXml', () => {
  it('should return empty string for empty input', () => {
    expect(sanitizeXml('')).toBe('');
  });

  it('should pass through clean XML unchanged', () => {
    const xml = '<root><child>text</child></root>';
    expect(sanitizeXml(xml)).toBe(xml);
  });

  it('should strip simple DOCTYPE declarations', () => {
    const xml = '<?xml version="1.0"?><!DOCTYPE root SYSTEM "test.dtd"><root/>';
    // This contains SYSTEM in DOCTYPE → should throw XXE
    expect(() => sanitizeXml(xml)).toThrow(XmlSecurityError);
  });

  it('should strip DOCTYPE with internal subset', () => {
    const xml = `<?xml version="1.0"?>
<!DOCTYPE root [
  <!ELEMENT root (#PCDATA)>
]>
<root>data</root>`;
    const result = sanitizeXml(xml);
    expect(result).not.toContain('DOCTYPE');
    expect(result).toContain('<root>data</root>');
  });

  it('should throw on SYSTEM entity (XXE)', () => {
    const xxeXml = `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>&xxe;</root>`;
    expect(() => sanitizeXml(xxeXml)).toThrow(XmlSecurityError);
    expect(() => sanitizeXml(xxeXml)).toThrow('external entity');
  });

  it('should throw on PUBLIC entity (XXE)', () => {
    const xxeXml = `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe PUBLIC "-//W3C//TEXT copyright//EN" "http://evil.com/steal">
]>
<root>&xxe;</root>`;
    expect(() => sanitizeXml(xxeXml)).toThrow(XmlSecurityError);
  });
});

// ---------------------------------------------------------------------------
// validateXmlSafety
// ---------------------------------------------------------------------------

describe('validateXmlSafety', () => {
  it('should pass valid CII XML', () => {
    const result = validateXmlSafety(VALID_CII_XML);
    expect(result.safe).toBe(true);
  });

  it('should pass valid UBL XML', () => {
    const result = validateXmlSafety(VALID_UBL_XML);
    expect(result.safe).toBe(true);
  });

  it('should reject DOCTYPE declarations', () => {
    const xml = '<!DOCTYPE root><root/>';
    const result = validateXmlSafety(xml);
    expect(result.safe).toBe(false);
    expect(result.code).toBe('DOCTYPE_REJECTED');
  });

  it('should reject XXE with SYSTEM entity in DOCTYPE', () => {
    const xml = `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root/>`;
    const result = validateXmlSafety(xml);
    // Should hit DOCTYPE first
    expect(result.safe).toBe(false);
  });

  it('should reject oversized XML', () => {
    const result = validateXmlSafety('x'.repeat(100), { maxSizeBytes: 50 });
    expect(result.safe).toBe(false);
    expect(result.code).toBe('XML_TOO_LARGE');
  });

  it('should reject billion laughs pattern (many entity references)', () => {
    // Simulate many custom entity references
    const entities = Array.from({ length: 600 }, (_, i) => `&entity${i};`).join('');
    const xml = `<root>${entities}</root>`;
    const result = validateXmlSafety(xml, { skipNamespaceCheck: true });
    expect(result.safe).toBe(false);
    expect(result.code).toBe('ENTITY_EXPANSION_LIMIT');
  });

  it('should not count built-in entity references', () => {
    // &amp; &lt; &gt; &quot; &apos; should not be counted
    const xml = `<root xmlns="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100">${'&amp; &lt; &gt; &quot; &apos; '.repeat(200)}</root>`;
    const result = validateXmlSafety(xml);
    expect(result.safe).toBe(true);
  });

  it('should reject unknown namespaces', () => {
    const xml = `<root xmlns="http://evil.com/malicious-namespace"><child/></root>`;
    const result = validateXmlSafety(xml);
    expect(result.safe).toBe(false);
    expect(result.code).toBe('UNKNOWN_NAMESPACE');
    expect(result.reason).toContain('evil.com');
  });

  it('should skip namespace check when option set', () => {
    const xml = `<root xmlns="http://custom.example.com/ns"><child/></root>`;
    const result = validateXmlSafety(xml, { skipNamespaceCheck: true });
    expect(result.safe).toBe(true);
  });

  it('should accept XML with only allowed namespaces', () => {
    const result = validateXmlSafety(VALID_CII_XML);
    expect(result.safe).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseXmlSafe
// ---------------------------------------------------------------------------

describe('parseXmlSafe', () => {
  it('should return sanitized XML for valid input', () => {
    const result = parseXmlSafe(VALID_CII_XML);
    expect(result).toContain('CrossIndustryInvoice');
    expect(result).not.toContain('DOCTYPE');
  });

  it('should throw on empty input', () => {
    expect(() => parseXmlSafe('')).toThrow(XmlSecurityError);
    expect(() => parseXmlSafe('')).toThrow('empty');
  });

  it('should throw on whitespace-only input', () => {
    expect(() => parseXmlSafe('   \n  ')).toThrow(XmlSecurityError);
  });

  it('should throw on XXE attack', () => {
    const xxeXml = `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>&xxe;</root>`;
    expect(() => parseXmlSafe(xxeXml)).toThrow(XmlSecurityError);
  });

  it('should throw on billion laughs (excessive entities)', () => {
    const entities = Array.from({ length: 600 }, (_, i) => `&e${i};`).join('');
    const xml = `<root>${entities}</root>`;
    expect(() => parseXmlSafe(xml, { skipNamespaceCheck: true })).toThrow(XmlSecurityError);
  });

  it('should throw on oversized XML', () => {
    const bigXml = `<root>${'x'.repeat(1024)}</root>`;
    expect(() => parseXmlSafe(bigXml, { maxSizeBytes: 100, skipNamespaceCheck: true })).toThrow(XmlSecurityError);
  });

  it('should pass valid CII through cleanly', () => {
    const result = parseXmlSafe(VALID_CII_XML);
    expect(result).toBe(VALID_CII_XML);
  });

  it('should pass valid UBL through cleanly', () => {
    const result = parseXmlSafe(VALID_UBL_XML);
    expect(result).toBe(VALID_UBL_XML);
  });
});

// ---------------------------------------------------------------------------
// ALLOWED_NAMESPACES constant
// ---------------------------------------------------------------------------

describe('ALLOWED_NAMESPACES', () => {
  it('should include CII namespaces', () => {
    expect(ALLOWED_NAMESPACES.has('urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100')).toBe(true);
    expect(ALLOWED_NAMESPACES.has('urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100')).toBe(true);
  });

  it('should include UBL namespaces', () => {
    expect(ALLOWED_NAMESPACES.has('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2')).toBe(true);
    expect(ALLOWED_NAMESPACES.has('urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2')).toBe(true);
  });

  it('should include XSI namespace', () => {
    expect(ALLOWED_NAMESPACES.has('http://www.w3.org/2001/XMLSchema-instance')).toBe(true);
  });

  it('should not include random namespaces', () => {
    expect(ALLOWED_NAMESPACES.has('http://evil.com/ns')).toBe(false);
  });
});
