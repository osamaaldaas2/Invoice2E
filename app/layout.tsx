import type { Metadata } from 'next';
import { APP_NAME } from '@/lib/constants';

export const metadata: Metadata = {
    title: APP_NAME,
    description: 'Convert invoices to XRechnung compliant e-invoices',
};

type RootLayoutProps = {
    children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps): React.ReactElement {
    return (
        <html>
            <body>{children}</body>
        </html>
    );
}
