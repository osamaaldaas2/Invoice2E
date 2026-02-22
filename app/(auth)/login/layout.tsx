import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login',
  description:
    'Sign in to Invoice2E to convert your invoices to XRechnung and other e-invoice formats.',
  alternates: { canonical: '/login' },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
