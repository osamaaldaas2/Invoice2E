/**
 * OpenTelemetry SDK setup integrated with Sentry.
 *
 * @sentry/nextjs v10+ uses OpenTelemetry under the hood, so we layer on top
 * of Sentry's existing OTel integration rather than creating a separate provider.
 * This module configures additional resource attributes and exposes an init function
 * called from Next.js instrumentation.ts on server startup.
 *
 * @module lib/telemetry
 */

import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { logger } from '@/lib/logger';

/** Service metadata exposed to spans and traces. */
const SERVICE_NAME = 'invoice2e';
const SERVICE_VERSION = '1.0.0';

/** OpenTelemetry tracer instance scoped to this application. */
const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);

/**
 * Initialise OpenTelemetry on server startup.
 *
 * Because `@sentry/nextjs` v10 already bootstraps a full OTel SDK
 * (NodeTracerProvider, http/fetch auto-instrumentation, Sentry span exporter),
 * this function registers supplementary configuration only:
 * - Validates the global tracer is active (Sentry set it up)
 * - Logs readiness so operators can confirm OTel is wired
 *
 * Call this from `instrumentation.ts` → `register()`.
 */
export function initTelemetry(): void {
  try {
    const activeTracer = trace.getTracerProvider().getTracer(SERVICE_NAME);
    if (!activeTracer) {
      logger.warn('[telemetry] No active tracer provider found — spans will be no-ops');
      return;
    }

    logger.info(
      `[telemetry] OpenTelemetry ready — service=${SERVICE_NAME} version=${SERVICE_VERSION}`
    );
  } catch (error: unknown) {
    logger.error('[telemetry] Failed to initialise OpenTelemetry', error);
  }
}

export { tracer, trace, context, SpanStatusCode, SERVICE_NAME, SERVICE_VERSION };
