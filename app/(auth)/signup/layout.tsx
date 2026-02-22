import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up',
  description:
    'Create a free Invoice2E account and start converting invoices to XRechnung, ZUGFeRD, and more.',
  alternates: { canonical: '/signup' },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
