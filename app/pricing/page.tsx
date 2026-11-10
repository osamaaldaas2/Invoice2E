import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ShieldCheck } from 'lucide-react';
import { PricingCards } from '@/components/payment/PricingCards';

export const metadata: Metadata = {
  title: 'Pricing – Affordable E-Invoice Conversion',
  description:
    'Simple, transparent pricing for converting PDF invoices to XRechnung, ZUGFeRD, and other e-invoice formats. Pay per conversion, no subscription required.',
  alternates: { canonical: '/pricing' },
};

export default async function PricingPage() {
  const t = await getTranslations('pricing');

  return (
    <div className="pricing-page">
      <div className="brand-container brand-section">
        <div className="pricing-heading">
          <p className="eyebrow">INVOICE2E / CREDITS</p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-white font-display">
            {t('title')}
          </h1>
          <p className="text-lg text-faded max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        <PricingCards />

        <div className="mt-12 text-center text-sm text-faded">
          <p className="flex justify-center items-center gap-2">
            <ShieldCheck size={16} /> {t('securePayment')}
          </p>
          <p className="mt-2">{t('noSubscriptions')}</p>
        </div>
      </div>
    </div>
  );
}
