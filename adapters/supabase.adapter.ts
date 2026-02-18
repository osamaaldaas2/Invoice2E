import { createAdminClient, createUserScopedClient } from '@/lib/supabase.server';
import { API_TIMEOUTS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { ISupabaseAdapter } from './interfaces/ISupabaseAdapter';
import { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseAdapter implements ISupabaseAdapter {
  getClient(): SupabaseClient {
    // Admin client — use only for operations that legitimately need service-role access
    return createAdminClient();
  }

  async getUserScopedClient(userId: string): Promise<SupabaseClient> {
    return createUserScopedClient(userId);
  }

  async execute<T>(
    operation: Promise<T> | (() => Promise<T>),
    timeoutMs: number = API_TIMEOUTS.DATABASE_QUERY
  ): Promise<T> {
    const startTime = Date.now();
    const promise = typeof operation === 'function' ? operation() : operation;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database operation timed out')), timeoutMs)
    );

    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch (error) {
      const duration = Date.now() - startTime;
      if (error instanceof Error && error.message.includes('timed out')) {
        logger.error('Database operation timeout', { duration, timeoutMs });
        throw new AppError('DB_TIMEOUT', 'Database operation timed out', 504);
      }
      throw error;
    }
  }
}

export const supabaseAdapter = new SupabaseAdapter();
