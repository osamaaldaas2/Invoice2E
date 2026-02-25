import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { FORMAT_LANDING_CONFIGS } from '@/lib/format-landing-data';
import { getFormatMetadata } from '@/lib/format-registry';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('formatPages.common');
  return {
    title: t('allFormatsTitle'),
    description: t('allFormatsSubtitle'),
    alternates: { canonical: '/convert' },
  };
}

export default async function ConvertHubPage() {
  const t = await getTranslations('formatPages.common');

  const popularFormats = FORMAT_LANDING_CONFIGS.filter((c) => c.popular);
  const otherFormats = FORMAT_LANDING_CONFIGS.filter((c) => !c.popular);

  return (
    <div className="relative overflow-hidden">
      <div className="absolute -top-40 left-0 h-96 w-96 rounded-full bg-sky-500/20 blur-[160px]" />
      <div className="absolute -top-20 right-0 h-80 w-80 rounded-full bg-orange-500/20 blur-[140px]" />

      <main className="container mx-auto px-4 py-12 md:py-20 relative z-10">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white mb-6 font-display">
            {t('allFormatsTitle')}
          </h1>
          <p className="text-lg md:text-xl text-faded max-w-2xl mx-auto">
            {t('allFormatsSubtitle')}
          </p>
        </div>

        {/* Popular Formats */}
        <div className="max-w-6xl mx-auto mb-16">
          <h2 className="text-xl font-bold text-white mb-6 font-display flex items-center gap-2">
            ⭐ {t('popularLabel')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {popularFormats.map((config) => {
              const meta = getFormatMetadata(config.formatId);
              return (
                <Link
                  key={config.slug}
                  href={`/${config.slug}`}
                  className="glass-card p-5 hover:border-sky-400/30 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{config.flags}</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${config.outputType === 'XML' ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'}`}
                    >
                      {config.outputType}
                    </span>
                  </div>
                  <h3 className="font-semibold text-white group-hover:text-sky-200 transition-colors mb-1">
                    {meta.displayName}
                  </h3>
                  <p className="text-xs text-faded mb-3 line-clamp-2">{meta.description}</p>
                  <div className="flex items-center gap-1 text-xs text-sky-300 group-hover:text-sky-200">
                    <span>{t('convertNow')}</span>
                    <svg
                      className="w-3 h-3 group-hover:translate-x-0.5 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Other Formats */}
        <div className="max-w-6xl mx-auto mb-16">
          <h2 className="text-xl font-bold text-white mb-6 font-display">
            {t('conversionFormats')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherFormats.map((config) => {
              const meta = getFormatMetadata(config.formatId);
              return (
                <Link
                  key={config.slug}
                  href={`/${config.slug}`}
                  className="glass-card p-5 hover:border-sky-400/30 transition-all group"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{config.flags}</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${config.outputType === 'XML' ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/20 text-emerald-300'}`}
                    >
                      {config.outputType}
                    </span>
                  </div>
                  <h3 className="font-semibold text-white group-hover:text-sky-200 transition-colors mb-1">
                    {meta.displayName}
                  </h3>
                  <p className="text-xs text-faded mb-3 line-clamp-2">{meta.description}</p>
                  <div className="flex items-center gap-1 text-xs text-sky-300 group-hover:text-sky-200">
                    <span>{t('convertNow')}</span>
                    <svg
                      className="w-3 h-3 group-hover:translate-x-0.5 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass-card p-8 md:p-12 border-sky-400/30">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 font-display">
              {t('ctaTitle')}
            </h2>
            <p className="text-lg text-faded mb-8">{t('ctaSubtitle')}</p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-sky-500 to-sky-600 text-white font-semibold hover:from-sky-400 hover:to-sky-500 transition-all shadow-lg shadow-sky-500/25"
            >
              {t('ctaButton')}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Link>
            <p className="text-sm text-faded mt-4">{t('noCardRequired')}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
