/**
 * @module tests/unit/queue/dead-letter-wiring
 * @description Tests for dead letter handler wiring in workers (FIX: Re-audit #9).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track event handlers registered on Worker instances
type EventHandler = (...args: unknown[]) => void;
const registeredHandlers: Record<string, EventHandler[]> = {};

vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn((event: string, handler: EventHandler) => {
      if (!registeredHandlers[event]) registeredHandlers[event] = [];
      registeredHandlers[event]!.push(handler);
    }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@/lib/queue/connection', () => ({
  getWorkerConnection: vi.fn(() => ({})),
  closeAllConnections: vi.fn().mockResolvedValue(undefined),
}));

const handleDeadLetterMock = vi.fn();
vi.mock('@/lib/queue/dead-letter', () => ({
  handleDeadLetter: (...args: unknown[]) => handleDeadLetterMock(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { createWorker, _resetShutdownRegistered } from '@/lib/queue/workers';

describe('Dead Letter Handler Wiring (Re-audit #9)', () => {
  beforeEach(() => {
    _resetShutdownRegistered();
    // Clear tracked handlers
    for (const key of Object.keys(registeredHandlers)) {
      delete registeredHandlers[key];
    }
    vi.clearAllMocks();
  });

  it('should register a failed event handler on the worker', () => {
    createWorker('invoice:extraction' as any, vi.fn());
    expect(registeredHandlers['failed']).toBeDefined();
    expect(registeredHandlers['failed']!.length).toBeGreaterThan(0);
  });

  it('should call handleDeadLetter when job exhausts all retries', () => {
    createWorker('invoice:extraction' as any, vi.fn());
    const failedHandler = registeredHandlers['failed']![0]!;

    const mockJob = {
      id: 'job-123',
      data: { fileId: 'abc' },
      attemptsMade: 3,
      opts: { attempts: 3 },
      stacktrace: [],
    };
    const mockError = new Error('extraction failed permanently');

    failedHandler(mockJob, mockError);

    expect(handleDeadLetterMock).toHaveBeenCalledWith(mockJob, 'invoice:extraction', mockError);
  });

  it('should NOT call handleDeadLetter for retriable failures', () => {
    createWorker('invoice:extraction' as any, vi.fn());
    const failedHandler = registeredHandlers['failed']![0]!;

    const mockJob = {
      id: 'job-456',
      data: { fileId: 'def' },
      attemptsMade: 1,
      opts: { attempts: 3 },
      stacktrace: [],
    };
    const mockError = new Error('temporary failure');

    failedHandler(mockJob, mockError);

    expect(handleDeadLetterMock).not.toHaveBeenCalled();
  });

  it('should call handleDeadLetter when opts.attempts is not set (default 1)', () => {
    createWorker('invoice:batch' as any, vi.fn());
    const failedHandler = registeredHandlers['failed']![0]!;

    const mockJob = {
      id: 'job-789',
      data: {},
      attemptsMade: 1,
      opts: {},
      stacktrace: [],
    };
    const mockError = new Error('single-attempt failure');

    failedHandler(mockJob, mockError);

    expect(handleDeadLetterMock).toHaveBeenCalledWith(mockJob, 'invoice:batch', mockError);
  });
});
