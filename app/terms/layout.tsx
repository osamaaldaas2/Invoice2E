import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of service for Invoice2E, the AI-powered e-invoice conversion platform.',
  alternates: { canonical: '/terms' },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
