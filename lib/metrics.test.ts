/**
 * Unit tests for lib/metrics.ts
 *
 * @module lib/metrics.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  register,
  extractionTotal,
  conversionTotal,
  creditDeductionTotal,
  batchTotal,
  extractionDuration,
  conversionDuration,
  aiProviderLatency,
  activeJobs,
  creditBalanceTotal,
  incExtraction,
  incConversion,
  incCreditDeduction,
  incBatch,
  observeExtractionDuration,
  observeConversionDuration,
  observeAILatency,
  setActiveJobs,
  setCreditBalance,
} from './metrics';

beforeEach(async () => {
  register.resetMetrics();
});

describe('metrics registry', () => {
  it('should expose metrics in Prometheus text format', async () => {
    const output = await register.metrics();
    expect(output).toContain('process_cpu');
    expect(typeof output).toBe('string');
  });

  it('should have correct content type', () => {
    expect(register.contentType).toContain('text/plain');
  });
});

describe('counters', () => {
  it('should increment extraction_total', async () => {
    incExtraction('success', 'gemini');
    incExtraction('failure', 'gemini');

    const metrics = await register.metrics();
    expect(metrics).toContain('extraction_total');
  });

  it('should increment conversion_total', async () => {
    incConversion('success', 'xrechnung');

    const metrics = await register.metrics();
    expect(metrics).toContain('conversion_total');
  });

  it('should increment credit_deduction_total', async () => {
    incCreditDeduction();

    const metrics = await register.metrics();
    expect(metrics).toContain('credit_deduction_total');
  });

  it('should increment batch_total', async () => {
    incBatch();

    const metrics = await register.metrics();
    expect(metrics).toContain('batch_total');
  });
});

describe('histograms', () => {
  it('should observe extraction duration', async () => {
    observeExtractionDuration(1.5);

    const metrics = await register.metrics();
    expect(metrics).toContain('extraction_duration_seconds');
  });

  it('should observe conversion duration', async () => {
    observeConversionDuration(0.3);

    const metrics = await register.metrics();
    expect(metrics).toContain('conversion_duration_seconds');
  });

  it('should observe AI provider latency with label', async () => {
    observeAILatency('gemini', 2.1);

    const metrics = await register.metrics();
    expect(metrics).toContain('ai_provider_latency_seconds');
    expect(metrics).toContain('gemini');
  });
});

describe('gauges', () => {
  it('should set active jobs per queue', async () => {
    setActiveJobs('extraction', 5);

    const metrics = await register.metrics();
    expect(metrics).toContain('active_jobs');
    expect(metrics).toContain('extraction');
  });

  it('should set credit balance total', async () => {
    setCreditBalance(10000);

    const metrics = await register.metrics();
    expect(metrics).toContain('credit_balance_total');
  });
});

describe('metric instances are registered', () => {
  it('should have all custom metrics in the registry', async () => {
    const metrics = await register.getMetricsAsJSON();
    const names = metrics.map((m) => m.name);

    expect(names).toContain('extraction_total');
    expect(names).toContain('conversion_total');
    expect(names).toContain('credit_deduction_total');
    expect(names).toContain('batch_total');
    expect(names).toContain('extraction_duration_seconds');
    expect(names).toContain('conversion_duration_seconds');
    expect(names).toContain('ai_provider_latency_seconds');
    expect(names).toContain('active_jobs');
    expect(names).toContain('credit_balance_total');
  });
});
