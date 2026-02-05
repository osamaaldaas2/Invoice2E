import { getRequestConfig } from 'next-intl/server';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from './lib/constants';

export default getRequestConfig(async ({ locale }) => {
    // Validate locale
    if (!SUPPORTED_LOCALES.includes(locale as 'en' | 'de')) {
        return {
            messages: (await import(`./messages/${DEFAULT_LOCALE}.json`)).default,
        };
    }

    return {
        messages: (await import(`./messages/${locale}.json`)).default,
    };
});
