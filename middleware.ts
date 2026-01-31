import createMiddleware from 'next-intl/middleware';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './lib/constants';

export default createMiddleware({
    locales: SUPPORTED_LOCALES as unknown as string[],
    defaultLocale: DEFAULT_LOCALE,
    localePrefix: 'always',
});

export const config = {
    matcher: ['/((?!api|_next|.*\\..*).*)'],
};
