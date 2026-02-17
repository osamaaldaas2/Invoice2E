/**
 * Optimistic Locking utility for Invoice2E.
 *
 * Prevents concurrent edit conflicts by including a `row_version` check
 * in every UPDATE. If the version has changed since the client last read
 * the row, the update is rejected with an OptimisticLockError (HTTP 409).
 *
 * @module lib/optimistic-lock
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown when an UPDATE finds that `row_version` has changed since the
 * client's last read — indicating a concurrent modification.
 */
export class OptimisticLockError extends AppError {
  constructor(
    public readonly tableName: string,
    public readonly rowId: string,
    public readonly expectedVersion: number,
  ) {
    super(
      'OPTIMISTIC_LOCK_CONFLICT',
      `Conflict: the ${tableName} row ${rowId} was modified by another request. ` +
        `Expected version ${expectedVersion}. Please reload and try again.`,
      409,
      { tableName, rowId, expectedVersion },
    );
    this.name = 'OptimisticLockError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mixin for any entity that participates in optimistic locking. */
export interface Versioned {
  /** Auto-incremented by the database trigger on every UPDATE. */
  rowVersion: number;
}

/** Params required by {@link withOptimisticLock}. */
export interface OptimisticLockParams<TData extends Record<string, unknown>> {
  /** Supabase client (RLS-scoped). */
  client: SupabaseClient;
  /** Database table name (snake_case). */
  table: string;
  /** UUID of the row to update. */
  id: string;
  /** The row_version the caller last saw. */
  expectedVersion: number;
  /** Key-value pairs to SET (snake_case keys). */
  data: TData;
}

// ---------------------------------------------------------------------------
// Core helper
// ---------------------------------------------------------------------------

/**
 * Perform a Supabase UPDATE that includes `WHERE row_version = $expected`.
 *
 * If zero rows are returned the version has diverged → throws
 * {@link OptimisticLockError} (HTTP 409).
 *
 * The database trigger `increment_row_version()` automatically bumps the
 * version, so callers must **not** set `row_version` in `data`.
 *
 * @returns The updated row (snake_case keys — caller is responsible for
 *          converting to camelCase via `snakeToCamelKeys`).
 *
 * @throws {OptimisticLockError} When the row was modified concurrently.
 * @throws {AppError}            On any other database error.
 *
 * @example
 * ```ts
 * const updated = await withOptimisticLock({
 *   client,
 *   table: 'invoice_conversions',
 *   id: conversionId,
 *   expectedVersion: conversion.rowVersion,
 *   data: { conversion_status: 'completed' },
 * });
 * ```
 */
export async function withOptimisticLock<TData extends Record<string, unknown>>(
  params: OptimisticLockParams<TData>,
): Promise<Record<string, unknown>> {
  const { client, table, id, expectedVersion, data } = params;

  const { data: rows, error } = await client
    .from(table)
    .update(data)
    .eq('id', id)
    .eq('row_version', expectedVersion)
    .select();

  if (error) {
    logger.error('Optimistic lock update failed', {
      table,
      id,
      expectedVersion,
      error: error.message,
    });
    throw new AppError('DB_ERROR', `Failed to update ${table}`, 500);
  }

  if (!rows || rows.length === 0) {
    logger.warn('Optimistic lock conflict detected', {
      table,
      id,
      expectedVersion,
    });
    throw new OptimisticLockError(table, id, expectedVersion);
  }

  return rows[0] as Record<string, unknown>;
}
