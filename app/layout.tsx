import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { APP_NAME } from '@/lib/constants';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { ToastProvider } from '@/lib/toast-context';
import { ToastContainer } from '@/components/ui/toast';
import { ConfirmProvider } from '@/lib/confirm-context';
import { UserProvider } from '@/lib/user-context';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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

export const metadata: Metadata = {
    title: APP_NAME,
    description: 'Convert invoices to XRechnung compliant e-invoices',
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
};

type RootLayoutProps = {
    children: React.ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps): Promise<React.ReactElement> {
    const locale = await getLocale();
    const messages = await getMessages();

    return (
        <html lang={locale}>
            <body className={`min-h-screen flex flex-col ${displayFont.variable} ${bodyFont.variable}`}>
                <NextIntlClientProvider locale={locale} messages={messages}>
                    <ToastProvider>
                        <ConfirmProvider>
                            <UserProvider>
                                <Header />
                                <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
                                <Footer />
                                <ToastContainer />
                                <ConfirmDialog />
                            </UserProvider>
                        </ConfirmProvider>
                    </ToastProvider>
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
