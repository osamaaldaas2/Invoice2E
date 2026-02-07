import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './lib/constants';
import { getCorsHeaders, isOriginAllowed } from './lib/cors';

const intlMiddleware = createMiddleware({
    locales: SUPPORTED_LOCALES as unknown as string[],
    defaultLocale: DEFAULT_LOCALE,
    localePrefix: 'always',
});

export default function middleware(request: NextRequest) {
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
        if (origin && !isOriginAllowed(origin)) {
            return new NextResponse(
                JSON.stringify({ error: 'CORS origin not allowed' }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Continue with the request, CORS headers will be added by API routes
        return NextResponse.next();
    }

    return intlMiddleware(request);
}

export const config = {
    // Match all paths except static files
    matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};
