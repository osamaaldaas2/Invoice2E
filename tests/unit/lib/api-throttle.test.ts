import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenBucketThrottle } from '@/lib/api-throttle';

describe('TokenBucketThrottle', () => {
  let throttle: TokenBucketThrottle;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    throttle?.destroy();
    vi.useRealTimers();
  });

  it('should resolve immediately when tokens are available', async () => {
    throttle = new TokenBucketThrottle(2, 2);

    // Both should resolve immediately (2 tokens available)
    await throttle.acquire();
    await throttle.acquire();

    expect(throttle.availableTokens).toBe(0);
    expect(throttle.pendingCount).toBe(0);
  });

  it('should queue callers when tokens are exhausted', async () => {
    throttle = new TokenBucketThrottle(1, 2);

    // First call takes the only token
    await throttle.acquire();
    expect(throttle.availableTokens).toBe(0);

    // Second call should be queued (not resolved)
    let resolved = false;
    const promise = throttle.acquire().then(() => {
      resolved = true;
    });

    // Give microtasks a chance to run
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);
    expect(throttle.pendingCount).toBe(1);

    // Advance past the refill interval (500ms for 2/sec)
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(resolved).toBe(true);
    expect(throttle.pendingCount).toBe(0);
  });

  it('should release queued callers in FIFO order', async () => {
    throttle = new TokenBucketThrottle(1, 2);

    await throttle.acquire(); // takes the 1 token

    const order: number[] = [];
    const p1 = throttle.acquire().then(() => order.push(1));
    const p2 = throttle.acquire().then(() => order.push(2));

    expect(throttle.pendingCount).toBe(2);

    // First refill — releases caller 1
    await vi.advanceTimersByTimeAsync(500);
    await p1;

    // Second refill — releases caller 2
    await vi.advanceTimersByTimeAsync(500);
    await p2;

    expect(order).toEqual([1, 2]);
  });

  it('should refill tokens up to max when no callers are waiting', async () => {
    throttle = new TokenBucketThrottle(2, 2);

    // Drain both tokens
    await throttle.acquire();
    await throttle.acquire();
    expect(throttle.availableTokens).toBe(0);

    // Advance enough for 2 refills
    await vi.advanceTimersByTimeAsync(1000);
    expect(throttle.availableTokens).toBe(2);

    // Should not exceed max
    await vi.advanceTimersByTimeAsync(2000);
    expect(throttle.availableTokens).toBe(2);
  });

  it('should release all pending callers on destroy', async () => {
    throttle = new TokenBucketThrottle(0, 1); // start with 0 tokens

    let count = 0;
    const p1 = throttle.acquire().then(() => count++);
    const p2 = throttle.acquire().then(() => count++);

    expect(throttle.pendingCount).toBe(2);

    throttle.destroy();

    await p1;
    await p2;

    expect(count).toBe(2);
    expect(throttle.pendingCount).toBe(0);
  });

  it('should report correct pending and available counts', async () => {
    throttle = new TokenBucketThrottle(3, 1);

    expect(throttle.availableTokens).toBe(3);
    expect(throttle.pendingCount).toBe(0);

    await throttle.acquire();
    expect(throttle.availableTokens).toBe(2);

    await throttle.acquire();
    await throttle.acquire();
    expect(throttle.availableTokens).toBe(0);

    // Queue one more (fire-and-forget, we just check the count)
    void throttle.acquire();
    // Let microtask run
    await vi.advanceTimersByTimeAsync(0);
    expect(throttle.pendingCount).toBe(1);
  });
});
