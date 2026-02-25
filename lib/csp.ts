/**
 * Content Security Policy — single source of truth.
 * Used by both middleware.ts and next.config.js.
 *
 * F-015: Deduplicated CSP definition.
 * F-023: unsafe-eval only in development (Next.js HMR).
 */

export function buildCsp(): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const unsafeEval = isDev ? " 'unsafe-eval'" : '';

  return [
    "default-src 'self'",
    `script-src 'self'${unsafeEval} 'unsafe-inline' https://js.stripe.com https://www.paypal.com https://www.sandbox.paypal.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.stripe.com https://www.paypal.com https://*.supabase.co https://*.ingest.sentry.io",
    'frame-src https://js.stripe.com https://www.paypal.com https://www.sandbox.paypal.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
