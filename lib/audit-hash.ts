/**
 * Audit Log Hash Utilities
 *
 * Provides client-side SHA-256 hash computation and chain verification
 * for the immutable audit log system. Uses Web Crypto API (Node.js 18+).
 *
 * @module lib/audit-hash
 */

/** Fields used to compute an audit entry hash (must match DB trigger order). */
export interface AuditHashInput {
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  userId?: string | null;
  changes?: Record<string, unknown> | null;
  createdAt: string | Date;
}

/** Minimal audit entry with hash fields for chain verification. */
export interface AuditChainEntry extends AuditHashInput {
  id: string;
  entryHash: string;
  prevHash: string | null;
}

/**
 * Compute the SHA-256 hash of an audit entry's canonical fields.
 * Matches the PostgreSQL trigger formula exactly:
 *   SHA256(action|resource_type|resource_id|user_id|changes|created_at)
 *
 * @param input - The audit entry fields to hash
 * @returns Hex-encoded SHA-256 digest
 */
export async function computeAuditHash(input: AuditHashInput): Promise<string> {
  const parts = [
    input.action ?? '',
    input.resourceType ?? '',
    input.resourceId ?? '',
    input.userId ?? '',
    input.changes != null ? JSON.stringify(input.changes) : '',
    input.createdAt instanceof Date ? input.createdAt.toISOString() : String(input.createdAt),
  ];

  const canonical = parts.join('|');
  const encoded = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);

  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Result of verifying an audit chain. */
export interface ChainVerificationResult {
  /** Whether the entire chain is valid. */
  isValid: boolean;
  /** Total entries checked. */
  totalChecked: number;
  /** ID of the first entry with a broken hash or chain link (null if valid). */
  firstBrokenId: string | null;
  /** Human-readable description of the failure (null if valid). */
  error: string | null;
}

/**
 * Verify the integrity of a sequence of audit log entries.
 * Entries MUST be sorted by (createdAt ASC, id ASC) — the same order as the DB.
 *
 * Checks:
 * 1. Each entry's `entryHash` matches the recomputed hash of its fields.
 * 2. Each entry's `prevHash` matches the prior entry's `entryHash`.
 *
 * @param entries - Ordered audit entries to verify
 * @returns Verification result with details on any breakage
 */
export async function verifyChainIntegrity(
  entries: AuditChainEntry[],
): Promise<ChainVerificationResult> {
  if (entries.length === 0) {
    return { isValid: true, totalChecked: 0, firstBrokenId: null, error: null };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const recomputed = await computeAuditHash(entry);

    // Check entry_hash integrity
    if (entry.entryHash !== recomputed) {
      return {
        isValid: false,
        totalChecked: i + 1,
        firstBrokenId: entry.id,
        error: `Entry ${entry.id}: entry_hash mismatch (expected ${recomputed}, got ${entry.entryHash})`,
      };
    }

    // Check prev_hash chain linkage (skip first entry — prev_hash may be null)
    if (i > 0) {
      const expectedPrev = entries[i - 1].entryHash;
      if (entry.prevHash !== expectedPrev) {
        return {
          isValid: false,
          totalChecked: i + 1,
          firstBrokenId: entry.id,
          error: `Entry ${entry.id}: prev_hash mismatch (expected ${expectedPrev}, got ${entry.prevHash})`,
        };
      }
    }
  }

  return {
    isValid: true,
    totalChecked: entries.length,
    firstBrokenId: null,
    error: null,
  };
}
