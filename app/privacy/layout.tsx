import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Learn how Invoice2E handles your data. DSGVO-compliant privacy policy for our e-invoice conversion service.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
