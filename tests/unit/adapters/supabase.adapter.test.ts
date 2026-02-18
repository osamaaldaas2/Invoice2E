import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseAdapter } from '@/adapters/supabase.adapter';

// Mock dependencies
const mockClient = {
  from: vi.fn(),
  auth: { getUser: vi.fn() },
};

vi.mock('@/lib/supabase.server', () => ({
  createAdminClient: vi.fn(() => mockClient),
}));

describe('SupabaseAdapter', () => {
  let adapter: SupabaseAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new SupabaseAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return supabase client', () => {
    const client = adapter.getClient();
    expect(client).toBe(mockClient);
  });

  it('should execute operation successfully', async () => {
    const mockOperation = vi.fn().mockResolvedValue('success');
    const result = await adapter.execute(mockOperation());
    expect(result).toBe('success');
  });

  it('should execute operation function successfully', async () => {
    const mockOperation = vi.fn().mockResolvedValue('success');
    const result = await adapter.execute(mockOperation);
    expect(result).toBe('success');
  });

  it('should handle operation timeout', async () => {
    const slowOperation = () => new Promise((resolve) => setTimeout(resolve, 1000));

    await expect(adapter.execute(slowOperation, 10)).rejects.toThrow(
      'Database operation timed out'
    );
  });

  it('should handle operation error', async () => {
    const failedOperation = () => Promise.reject(new Error('DB Error'));

    await expect(adapter.execute(failedOperation)).rejects.toThrow('DB Error');
  });
});
