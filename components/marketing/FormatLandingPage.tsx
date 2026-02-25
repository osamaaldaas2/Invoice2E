import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getFormatMetadata } from '@/lib/format-registry';
import type { FormatLandingConfig } from '@/lib/format-landing-data';
import { FORMAT_LANDING_CONFIGS } from '@/lib/format-landing-data';

interface FormatLandingPageProps {
  config: FormatLandingConfig;
}

export default async function FormatLandingPage({ config }: FormatLandingPageProps) {
  const t = await getTranslations(`formatPages.${config.i18nKey}`);
  const tCommon = await getTranslations('formatPages.common');
  const meta = getFormatMetadata(config.formatId);

  const relatedConfigs = config.relatedSlugs
    .map((slug) => FORMAT_LANDING_CONFIGS.find((c) => c.slug === slug))
    .filter(Boolean) as FormatLandingConfig[];

  // Build requirements lists from i18n (counts from config)
  const requiredFields = Array.from({ length: config.requiredFieldCount }, (_, i) =>
    t(`requirements.required.${i + 1}`)
  );
  const validationRules = Array.from({ length: config.validationRuleCount }, (_, i) =>
    t(`requirements.validation.${i + 1}`)
  );

  // Build FAQ JSON-LD
  const faqItems = Array.from({ length: config.faqCount }, (_, i) => ({
    question: t(`faq.${i + 1}.q`),
    answer: t(`faq.${i + 1}.a`),
  }));

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `Invoice2E – PDF to ${meta.displayName}`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: `https://www.invoice2e.eu/${config.slug}`,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
      description: 'Free trial available',
    },
  };

  return (
    <div className="relative overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />

      {/* Background Effects */}
      <div className="absolute -top-40 left-0 h-96 w-96 rounded-full bg-sky-500/20 blur-[160px]" />
      <div className="absolute -top-20 right-0 h-80 w-80 rounded-full bg-orange-500/20 blur-[140px]" />

      <main className="container mx-auto px-4 py-12 md:py-20 relative z-10">
        {/* Hero Section */}
        <div className="max-w-4xl mx-auto text-center mb-16 md:mb-24">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className="text-3xl">{config.flags}</span>
            <span className="chip">{meta.displayName}</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-6 font-display leading-tight">
            {t('hero.h1')}
          </h1>
          <p className="text-lg md:text-xl text-faded mb-8 max-w-2xl mx-auto">
            {t('hero.subtitle')}
          </p>

          {/* Mandatory Alert */}
          {config.hasMandatoryAlert && (
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full bg-amber-500/10 border border-amber-400/30 text-amber-200 text-sm">
              <span>⚠️</span>
              <span>{t('hero.mandatory')}</span>
            </div>
          )}

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-sky-500 to-sky-600 text-white font-semibold hover:from-sky-400 hover:to-sky-500 transition-all shadow-lg shadow-sky-500/25"
            >
              {t('hero.cta')}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all"
            >
              {tCommon('viewPricing')}
            </Link>
          </div>
          <p className="text-sm text-faded">{tCommon('noCardRequired')}</p>
        </div>

        {/* Technical Details Card */}
        <div className="max-w-4xl mx-auto mb-16 md:mb-24">
          <div className="glass-card p-8 md:p-10">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-6 font-display">
              {tCommon('technicalDetails')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-xs text-faded uppercase tracking-wider mb-1">
                  {tCommon('standard')}
                </div>
                <div className="text-white font-medium">{t('technical.standard')}</div>
              </div>
              <div>
                <div className="text-xs text-faded uppercase tracking-wider mb-1">
                  {tCommon('version')}
                </div>
                <div className="text-white font-medium">{meta.specVersion}</div>
              </div>
              <div>
                <div className="text-xs text-faded uppercase tracking-wider mb-1">
                  {tCommon('outputFormat')}
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${config.outputType === 'XML' ? 'bg-sky-400' : 'bg-emerald-400'}`}
                  />
                  <span className="text-white font-medium">
                    {config.outputType} ({meta.fileExtension})
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-faded uppercase tracking-wider mb-1">
                  {tCommon('countries')}
                </div>
                <div className="text-white font-medium">
                  {config.flags}{' '}
                  {meta.countries.length > 3
                    ? `${meta.countries.length} ${tCommon('countriesCount')}`
                    : meta.countries.join(', ')}
                </div>
              </div>
            </div>
            {config.leitwegRelevant && (
              <div className="mt-4 pt-4 border-t border-white/10 text-sm text-sky-200">
                ✓ {t('technical.leitweg')}
              </div>
            )}
          </div>
        </div>

        {/* How It Works */}
        <div className="max-w-6xl mx-auto mb-16 md:mb-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4 font-display">
              {tCommon('howItWorksTitle')}
            </h2>
            <p className="text-lg text-faded max-w-2xl mx-auto">{t('howItWorks.subtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {[
              { num: 1, color: 'sky', icon: '📄' },
              { num: 2, color: 'violet', icon: '🤖' },
              { num: 3, color: 'emerald', icon: config.outputType === 'XML' ? '📋' : '📑' },
            ].map((step) => (
              <div
                key={step.num}
                className={`glass-card p-6 md:p-8 text-white hover:border-${step.color}-400/40 transition-all duration-300 relative`}
              >
                <div
                  className={`absolute -top-4 -left-4 w-10 h-10 rounded-full bg-gradient-to-br from-${step.color}-400/30 to-${step.color}-600/30 border-2 border-${step.color}-400/50 flex items-center justify-center text-white font-bold text-lg backdrop-blur-sm`}
                >
                  {step.num}
                </div>
                <div className="text-4xl mb-4 mt-2">{step.icon}</div>
                <h3 className="text-xl font-semibold mb-3 font-display">
                  {t(`howItWorks.step${step.num}.title`)}
                </h3>
                <p className="text-faded leading-relaxed">{t(`howItWorks.step${step.num}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Requirements & Validation */}
        <div className="max-w-4xl mx-auto mb-16 md:mb-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4 font-display">
              {tCommon('requirementsTitle')}
            </h2>
            <p className="text-lg text-faded max-w-2xl mx-auto">{t('requirements.subtitle')}</p>
          </div>

          {/* Required Fields */}
          <div className="glass-card p-6 md:p-8 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-red-400">●</span> {tCommon('requiredFields')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {requiredFields.map((text, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-red-400 mt-0.5 shrink-0">✱</span>
                  <span className="text-slate-300">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Validation Rules */}
          <div className="glass-card p-6 md:p-8 mb-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-sky-400">✓</span> {tCommon('validationRules')}
            </h3>
            <div className="space-y-2">
              {validationRules.map((text, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-sky-400 mt-0.5 shrink-0">✓</span>
                  <span className="text-slate-300">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Official Source */}
          <div className="glass-card p-6 md:p-8 border-amber-400/20">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <span>📋</span> {tCommon('officialSource')}
            </h3>
            <p className="text-sm text-faded mb-3">{t('requirements.source')}</p>
            <a
              href={t('requirements.sourceUrl')}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-sky-300 hover:text-sky-200 underline underline-offset-2"
            >
              {t('requirements.sourceName')} ↗
            </a>
          </div>
        </div>

        {/* Who Needs This */}
        <div className="max-w-6xl mx-auto mb-16 md:mb-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4 font-display">
              {tCommon('whoNeedsTitle')}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: '👤', key: 'freelancer' },
              { icon: '🏢', key: 'smb' },
              { icon: '🧮', key: 'accountant' },
            ].map((persona) => (
              <div key={persona.key} className="glass-card p-6 text-center">
                <div className="text-4xl mb-4">{persona.icon}</div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {tCommon(`personas.${persona.key}.title`)}
                </h3>
                <p className="text-sm text-faded">{t(`personas.${persona.key}`)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto mb-16 md:mb-24">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4 font-display">
              {tCommon('faqTitle')}
            </h2>
          </div>
          <div className="space-y-4">
            {faqItems.map((item, idx) => (
              <details key={idx} className="glass-card p-6 group cursor-pointer">
                <summary className="flex items-center justify-between font-semibold text-white list-none">
                  <span>{item.question}</span>
                  <svg
                    className="w-5 h-5 transition-transform group-open:rotate-180 shrink-0 ml-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </summary>
                <p className="mt-4 text-faded leading-relaxed">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Related Formats */}
        {relatedConfigs.length > 0 && (
          <div className="max-w-4xl mx-auto mb-16 md:mb-24">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-6 font-display text-center">
              {tCommon('relatedFormats')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {relatedConfigs.map((related) => {
                const relatedMeta = getFormatMetadata(related.formatId);
                return (
                  <Link
                    key={related.slug}
                    href={`/${related.slug}`}
                    className="glass-card p-5 hover:border-sky-400/30 transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl">{related.flags}</span>
                      <h3 className="font-semibold text-white group-hover:text-sky-200 transition-colors">
                        {relatedMeta.displayName}
                      </h3>
                    </div>
                    <p className="text-xs text-faded">{relatedMeta.description}</p>
                    <div className="mt-3 flex items-center gap-1.5">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${related.outputType === 'XML' ? 'bg-sky-400' : 'bg-emerald-400'}`}
                      />
                      <span className="text-xs text-faded">
                        {related.outputType} ({relatedMeta.fileExtension})
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Final CTA */}
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass-card p-8 md:p-12 border-sky-400/30">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 font-display">
              {tCommon('ctaTitle')}
            </h2>
            <p className="text-lg text-faded mb-8 max-w-2xl mx-auto">{tCommon('ctaSubtitle')}</p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-sky-500 to-sky-600 text-white font-semibold hover:from-sky-400 hover:to-sky-500 transition-all shadow-lg shadow-sky-500/25"
            >
              {tCommon('ctaButton')}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Link>
            <p className="text-sm text-faded mt-4">{tCommon('noCardRequired')}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
