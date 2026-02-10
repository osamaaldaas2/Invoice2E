import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, SUPPORTED_LOCALES } from '../lib/constants';

export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
    const resolvedLocale = SUPPORTED_LOCALES.includes(cookieValue as 'en' | 'de')
        ? (cookieValue as 'en' | 'de')
        : DEFAULT_LOCALE;

    return {
        locale: resolvedLocale,
        messages: (await import(`../messages/${resolvedLocale}.json`)).default,
    };
});
