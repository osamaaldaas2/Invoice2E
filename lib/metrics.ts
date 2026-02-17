/**
 * Prometheus business metrics using prom-client.
 *
 * Exposes default Node.js metrics (CPU, memory, event loop lag) plus
 * Invoice2E-specific counters, histograms, and gauges for observability.
 *
 * @module lib/metrics
 */

import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';

/** Dedicated registry to avoid polluting the global default. */
export const register = new Registry();

register.setDefaultLabels({ app: 'invoice2e' });

/** Collect default Node.js metrics (CPU, memory, event loop lag, GC, etc.). */
collectDefaultMetrics({ register });

// ─── Counters ─────────────────────────────────────────────────────────────────

/** Total invoice extractions (success / failure per provider). */
export const extractionTotal = new Counter({
  name: 'extraction_total',
  help: 'Total invoice extraction attempts',
  labelNames: ['status', 'provider'] as const,
  registers: [register],
});

/** Total format conversions (success / failure per output format). */
export const conversionTotal = new Counter({
  name: 'conversion_total',
  help: 'Total format conversion attempts',
  labelNames: ['status', 'format'] as const,
  registers: [register],
});

/** Total credit deductions applied. */
export const creditDeductionTotal = new Counter({
  name: 'credit_deduction_total',
  help: 'Total credit deductions',
  registers: [register],
});

/** Total batch jobs created. */
export const batchTotal = new Counter({
  name: 'batch_total',
  help: 'Total batch jobs created',
  registers: [register],
});

// ─── Histograms ───────────────────────────────────────────────────────────────

/** Duration of invoice extraction in seconds. */
export const extractionDuration = new Histogram({
  name: 'extraction_duration_seconds',
  help: 'Duration of invoice extraction in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

/** Duration of format conversion in seconds. */
export const conversionDuration = new Histogram({
  name: 'conversion_duration_seconds',
  help: 'Duration of format conversion in seconds',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

/** AI provider response latency in seconds. */
export const aiProviderLatency = new Histogram({
  name: 'ai_provider_latency_seconds',
  help: 'AI provider response latency in seconds',
  labelNames: ['provider'] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

// ─── Gauges ───────────────────────────────────────────────────────────────────

/** Currently active jobs per queue. */
export const activeJobs = new Gauge({
  name: 'active_jobs',
  help: 'Number of currently active jobs',
  labelNames: ['queue'] as const,
  registers: [register],
});

/** Aggregate credit balance across all tenants (snapshot gauge). */
export const creditBalanceTotal = new Gauge({
  name: 'credit_balance_total',
  help: 'Aggregate credit balance total',
  registers: [register],
});

// ─── Helper functions ─────────────────────────────────────────────────────────

/**
 * Increment the extraction counter.
 *
 * @param status - 'success' or 'failure'
 * @param provider - AI provider name (e.g. 'gemini', 'openai')
 */
export function incExtraction(status: 'success' | 'failure', provider: string): void {
  extractionTotal.inc({ status, provider });
}

/**
 * Increment the conversion counter.
 *
 * @param status - 'success' or 'failure'
 * @param format - Output format (e.g. 'xrechnung', 'zugferd')
 */
export function incConversion(status: 'success' | 'failure', format: string): void {
  conversionTotal.inc({ status, format });
}

/** Increment the credit deduction counter. */
export function incCreditDeduction(): void {
  creditDeductionTotal.inc();
}

/** Increment the batch job counter. */
export function incBatch(): void {
  batchTotal.inc();
}

/**
 * Observe extraction duration.
 *
 * @param durationSeconds - Elapsed time in seconds
 */
export function observeExtractionDuration(durationSeconds: number): void {
  extractionDuration.observe(durationSeconds);
}

/**
 * Observe conversion duration.
 *
 * @param durationSeconds - Elapsed time in seconds
 */
export function observeConversionDuration(durationSeconds: number): void {
  conversionDuration.observe(durationSeconds);
}

/**
 * Observe AI provider latency.
 *
 * @param provider - AI provider name
 * @param durationSeconds - Elapsed time in seconds
 */
export function observeAILatency(provider: string, durationSeconds: number): void {
  aiProviderLatency.observe({ provider }, durationSeconds);
}

/**
 * Set the active jobs gauge for a queue.
 *
 * @param queue - Queue name
 * @param count - Current active job count
 */
export function setActiveJobs(queue: string, count: number): void {
  activeJobs.set({ queue }, count);
}

/**
 * Set the aggregate credit balance gauge.
 *
 * @param balance - Total credit balance
 */
export function setCreditBalance(balance: number): void {
  creditBalanceTotal.set(balance);
}
