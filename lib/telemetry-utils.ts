/**
 * Convenience helpers for OpenTelemetry tracing.
 *
 * These wrap the raw OTel API so call-sites stay concise and
 * consistent without importing multiple `@opentelemetry/*` packages.
 *
 * @module lib/telemetry-utils
 */

import {
  type Span,
  type SpanOptions,
  type Attributes,
  SpanStatusCode,
  trace,
  context,
} from '@opentelemetry/api';
import { tracer } from '@/lib/telemetry';

/**
 * Start a new span and return it. Caller is responsible for ending the span.
 *
 * @example
 * ```ts
 * const span = startSpan('db.query', { attributes: { 'db.table': 'invoices' } });
 * try { ... } finally { span.end(); }
 * ```
 */
export function startSpan(name: string, options?: SpanOptions): Span {
  return tracer.startSpan(name, options);
}

/**
 * Execute `fn` inside a new span, automatically ending it on completion.
 * The span is set as the active span in context so child spans nest correctly.
 * If `fn` throws, the span is marked as ERROR and the exception recorded.
 *
 * @example
 * ```ts
 * const result = await withSpan('process-invoice', async (span) => {
 *   span.setAttribute('invoice.id', id);
 *   return await processInvoice(id);
 * });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  options?: SpanOptions
): Promise<T> {
  return tracer.startActiveSpan(name, options ?? {}, async (span: Span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: unknown) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Add attributes to the currently-active span (if any).
 * Safe to call when no span is active — it simply no-ops.
 *
 * @example
 * ```ts
 * addSpanAttributes({ 'invoice.id': '123', 'invoice.total': 99.5 });
 * ```
 */
export function addSpanAttributes(attributes: Attributes): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Return the current trace ID and span ID from the active context, or undefined.
 * Useful for injecting trace context into logs or downstream headers.
 */
export function getTraceContext(): { traceId: string; spanId: string } | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;

  const ctx = span.spanContext();
  // A zero trace ID means no valid trace
  if (ctx.traceId === '00000000000000000000000000000000') return undefined;

  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

export { context, trace, SpanStatusCode };
export type { Span, Attributes };
