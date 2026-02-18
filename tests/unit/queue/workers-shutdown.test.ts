/**
 * @module tests/unit/queue/workers-shutdown
 * @description Tests for BullMQ worker graceful shutdown (FIX: Re-audit #8).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bullmq before importing workers
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock the connection module
vi.mock('@/lib/queue/connection', () => ({
  getWorkerConnection: vi.fn(() => ({})),
  closeAllConnections: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  registerGracefulShutdown,
  _isShutdownRegistered,
  _resetShutdownRegistered,
  createWorker,
  shutdownAllWorkers,
} from '@/lib/queue/workers';

describe('Worker Graceful Shutdown (Re-audit #8)', () => {
  beforeEach(() => {
    _resetShutdownRegistered();
    vi.clearAllMocks();
  });

  it('should register shutdown handlers on first call', () => {
    const processSpy = vi.spyOn(process, 'on');
    registerGracefulShutdown();

    expect(_isShutdownRegistered()).toBe(true);
    expect(processSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(processSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });

  it('should be idempotent — calling twice registers handlers only once', () => {
    const processSpy = vi.spyOn(process, 'on');
    registerGracefulShutdown();
    registerGracefulShutdown();

    // SIGTERM + SIGINT = 2 calls, not 4
    const sigCalls = processSpy.mock.calls.filter(
      ([signal]) => signal === 'SIGTERM' || signal === 'SIGINT'
    );
    expect(sigCalls).toHaveLength(2);
  });

  it('should auto-register when createWorker is called', () => {
    expect(_isShutdownRegistered()).toBe(false);
    createWorker('invoice:extraction' as any, vi.fn());
    expect(_isShutdownRegistered()).toBe(true);
  });

  it('shutdownAllWorkers should close all active workers', async () => {
    // Create a worker to populate activeWorkers
    const worker = createWorker('invoice:extraction' as any, vi.fn());
    expect(worker).toBeDefined();

    // shutdownAllWorkers should call close on the worker
    await shutdownAllWorkers();
    expect(worker.close).toHaveBeenCalled();
  });
});
