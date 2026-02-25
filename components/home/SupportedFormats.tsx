'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

const FORMATS = [
  { slug: 'pdf-to-xrechnung', flag: '🇩🇪', name: 'XRechnung (CII)', ext: '.xml' },
  { slug: 'pdf-to-xrechnung-ubl', flag: '🇩🇪', name: 'XRechnung (UBL)', ext: '.xml' },
  { slug: 'pdf-to-zugferd', flag: '🇩🇪🇫🇷', name: 'ZUGFeRD 2.x', ext: '.pdf' },
  { slug: 'pdf-to-facturx', flag: '🇫🇷', name: 'Factur-X', ext: '.pdf' },
  { slug: 'pdf-to-peppol', flag: '🇪🇺', name: 'Peppol BIS 3.0', ext: '.xml' },
  { slug: 'pdf-to-fatturapa', flag: '🇮🇹', name: 'FatturaPA', ext: '.xml' },
  { slug: 'pdf-to-ksef', flag: '🇵🇱', name: 'KSeF', ext: '.xml' },
  { slug: 'pdf-to-nlcius', flag: '🇳🇱', name: 'NL-CIUS', ext: '.xml' },
  { slug: 'pdf-to-cius-ro', flag: '🇷🇴', name: 'CIUS-RO', ext: '.xml' },
];

export default function SupportedFormats() {
  const t = useTranslations('home');

  return (
    <div className="max-w-5xl mx-auto mb-24 md:mb-32 text-center">
      <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 font-display">
        {t('formatsTitle')}
      </h2>
      <p className="text-lg text-faded max-w-2xl mx-auto mb-10">{t('formatsSubtitle')}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
        {FORMATS.map((f) => (
          <Link
            key={f.slug}
            href={`/${f.slug}`}
            className="glass-card p-4 border-white/10 hover:border-sky-400/40 transition-all group text-left"
          >
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">{f.flag}</span>
              <span className="text-white font-semibold group-hover:text-sky-300 transition-colors">
                {f.name}
              </span>
            </div>
            <span className="text-xs text-faded">PDF → {f.ext}</span>
          </Link>
        ))}
      </div>
      <Link
        href="/convert"
        className="inline-block mt-8 text-sky-300 hover:text-sky-200 underline underline-offset-4 text-sm"
      >
        {t('viewAllFormats')}
      </Link>
    </div>
  );
}
