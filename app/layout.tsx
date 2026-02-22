import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
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
  title: {
    default: 'Invoice2E – Convert Invoices to XRechnung & E-Invoice Formats',
    template: '%s | Invoice2E',
  },
  description:
    'Invoice2E converts your PDF invoices into XRechnung, ZUGFeRD, and other e-invoice formats using AI. DSGVO-compliant, fast, and affordable. Made in Germany.',
  keywords: [
    'XRechnung',
    'e-invoice',
    'e-Rechnung',
    'ZUGFeRD',
    'invoice conversion',
    'PDF to XRechnung',
    'elektronische Rechnung',
    'Invoice2E',
    'DSGVO',
    'Germany',
  ],
  authors: [{ name: 'Invoice2E' }],
  creator: 'Invoice2E',
  metadataBase: new URL('https://www.invoice2e.eu'),
  alternates: {
    canonical: '/',
    languages: {
      en: '/',
      de: '/',
      'x-default': '/',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.invoice2e.eu',
    siteName: 'Invoice2E',
    title: 'Invoice2E – Convert Invoices to XRechnung & E-Invoice Formats',
    description:
      'Convert PDF invoices to XRechnung, ZUGFeRD, and other e-invoice formats with AI. Fast, affordable, DSGVO-compliant.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Invoice2E – AI-Powered Invoice Conversion',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Invoice2E – Convert Invoices to XRechnung & E-Invoice Formats',
    description:
      'Convert PDF invoices to XRechnung, ZUGFeRD, and other e-invoice formats with AI. Fast, affordable, DSGVO-compliant.',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default async function RootLayout({
  children,
}: RootLayoutProps): Promise<React.ReactElement> {
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
