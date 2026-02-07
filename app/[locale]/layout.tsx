import { NextIntlClientProvider } from 'next-intl';
import { notFound } from 'next/navigation';
import { SUPPORTED_LOCALES } from '@/lib/constants';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import '@/styles/globals.css';
import '@/styles/variables.css';
import { Sora, Manrope } from 'next/font/google';

const displayFont = Sora({
    subsets: ['latin'],
    variable: '--font-display',
    display: 'swap',
    weight: ['400', '500', '600', '700'],
});

const bodyFont = Manrope({
    subsets: ['latin'],
    variable: '--font-body',
    display: 'swap',
    weight: ['400', '500', '600', '700'],
});

type LocaleLayoutProps = {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
};

async function getMessages(locale: string) {
    try {
        return (await import(`@/messages/${locale}.json`)).default;
    } catch {
        notFound();
    }
}

export default async function LocaleLayout({
    children,
    params,
}: LocaleLayoutProps): Promise<React.ReactElement> {
    const { locale } = await params;
    const isValidLocale = SUPPORTED_LOCALES.includes(locale as 'en' | 'de');

    if (!isValidLocale) {
        notFound();
    }

    const messages = await getMessages(locale);

    return (
        <html lang={locale}>
            <body className={`min-h-screen flex flex-col ${displayFont.variable} ${bodyFont.variable}`}>
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <Header />
                    <main className="flex-1">{children}</main>
                    <Footer />
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
