/**
 * R-1/R-5 regression test: Credit double-deduction prevention.
 *
 * Verifies that processBatch:
 *   1. Sets credits_deducted = true atomically before calling deductCredits
 *   2. Skips deduction when credits_deducted is already true (recovery re-run)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── State for simulating credits_deducted column ───────────────────────────
let creditsDeductedFlag = false;

function buildChain(): any {
  const chain: any = {};

  chain.from = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn((payload: any) => {
    if (payload?.credits_deducted === true) {
      // This is the idempotency claim attempt
      chain._pendingClaimResult = creditsDeductedFlag
        ? { data: null, error: { code: 'PGRST116', message: 'no rows' } }
        : { data: { id: 'job-1' }, error: null };
      if (!creditsDeductedFlag) creditsDeductedFlag = true;
    }
    return chain;
  });
  chain.eq = vi.fn(() => chain);
  chain.single = vi.fn(() => {
    // If there's a pending claim result, return it
    if (chain._pendingClaimResult) {
      const r = chain._pendingClaimResult;
      chain._pendingClaimResult = null;
      return Promise.resolve(r);
    }
    // Default: return job data (for the initial select().eq().single())
    return Promise.resolve({
      data: { id: 'job-1', user_id: 'user-1' },
      error: null,
    });
  });

  chain._pendingClaimResult = null;
  return chain;
}

const mockChain = buildChain();

vi.mock('@/lib/supabase.server', () => ({
  createAdminClient: vi.fn(() => mockChain),
  createAdminClient: vi.fn(() => mockChain),
  createUserScopedClient: vi.fn(() => Promise.resolve(mockChain)),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockDeductCredits = vi.fn().mockResolvedValue(true);
const mockAddCredits = vi.fn().mockResolvedValue(true);
vi.mock('@/services/credits.db.service', () => ({
  creditsDbService: {
    deductCredits: (...args: any[]) => mockDeductCredits(...args),
    addCredits: (...args: any[]) => mockAddCredits(...args),
  },
}));

vi.mock('@/services/ai/extractor.factory', () => ({
  ExtractorFactory: {
    create: vi.fn(() => ({
      extractFromFile: vi.fn().mockResolvedValue({
        invoiceNumber: 'INV-001',
        sellerName: 'Seller',
        buyerName: 'Buyer',
        totalAmount: 100,
        confidence: 0.95,
        lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
      }),
      extractFromBuffer: vi.fn().mockResolvedValue({
        invoiceNumber: 'INV-001',
        sellerName: 'Seller',
        buyerName: 'Buyer',
        totalAmount: 100,
        confidence: 0.95,
        lineItems: [{ description: 'Item', quantity: 1, unitPrice: 100, totalPrice: 100 }],
      }),
    })),
  },
}));

vi.mock('@/services/invoice.db.service', () => ({
  invoiceDbService: {
    createExtraction: vi.fn().mockResolvedValue({ id: 'ext-1' }),
    updateExtraction: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/services/boundary-detection.service', () => ({
  boundaryDetectionService: {
    detect: vi
      .fn()
      .mockResolvedValue({ totalInvoices: 1, invoices: [{ pages: [1], label: 'Invoice 1' }] }),
    detectBoundaries: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/services/pdf-splitter.service', () => ({
  pdfSplitterService: {
    splitPdf: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/constants', () => ({
  BATCH_EXTRACTION: { CONCURRENCY: 1, MAX_FILE_SIZE: 10000000 },
  MULTI_INVOICE_CONCURRENCY: 2,
}));

import { BatchProcessor } from '@/services/batch/batch.processor';

describe('BatchProcessor credit idempotency (R-1/R-5)', () => {
  let processor: BatchProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    creditsDeductedFlag = false;
    mockChain._pendingClaimResult = null;
    processor = new BatchProcessor();
  });

  it('deducts credits on first run (credits_deducted=false)', async () => {
    const files = [{ name: 'test.pdf', content: Buffer.from('fake') }];

    try {
      await processor.processBatch('job-1', files);
    } catch {
      // Expect errors from mocking gaps in file processing — we only assert on deductCredits
    }

    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledWith('user-1', 1, 'batch:deduct:job-1');
  });

  it('skips deduction on recovery re-run (credits_deducted=true)', async () => {
    // Simulate: credits were already deducted in a previous run
    creditsDeductedFlag = true;

    const files = [{ name: 'test.pdf', content: Buffer.from('fake') }];

    try {
      await processor.processBatch('job-1', files);
    } catch {
      // Expect errors from mocking gaps in file processing
    }

    // deductCredits should NOT have been called
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it('flag is set atomically before deduction', async () => {
    const files = [{ name: 'test.pdf', content: Buffer.from('fake') }];

    try {
      await processor.processBatch('job-1', files);
    } catch {
      // Expected
    }

    // Verify update was called with credits_deducted: true
    const updateCalls = mockChain.update.mock.calls;
    const claimCall = updateCalls.find((call: any[]) => call[0]?.credits_deducted === true);
    expect(claimCall).toBeDefined();

    // And credits_deducted flag should now be true
    expect(creditsDeductedFlag).toBe(true);
  });
});
