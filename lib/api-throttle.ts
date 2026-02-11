import { GEMINI_RATE_LIMIT } from '@/lib/constants';

/**
 * Token-bucket rate limiter for AI API calls.
 * Prevents 429 errors by limiting the rate of outgoing requests.
 *
 * How it works:
 * - Bucket holds up to `maxTokens` tokens
 * - Every `1000 / refillRatePerSec` ms, one token is added (or given to a queued caller)
 * - `acquire()` takes a token immediately if available, otherwise queues the caller
 */
export class TokenBucketThrottle {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private queue: Array<() => void> = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(maxTokens: number, refillRatePerSec: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillIntervalMs = Math.round(1000 / refillRatePerSec);
    this.startRefill();
  }

  /**
   * Wait for a token to become available.
   * Resolves immediately if a token is in the bucket, otherwise waits in line.
   */
  async acquire(): Promise<void> {
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private startRefill(): void {
    this.intervalId = setInterval(() => {
      if (this.queue.length > 0) {
        const resolve = this.queue.shift()!;
        resolve();
      } else if (this.tokens < this.maxTokens) {
        this.tokens++;
      }
    }, this.refillIntervalMs);

    // Prevent the interval from keeping Node.js / serverless processes alive
    if (this.intervalId && typeof this.intervalId === 'object' && 'unref' in this.intervalId) {
      (this.intervalId as NodeJS.Timeout).unref();
    }
  }

  /** Stop the refill timer and release all queued callers. For testing/cleanup. */
  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    for (const resolve of this.queue) {
      resolve();
    }
    this.queue = [];
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get availableTokens(): number {
    return this.tokens;
  }
}

// Singleton: 2 tokens, refilled at 2/sec (~120 RPM, safely under Gemini's 150 RPM limit)
export const geminiThrottle = new TokenBucketThrottle(
  GEMINI_RATE_LIMIT.MAX_TOKENS,
  GEMINI_RATE_LIMIT.REFILL_PER_SEC
);
