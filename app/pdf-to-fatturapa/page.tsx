export const dynamic = 'force-static';

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import FormatLandingPage from '@/components/marketing/FormatLandingPage';
import { FORMAT_LANDING_CONFIGS } from '@/lib/format-landing-data';

const config = FORMAT_LANDING_CONFIGS.find((c) => c.slug === 'pdf-to-fatturapa')!;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations(`formatPages.${config.i18nKey}`);
  return {
    title: t('meta.title'),
    description: t('meta.desc'),
    alternates: { canonical: '/pdf-to-fatturapa' },
    openGraph: {
      title: t('meta.title'),
      description: t('meta.desc'),
      type: 'website',
      url: 'https://www.invoice2e.eu/pdf-to-fatturapa',
    },
  };
}

export default function PdfToFatturapaPage() {
  return <FormatLandingPage config={config} />;
}
