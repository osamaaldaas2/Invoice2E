import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CircuitBreaker } from '@/lib/circuit-breaker';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Configuration for retry behaviour */
export interface RetryConfig {
  /** Maximum number of retry attempts (excludes the initial call) */
  readonly maxRetries: number;
  /** Base delay in ms before the first retry */
  readonly baseDelayMs: number;
  /** Maximum delay cap in ms */
  readonly maxDelayMs: number;
  /** Whether to add random jitter to the delay */
  readonly jitter: boolean;
  /** Optional predicate — only retry when this returns true */
  readonly retryIf?: (error: unknown) => boolean;
}

/** Configuration for timeout wrapper */
export interface TimeoutConfig {
  readonly timeoutMs: number;
}

/** A resilience policy is simply an async-function wrapper */
export type ResiliencePolicy = <T>(fn: () => Promise<T>) => Promise<T>;

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Thrown when a call exceeds the configured timeout */
export class TimeoutError extends AppError {
  constructor(timeoutMs: number) {
    super('TIMEOUT', `Operation timed out after ${timeoutMs}ms`, 504, { timeoutMs });
    this.name = 'TimeoutError';
  }
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/**
 * FIX: Re-audit #67 — Verified production-ready retry defaults.
 *
 * - **maxRetries (3):** 4 total attempts. Sufficient for transient API failures.
 * - **baseDelayMs (500):** First retry after ~500 ms; doubles each attempt.
 * - **maxDelayMs (10 000):** Caps at 10 s to avoid excessively long waits.
 * - **jitter (true):** Adds ±30 % randomness to prevent thundering herd on
 *   concurrent retries (e.g. batch extraction hitting rate limits).
 *
 * Note: `ai-resilience.ts` overrides maxRetries to 2 for per-provider calls
 * because the fallback chain already provides additional resilience.
 */
const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  jitter: true,
};

// ─── Policies ────────────────────────────────────────────────────────────────

/**
 * Retry with exponential back-off and optional jitter.
 *
 * ```
 * delay = min(baseDelay * 2^attempt, maxDelay) + jitter
 * ```
 */
export function withRetry(config: Partial<RetryConfig> = {}): ResiliencePolicy {
  const cfg: RetryConfig = { ...DEFAULT_RETRY, ...config };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === cfg.maxRetries) break;
        if (cfg.retryIf && !cfg.retryIf(error)) break;

        const exp = Math.min(cfg.baseDelayMs * 2 ** attempt, cfg.maxDelayMs);
        const jitter = cfg.jitter ? Math.random() * exp * 0.3 : 0;
        const delay = Math.round(exp + jitter);

        logger.warn('Retrying after failure', {
          attempt: attempt + 1,
          delay,
          error: String(error),
        });
        await sleep(delay);
      }
    }

    throw lastError;
  };
}

/**
 * Reject a call that exceeds a given duration.
 */
export function withTimeout(config: TimeoutConfig): ResiliencePolicy {
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new TimeoutError(config.timeoutMs)), config.timeoutMs);

      fn()
        .then((val) => {
          clearTimeout(timer);
          resolve(val);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };
}

/**
 * Try a primary function; on failure fall back to a secondary.
 */
export function withFallback<T>(
  primary: () => Promise<T>,
  secondary: () => Promise<T>
): () => Promise<T> {
  return async () => {
    try {
      return await primary();
    } catch (error) {
      logger.warn('Primary failed, falling back', { error: String(error) });
      return secondary();
    }
  };
}

/**
 * Wrap an async function with a circuit breaker policy.
 */
export function withCircuitBreaker(breaker: CircuitBreaker): ResiliencePolicy {
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    return breaker.execute(fn);
  };
}

/**
 * Compose multiple resilience policies left-to-right.
 *
 * ```ts
 * const policy = compose(withCircuitBreaker(cb), withRetry(), withTimeout({ timeoutMs: 5000 }));
 * const result = await policy(() => fetchData());
 * ```
 *
 * Execution order: circuit breaker → retry → timeout → fn
 */
export function compose(...policies: ResiliencePolicy[]): ResiliencePolicy {
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    let wrapped: () => Promise<T> = fn;

    // Apply from right to left so the leftmost policy is the outermost wrapper
    for (let i = policies.length - 1; i >= 0; i--) {
      const current = wrapped;
      const policy = policies[i]!;
      wrapped = () => policy(current);
    }

    return wrapped();
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
