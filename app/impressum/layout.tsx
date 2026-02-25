import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Impressum',
  description:
    'Legal notice (Impressum) for Invoice2E, the AI-powered e-invoice conversion platform.',
  alternates: { canonical: '/impressum' },
};

export default function ImpressumLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
