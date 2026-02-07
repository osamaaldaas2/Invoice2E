import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../lib/constants';

export default getRequestConfig(async ({ requestLocale, locale }) => {
    const requested = locale ?? (await requestLocale);
    const resolvedLocale = SUPPORTED_LOCALES.includes(requested as 'en' | 'de')
        ? (requested as 'en' | 'de')
        : DEFAULT_LOCALE;

    return {
        locale: resolvedLocale,
        messages: (await import(`../messages/${resolvedLocale}.json`)).default,
    };
});
