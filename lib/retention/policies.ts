/**
 * Predefined Retention Policies per Jurisdiction
 *
 * Encodes statutory retention requirements for EU member states and provides
 * a lookup mechanism to resolve the applicable policy for a given country
 * and entity type.
 *
 * Legal references:
 * - DE: §14b UStG (10 years invoices), §257 HGB (6 years correspondence)
 * - FR: Art. L123-22 Code de Commerce (10 years commercial records)
 * - IT: Art. 2220 Codice Civile (10 years fiscal documents)
 * - EU: GDPR Art. 17 (right to erasure for personal data)
 * - Default: 7 years (common international baseline)
 *
 * @module lib/retention/policies
 */

import type { RetentionPolicy, RetainableEntityType, Jurisdiction } from './types';

/** 365.25 days per year to account for leap years */
const DAYS_PER_YEAR = 365;

// ─── Predefined Policies ──────────────────────────────────────────────────────

/**
 * All predefined retention policies, keyed by jurisdiction.
 * These are immutable at runtime; database overrides take precedence if present.
 */
export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  // ── Germany (DE) ──────────────────────────────────────────────────────────
  {
    id: 'de-invoice-10y',
    jurisdiction: 'DE',
    entityType: 'invoice',
    retentionDays: 10 * DAYS_PER_YEAR,
    legalBasis: '§14b UStG, §147 AO',
    description: 'German tax law requires 10-year retention of invoices and tax-relevant documents.',
  },
  {
    id: 'de-extraction-10y',
    jurisdiction: 'DE',
    entityType: 'extraction',
    retentionDays: 10 * DAYS_PER_YEAR,
    legalBasis: '§147 AO',
    description: 'Extraction data linked to invoices falls under the same 10-year fiscal retention.',
  },
  {
    id: 'de-conversion-10y',
    jurisdiction: 'DE',
    entityType: 'conversion',
    retentionDays: 10 * DAYS_PER_YEAR,
    legalBasis: '§147 AO',
    description: 'Conversion records linked to invoices must be retained for 10 years.',
  },
  {
    id: 'de-correspondence-6y',
    jurisdiction: 'DE',
    entityType: 'business_correspondence',
    retentionDays: 6 * DAYS_PER_YEAR,
    legalBasis: '§257 HGB',
    description: 'German commercial law requires 6-year retention of business correspondence.',
  },
  {
    id: 'de-payment-10y',
    jurisdiction: 'DE',
    entityType: 'payment',
    retentionDays: 10 * DAYS_PER_YEAR,
    legalBasis: '§147 AO',
    description: 'Payment records are tax-relevant and require 10-year retention.',
  },

  // ── France (FR) ───────────────────────────────────────────────────────────
  {
    id: 'fr-invoice-10y',
    jurisdiction: 'FR',
    entityType: 'invoice',
    retentionDays: 10 * DAYS_PER_YEAR,
    legalBasis: 'Art. L123-22 Code de Commerce',
    description: 'French commercial law requires 10-year retention of commercial records.',
  },
  {
    id: 'fr-payment-10y',
    jurisdiction: 'FR',
    entityType: 'payment',
    retentionDays: 10 * DAYS_PER_YEAR,
    legalBasis: 'Art. L123-22 Code de Commerce',
    description: 'Payment records must be retained for 10 years under French commercial law.',
  },

  // ── Italy (IT) ────────────────────────────────────────────────────────────
  {
    id: 'it-invoice-10y',
    jurisdiction: 'IT',
    entityType: 'invoice',
    retentionDays: 10 * DAYS_PER_YEAR,
    legalBasis: 'Art. 2220 Codice Civile',
    description: 'Italian civil code requires 10-year retention of fiscal documents.',
  },
  {
    id: 'it-payment-10y',
    jurisdiction: 'IT',
    entityType: 'payment',
    retentionDays: 10 * DAYS_PER_YEAR,
    legalBasis: 'Art. 2220 Codice Civile',
    description: 'Payment records are fiscal documents requiring 10-year retention.',
  },

  // ── EU / GDPR ─────────────────────────────────────────────────────────────
  {
    id: 'eu-user-erasure',
    jurisdiction: 'EU',
    entityType: 'user',
    retentionDays: 0, // right to erasure — processed on request, not time-based
    legalBasis: 'GDPR Art. 17',
    description: 'Right to erasure: personal data must be deleted upon valid request when no other legal basis applies.',
  },

  // ── Default (fallback) ────────────────────────────────────────────────────
  {
    id: 'default-invoice-7y',
    jurisdiction: 'DEFAULT',
    entityType: 'invoice',
    retentionDays: 7 * DAYS_PER_YEAR,
    legalBasis: 'International baseline',
    description: 'Default 7-year retention for invoices when no jurisdiction-specific policy exists.',
  },
  {
    id: 'default-extraction-7y',
    jurisdiction: 'DEFAULT',
    entityType: 'extraction',
    retentionDays: 7 * DAYS_PER_YEAR,
    legalBasis: 'International baseline',
    description: 'Default 7-year retention for extraction data.',
  },
  {
    id: 'default-conversion-7y',
    jurisdiction: 'DEFAULT',
    entityType: 'conversion',
    retentionDays: 7 * DAYS_PER_YEAR,
    legalBasis: 'International baseline',
    description: 'Default 7-year retention for conversion records.',
  },
  {
    id: 'default-payment-7y',
    jurisdiction: 'DEFAULT',
    entityType: 'payment',
    retentionDays: 7 * DAYS_PER_YEAR,
    legalBasis: 'International baseline',
    description: 'Default 7-year retention for payment records.',
  },
  {
    id: 'default-audit-7y',
    jurisdiction: 'DEFAULT',
    entityType: 'audit_log',
    retentionDays: 7 * DAYS_PER_YEAR,
    legalBasis: 'International baseline',
    description: 'Default 7-year retention for audit logs.',
  },
  {
    id: 'default-correspondence-7y',
    jurisdiction: 'DEFAULT',
    entityType: 'business_correspondence',
    retentionDays: 7 * DAYS_PER_YEAR,
    legalBasis: 'International baseline',
    description: 'Default 7-year retention for business correspondence.',
  },
] as const;

