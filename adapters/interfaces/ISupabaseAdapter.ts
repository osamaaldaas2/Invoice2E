import { SupabaseClient } from '@supabase/supabase-js';

export interface ISupabaseAdapter {
  getClient(): SupabaseClient;
  getUserScopedClient(userId: string): Promise<SupabaseClient>;
  execute<T>(operation: Promise<T> | (() => Promise<T>), timeoutMs?: number): Promise<T>;
}
