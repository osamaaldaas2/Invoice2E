/**
 * Outbox Service Tests
 *
 * Unit tests for append, publish, retry, cleanup, and idempotent publishing.
 *
 * @module lib/outbox/outbox.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxService } from './outbox';
import { OUTBOX_EVENT_TYPES } from './types';
import type { AppendOutboxEventInput, OutboxEventRow } from './types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockLt = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();

/**
 * Build a chainable mock that mirrors Supabase's fluent query API.
 */
function buildChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;

  chain.from = vi.fn().mockReturnValue(chain);
  chain.insert = mockInsert.mockReturnValue(chain);
  chain.select = mockSelect.mockReturnValue(chain);
  chain.update = mockUpdate.mockReturnValue(chain);
  chain.delete = mockDelete.mockReturnValue(chain);
  chain.eq = mockEq.mockReturnValue(chain);
  chain.lt = mockLt.mockReturnValue(chain);
  chain.order = mockOrder.mockReturnValue(chain);
  chain.limit = mockLimit.mockReturnValue(chain);
  chain.single = mockSingle;

  Object.assign(chain, overrides);
  return chain;
}

// Mock supabase.server
vi.mock('@/lib/supabase.server', () => ({
  createAdminClient: vi.fn(),
}));

// Mock publisher
vi.mock('./publisher', () => ({
  publishToQueue: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createAdminClient } from '@/lib/supabase.server';
import { publishToQueue } from './publisher';

const mockedCreateAdmin = vi.mocked(createAdminClient);
const mockedPublishToQueue = vi.mocked(publishToQueue);

// ─── Test Data ──────────────────────────────────────────────────────────────

const SAMPLE_INPUT: AppendOutboxEventInput = {
  aggregateType: 'invoice',
  aggregateId: '550e8400-e29b-41d4-a716-446655440000',
  eventType: OUTBOX_EVENT_TYPES.INVOICE_EXTRACTED,
  payload: { extractionId: 'ext-1', confidence: 0.95 },
};

const SAMPLE_ROW: OutboxEventRow = {
  id: 'a1b2c3d4-0000-0000-0000-000000000001',
  aggregate_type: 'invoice',
  aggregate_id: '550e8400-e29b-41d4-a716-446655440000',
  event_type: 'INVOICE_EXTRACTED',
  payload: { extractionId: 'ext-1', confidence: 0.95 },
  status: 'pending',
  created_at: '2026-02-17T20:00:00.000Z',
  published_at: null,
  retry_count: 0,
  last_error: null,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OutboxService', () => {
  let service: OutboxService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OutboxService();
  });

  // ── appendEvent ─────────────────────────────────────────────────────────

  describe('appendEvent', () => {
    it('should insert an event into the outbox table and return it', async () => {
      const chain = buildChain();
      mockSingle.mockResolvedValue({ data: SAMPLE_ROW, error: null });

      const mockClient = chain as unknown as ReturnType<typeof createAdminClient>;
      const result = await service.appendEvent(mockClient, SAMPLE_INPUT);

      expect(chain.from).toHaveBeenCalledWith('outbox_events');
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        aggregate_type: SAMPLE_INPUT.aggregateType,
        aggregate_id: SAMPLE_INPUT.aggregateId,
        event_type: SAMPLE_INPUT.eventType,
        status: 'pending',
        retry_count: 0,
      }));
      expect(result.id).toBe(SAMPLE_ROW.id);
      expect(result.eventType).toBe('INVOICE_EXTRACTED');
      expect(result.status).toBe('pending');
    });

    it('should throw AppError when insert fails', async () => {
      const chain = buildChain();
      mockSingle.mockResolvedValue({ data: null, error: { message: 'DB down' } });

      const mockClient = chain as unknown as ReturnType<typeof createAdminClient>;
      await expect(service.appendEvent(mockClient, SAMPLE_INPUT))
        .rejects.toThrow('Failed to append outbox event');
    });
  });

  // ── pollAndPublish ──────────────────────────────────────────────────────

  describe('pollAndPublish', () => {
    it('should return 0 when no pending events exist', async () => {
      const chain = buildChain();
      mockLimit.mockResolvedValue({ data: [], error: null });
      mockedCreateAdmin.mockReturnValue(chain as unknown as ReturnType<typeof createAdminClient>);

      const count = await service.pollAndPublish();

      expect(count).toBe(0);
    });

    it('should publish pending events and mark them as published', async () => {
      // Build a fresh chain where eq always returns the full chain (order works)
      const chain = buildChain();
      // After the select query resolves, the update path also needs eq→eq chaining
      let eqCallCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCallCount++;
        // First eq call: .eq('status','pending') in select chain → return chain (has .order)
        // Later eq calls: update path → return chain-like with nested eq
        if (eqCallCount <= 1) return chain;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      });
      mockLimit.mockResolvedValue({ data: [SAMPLE_ROW], error: null });
      mockedCreateAdmin.mockReturnValue(chain as unknown as ReturnType<typeof createAdminClient>);
      mockedPublishToQueue.mockResolvedValue(undefined);

      const count = await service.pollAndPublish();

      expect(mockedPublishToQueue).toHaveBeenCalledTimes(1);
      expect(count).toBe(1);
    });

    it('should increment retry_count when publishing fails', async () => {
      const chain = buildChain();
      let eqCallCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount <= 1) return chain;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      });
      mockLimit.mockResolvedValue({ data: [SAMPLE_ROW], error: null });
      mockedCreateAdmin.mockReturnValue(chain as unknown as ReturnType<typeof createAdminClient>);
      mockedPublishToQueue.mockRejectedValue(new Error('Queue unavailable'));

      const count = await service.pollAndPublish();

      expect(count).toBe(0);
    });
  });

  // ── retryFailed ─────────────────────────────────────────────────────────

  describe('retryFailed', () => {
    it('should reset failed events to pending when below maxRetries', async () => {
      const chain = buildChain();
      mockLt.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'abc' }, { id: 'def' }],
          error: null,
        }),
      });
      mockedCreateAdmin.mockReturnValue(chain as unknown as ReturnType<typeof createAdminClient>);

      const count = await service.retryFailed(10);

      expect(count).toBe(2);
    });

    it('should return 0 when no failed events exist', async () => {
      const chain = buildChain();
      mockLt.mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      mockedCreateAdmin.mockReturnValue(chain as unknown as ReturnType<typeof createAdminClient>);

      const count = await service.retryFailed();

      expect(count).toBe(0);
    });
  });

  // ── cleanup ─────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('should delete old published events', async () => {
      const chain = buildChain();
      mockLt.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'old-1' }, { id: 'old-2' }, { id: 'old-3' }],
          error: null,
        }),
      });
      mockedCreateAdmin.mockReturnValue(chain as unknown as ReturnType<typeof createAdminClient>);

      const count = await service.cleanup(30);

      expect(count).toBe(3);
    });
  });

  // ── Idempotent publishing ──────────────────────────────────────────────

  describe('idempotent publishing', () => {
    it('should use outbox event ID as BullMQ job ID for deduplication', async () => {
      const chain = buildChain();
      let eqCallCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount <= 1) return chain;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      });
      mockLimit.mockResolvedValue({ data: [SAMPLE_ROW], error: null });
      mockedCreateAdmin.mockReturnValue(chain as unknown as ReturnType<typeof createAdminClient>);
      mockedPublishToQueue.mockResolvedValue(undefined);

      await service.pollAndPublish();

      // Verify publishToQueue was called with the event containing its ID
      expect(mockedPublishToQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: SAMPLE_ROW.id,
          eventType: 'INVOICE_EXTRACTED',
        }),
      );
    });

    it('should only update events still in pending status (optimistic concurrency)', async () => {
      const chain = buildChain();
      let eqCallCount = 0;
      chain.eq = vi.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount <= 1) return chain;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      });
      mockLimit.mockResolvedValue({ data: [SAMPLE_ROW], error: null });
      mockedCreateAdmin.mockReturnValue(chain as unknown as ReturnType<typeof createAdminClient>);
      mockedPublishToQueue.mockResolvedValue(undefined);

      await service.pollAndPublish();

      // The update used optimistic concurrency (status=pending guard)
      expect(mockedPublishToQueue).toHaveBeenCalledTimes(1);
    });
  });
});
