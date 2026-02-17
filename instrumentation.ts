/**
 * Next.js instrumentation hook.
 *
 * `register()` runs once when the Next.js server starts (or when a new
 * worker is spawned). It initialises Sentry and OpenTelemetry.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * @module instrumentation
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Sentry server config is auto-loaded by @sentry/nextjs via its webpack plugin,
    // but we still call initTelemetry to confirm OTel is wired.
    const { initTelemetry } = await import('@/lib/telemetry');
    initTelemetry();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime — Sentry edge config handles its own init.
    // OTel node APIs are not available here.
  }
}
