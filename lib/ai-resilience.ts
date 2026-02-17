import { logger } from '@/lib/logger';
import { CircuitBreaker, CircuitBreakerError, type CircuitBreakerStatus } from '@/lib/circuit-breaker';
import { withCircuitBreaker, withRetry, withTimeout, compose, type ResiliencePolicy } from '@/lib/resilience';
import { type AIProvider, ExtractorFactory } from '@/services/ai/extractor.factory';
import type { IAIExtractor } from '@/services/ai/IAIExtractor';
import type { ExtractedInvoiceData } from '@/types';

// ─── Per-provider circuit breakers ───────────────────────────────────────────

const breakers = new Map<AIProvider, CircuitBreaker>();

/** Get (or lazily create) a circuit breaker for a provider */
function getBreakerFor(provider: AIProvider): CircuitBreaker {
  let cb = breakers.get(provider);
  if (!cb) {
    cb = new CircuitBreaker({
      name: `ai:${provider}`,
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      halfOpenMaxAttempts: 3,
    });
    breakers.set(provider, cb);
  }
  return cb;
}

/** Build a composed resilience policy for a given provider */
function policyFor(provider: AIProvider): ResiliencePolicy {
  return compose(
    withCircuitBreaker(getBreakerFor(provider)),
    withRetry({ maxRetries: 2, baseDelayMs: 500 }),
    withTimeout({ timeoutMs: 60_000 }),
  );
}

// ─── Fallback order ──────────────────────────────────────────────────────────

const FALLBACK_ORDER: AIProvider[] = ['gemini', 'openai', 'mistral'];

/**
 * Extract invoice data with full resilience:
 * 1. Try the preferred provider through its circuit breaker + retry + timeout.
 * 2. On failure, iterate through remaining providers in fallback order.
 *
 * @throws The last error encountered if **all** providers fail.
 */
export async function resilientExtract(
  fileBuffer: Buffer,
  fileName: string,
  fileType: string,
  preferredProvider?: AIProvider,
): Promise<ExtractedInvoiceData> {
  const primary = (preferredProvider ?? (process.env.AI_PROVIDER as AIProvider) ?? 'gemini') as AIProvider;

  // Build ordered list: preferred first, then remaining fallbacks
  const ordered: AIProvider[] = [primary, ...FALLBACK_ORDER.filter((p) => p !== primary)];

  let lastError: unknown;

  for (const provider of ordered) {
    let extractor: IAIExtractor;
    try {
      extractor = ExtractorFactory.create(provider);
    } catch {
      // Provider not configured — skip silently
      continue;
    }

    const policy = policyFor(provider);

    try {
      const result = await policy(() => extractor.extractFromFile(fileBuffer, fileName, fileType));
      logger.info('Resilient extraction succeeded', { provider });
      return result;
    } catch (error) {
      lastError = error;
      const isCircuitOpen = error instanceof CircuitBreakerError;
      logger.warn('Provider failed during resilient extraction', {
        provider,
        circuitOpen: isCircuitOpen,
        error: String(error),
      });
      // Continue to next provider
    }
  }

  logger.error('All AI providers failed during resilient extraction');
  throw lastError;
}

// ─── Health reporting ────────────────────────────────────────────────────────

/** Health status for all registered provider circuit breakers */
export function getProviderHealth(): CircuitBreakerStatus[] {
  return FALLBACK_ORDER.map((p) => getBreakerFor(p).getStatus());
}

/** Reset a single provider's circuit breaker */
export function resetProvider(provider: AIProvider): void {
  getBreakerFor(provider).reset();
}

/** Reset all provider circuit breakers */
export function resetAllProviders(): void {
  for (const cb of breakers.values()) {
    cb.reset();
  }
}
