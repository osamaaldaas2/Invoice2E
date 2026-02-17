/**
 * C-1 regression test: Batch worker secret enforcement.
 *
 * Verifies that isWorkerAuthorized:
 *   1. Rejects ALL requests when BATCH_WORKER_SECRET is unset (regardless of NODE_ENV)
 *   2. Rejects when provided secret is wrong
 *   3. Accepts when provided secret matches
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/services/batch.service', () => ({
  batchService: {
    recoverStuckJobs: vi.fn().mockResolvedValue(0),
    runWorkerOnce: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: vi.fn().mockResolvedValue({ allowed: true }),
  getRequestIdentifier: vi.fn().mockReturnValue('127.0.0.1'),
}));

function makeRequest(secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret !== undefined) {
    headers['x-internal-worker-key'] = secret;
  }
  return new NextRequest('http://localhost:3000/api/internal/batch-worker', {
    method: 'POST',
    headers,
  });
}

describe('Batch worker route (C-1 secret enforcement)', () => {
  const originalSecret = process.env.BATCH_WORKER_SECRET;

  afterEach(() => {
    // Restore original value
    if (originalSecret !== undefined) {
      process.env.BATCH_WORKER_SECRET = originalSecret;
    } else {
      delete process.env.BATCH_WORKER_SECRET;
    }
    vi.resetModules();
  });

  it('returns 401 when BATCH_WORKER_SECRET is unset', async () => {
    delete process.env.BATCH_WORKER_SECRET;

    const { POST } = await import('@/app/api/internal/batch-worker/route');
    const res = await POST(makeRequest('any-secret'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when provided secret is wrong', async () => {
    process.env.BATCH_WORKER_SECRET = 'correct-secret';

    const { POST } = await import('@/app/api/internal/batch-worker/route');
    const res = await POST(makeRequest('wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when no header provided', async () => {
    process.env.BATCH_WORKER_SECRET = 'correct-secret';

    const { POST } = await import('@/app/api/internal/batch-worker/route');
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns 200 when correct secret provided', async () => {
    process.env.BATCH_WORKER_SECRET = 'correct-secret';

    const { POST } = await import('@/app/api/internal/batch-worker/route');
    const res = await POST(makeRequest('correct-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
