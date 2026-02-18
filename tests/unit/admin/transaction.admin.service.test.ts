/**
 * H-1 regression test: Admin refund race condition (TOCTOU fix).
 *
 * Verifies that refundTransaction:
 *   1. Atomically transitions completed → refunding (not a two-step read+check)
 *   2. Returns 409 when a concurrent refund is already in progress
 *   3. Reverts to 'completed' when the provider call fails
 *   4. Credits are deducted exactly once
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Supabase mock with chainable builder ───────────────────────────────────
let mockUpdateResult: { data: any; error: any } = { data: { id: 'tx-1' }, error: null };
let mockSelectSingle: { data: any; error: any; count?: number } = {
  data: {
    id: 'tx-1',
    user_id: 'user-1',
    stripe_payment_id: 'pi_abc',
    amount: '100',
    currency: 'EUR',
    credits_purchased: 10,
    payment_method: 'stripe',
    payment_status: 'completed',
    created_at: '2024-01-01T00:00:00Z',
    users: { email: 'a@b.com', first_name: 'A', last_name: 'B' },
  },
  error: null,
};

const supabaseChain = {
  from: vi.fn(() => supabaseChain),
  select: vi.fn(() => supabaseChain),
  update: vi.fn(() => supabaseChain),
  eq: vi.fn(() => supabaseChain),
  single: vi.fn(() => Promise.resolve(mockUpdateResult)),
  order: vi.fn(() => supabaseChain),
  range: vi.fn(() => Promise.resolve({ data: [], error: null, count: 0 })),
};

vi.mock('@/lib/supabase.server', () => ({
  createAdminClient: vi.fn(() => supabaseChain),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockRefundPayment = vi.fn();
vi.mock('@/services/stripe.service', () => ({
  stripeService: { refundPayment: (...args: any[]) => mockRefundPayment(...args) },
}));

vi.mock('@/services/paypal.service', () => ({
  paypalService: { refundPayment: vi.fn() },
}));

const mockDeductCredits = vi.fn().mockResolvedValue(true);
vi.mock('@/services/credits.db.service', () => ({
  creditsDbService: { deductCredits: (...args: any[]) => mockDeductCredits(...args) },
}));

vi.mock('@/services/admin/audit.admin.service', () => ({
  adminAuditService: { logAdminAction: vi.fn().mockResolvedValue(undefined) },
}));

import { adminTransactionService } from '@/services/admin/transaction.admin.service';

describe('AdminTransactionService.refundTransaction (H-1 race fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getTransactionById succeeds via select().eq().single()
    // and the atomic claim succeeds via update().eq().eq().select().single()
    let callCount = 0;
    supabaseChain.single.mockImplementation(() => {
      callCount++;
      // First .single() call = getTransactionById
      if (callCount === 1) {
        return Promise.resolve(mockSelectSingle);
      }
      // Second .single() call = atomic claim (completed → refunding)
      return Promise.resolve(mockUpdateResult);
    });

    mockRefundPayment.mockResolvedValue({
      success: true,
      refundId: 're_123',
    });
  });

  it('should transition completed → refunding → refunded on success', async () => {
    const result = await adminTransactionService.refundTransaction(
      { transactionId: 'tx-1', reason: 'test' },
      'admin-1'
    );

    expect(result.paymentStatus).toBe('refunded');
    expect(mockRefundPayment).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it('should return 409 when claim fails (concurrent refund)', async () => {
    let callCount = 0;
    supabaseChain.single.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockSelectSingle);
      // Claim fails — another admin already started refunding
      return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
    });

    await expect(
      adminTransactionService.refundTransaction(
        { transactionId: 'tx-1', reason: 'test' },
        'admin-2'
      )
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('refund may already be in progress'),
    });

    // Provider should NOT have been called
    expect(mockRefundPayment).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it('should revert to completed when provider fails', async () => {
    mockRefundPayment.mockResolvedValue({
      success: false,
      error: 'Card declined',
    });

    await expect(
      adminTransactionService.refundTransaction(
        { transactionId: 'tx-1', reason: 'test' },
        'admin-1'
      )
    ).rejects.toMatchObject({
      code: 'REFUND_FAILED',
    });

    // Should have called update to revert status to 'completed'
    // (the catch block calls supabase.from().update({payment_status:'completed'})...)
    const updateCalls = supabaseChain.update.mock.calls;
    const revertCall = updateCalls.find((call: any[]) => call[0]?.payment_status === 'completed');
    expect(revertCall).toBeDefined();

    // Credits should NOT have been deducted
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it('should deduct credits exactly once on success', async () => {
    await adminTransactionService.refundTransaction(
      { transactionId: 'tx-1', reason: 'test' },
      'admin-1'
    );

    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledWith('user-1', 10, 'refund:tx-1');
  });
});
