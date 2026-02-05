import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './lib/constants';

const intlMiddleware = createMiddleware({
    locales: SUPPORTED_LOCALES as unknown as string[],
    defaultLocale: DEFAULT_LOCALE,
    localePrefix: 'always',
});

export default function middleware(request: NextRequest) {
    // Skip middleware for API routes
    if (request.nextUrl.pathname.startsWith('/api')) {
        return;
    }

    return intlMiddleware(request);
}

export const config = {
    // Match all paths except static files and API routes
    matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