// ─── Policy index for O(1) lookup ────────────────────────────────────────────

/** Composite key: "jurisdiction:entityType" */
type PolicyKey = `${string}:${string}`;

const policyIndex = new Map<PolicyKey, RetentionPolicy>();

for (const policy of RETENTION_POLICIES) {
  const key: PolicyKey = `${policy.jurisdiction}:${policy.entityType}`;
  policyIndex.set(key, policy);
}

/**
 * Resolve the applicable retention policy for a jurisdiction and entity type.
 *
 * Resolution order:
 * 1. Exact jurisdiction + entity type match
 * 2. EU-level policy (e.g. GDPR erasure for user data)
 * 3. DEFAULT fallback
 * 4. null if no policy exists at all
 *
 * @param country - ISO 3166-1 alpha-2 country code or jurisdiction key
 * @param entityType - The type of entity to look up
 * @returns The most specific matching RetentionPolicy, or null
 */
export function getPolicyForJurisdiction(
  country: Jurisdiction,
  entityType: RetainableEntityType,
): RetentionPolicy | null {
  // 1. Exact match
  const exact = policyIndex.get(`${country}:${entityType}`);
  if (exact) return exact;

  // 2. EU-level fallback (GDPR applies across EU)
  const eu = policyIndex.get(`EU:${entityType}`);
  if (eu) return eu;

  // 3. Default fallback
  const fallback = policyIndex.get(`DEFAULT:${entityType}`);
  if (fallback) return fallback;

  return null;
}

/**
 * Get all policies for a given jurisdiction (including DEFAULT fallbacks
 * for entity types without a jurisdiction-specific policy).
 *
 * @param jurisdiction - The jurisdiction to query
 * @returns Array of applicable policies
 */
export function getAllPoliciesForJurisdiction(
  jurisdiction: Jurisdiction,
): readonly RetentionPolicy[] {
  const entityTypes: RetainableEntityType[] = [
    'invoice', 'extraction', 'conversion', 'payment',
    'user', 'audit_log', 'business_correspondence',
  ];

  const policies: RetentionPolicy[] = [];
  for (const entityType of entityTypes) {
    const policy = getPolicyForJurisdiction(jurisdiction, entityType);
    if (policy) {
      policies.push(policy);
    }
  }
  return policies;
}
