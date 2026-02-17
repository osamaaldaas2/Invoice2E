import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, SUPPORTED_LOCALES } from './lib/constants';
import { getCorsHeaders, isOriginAllowed } from './lib/cors';

// FIX: Audit #013 — security headers on all responses
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '0');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

export default function middleware(request: NextRequest) {
  // F-08: Generate request ID for tracing (propagated via header)
  const requestId = crypto.randomUUID();

  // Handle CORS for API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const origin = request.headers.get('origin');

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: getCorsHeaders(origin),
      });
    }

    // Check origin for non-preflight requests
    // Allow same-origin: if Origin host matches the request host, it's same-origin
    const requestHost = request.headers.get('host');
    const originHost = origin ? new URL(origin).host : null;
    const isSameOrigin = !!originHost && originHost === requestHost;

    if (origin && !isSameOrigin && !isOriginAllowed(origin)) {
      return new NextResponse(JSON.stringify({ error: 'CORS origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Add CORS headers and request ID to API responses
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', requestId);
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set('x-request-id', requestId);
    const corsHeaders = getCorsHeaders(origin);
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }
    return addSecurityHeaders(response);
  }

  // For non-API routes: ensure locale cookie exists
  const localeCookie = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const isValidLocale = SUPPORTED_LOCALES.includes(localeCookie as 'en' | 'de');

  if (!isValidLocale) {
    const response = NextResponse.next();
    response.cookies.set(LOCALE_COOKIE_NAME, DEFAULT_LOCALE, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });
    return addSecurityHeaders(response);
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  // Match all paths except static files
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};
