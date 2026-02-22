import type { Metadata } from 'next';
import HeroActions from '@/components/home/HeroActions';
import Validation3DIllustration from '@/components/validation/Validation3DIllustration';
import ValidationPipeline from '@/components/home/ValidationPipeline';
import Upload3DIcon from '@/components/home/Upload3DIcon';
import AI3DIcon from '@/components/home/AI3DIcon';
import Success3DIcon from '@/components/home/Success3DIcon';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default async function Home() {
  const t = await getTranslations('home');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Invoice2E',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: 'https://invoice2e.eu',
    description:
      'AI-powered invoice conversion to XRechnung, ZUGFeRD, and other e-invoice formats.',
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Background Effects */}
      <div className="absolute -top-40 left-0 h-96 w-96 rounded-full bg-sky-500/20 blur-[160px]" />
      <div className="absolute -top-20 right-0 h-80 w-80 rounded-full bg-orange-500/20 blur-[140px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-emerald-500/10 blur-[180px]" />

      <main className="container mx-auto px-4 py-12 md:py-20 relative z-10">
        {/* Hero Section */}
        <div className="max-w-4xl mx-auto text-center mb-20 md:mb-32">
          <span className="chip mb-6">{t('chip')}</span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-6 font-display leading-tight">
            {t('heading')} <span className="gradient-text">{t('headingHighlight')}</span>
          </h1>
          <p className="text-lg md:text-xl text-faded mb-8 max-w-2xl mx-auto">{t('subtitle')}</p>

          {/* Value Props */}
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 mb-10 text-sm md:text-base">
            <div className="flex items-center gap-2 text-emerald-200">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{t('valueProp1')}</span>
            </div>
            <div className="flex items-center gap-2 text-sky-200">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{t('valueProp2')}</span>
            </div>
            <div className="flex items-center gap-2 text-violet-200">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{t('valueProp3')}</span>
            </div>
          </div>

          <HeroActions />

          <p className="text-sm text-faded mt-4">{t('noCardRequired')}</p>
        </div>

        {/* How It Works - Simple Version */}
        <div className="max-w-6xl mx-auto mb-24 md:mb-32">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4 font-display">
              {t('howItWorksTitle')}
            </h2>
            <p className="text-lg text-faded max-w-2xl mx-auto">{t('howItWorksSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            <div className="glass-card p-6 md:p-8 text-white hover:border-sky-400/40 transition-all duration-300 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 rounded-full bg-gradient-to-br from-sky-400/30 to-sky-600/30 border-2 border-sky-400/50 flex items-center justify-center text-white font-bold text-lg backdrop-blur-sm">
                1
              </div>
              <div className="mb-6 -mt-4">
                <Upload3DIcon />
              </div>
              <h3 className="text-xl font-semibold mb-3 font-display">{t('featureUploadTitle')}</h3>
              <p className="text-faded leading-relaxed mb-4">{t('featureUploadDesc')}</p>
              <div className="text-xs text-sky-200 bg-sky-500/10 rounded-lg px-3 py-2">
                {t('uploadFormats')}
              </div>
            </div>

            <div className="glass-card p-6 md:p-8 text-white hover:border-violet-400/40 transition-all duration-300 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 rounded-full bg-gradient-to-br from-violet-400/30 to-violet-600/30 border-2 border-violet-400/50 flex items-center justify-center text-white font-bold text-lg backdrop-blur-sm">
                2
              </div>
              <div className="mb-6 -mt-4">
                <AI3DIcon />
              </div>
              <h3 className="text-xl font-semibold mb-3 font-display">{t('featureAITitle')}</h3>
              <p className="text-faded leading-relaxed mb-4">{t('featureAIDesc')}</p>
              <div className="text-xs text-violet-200 bg-violet-500/10 rounded-lg px-3 py-2">
                {t('reviewEditable')}
              </div>
            </div>

            <div className="glass-card p-6 md:p-8 text-white hover:border-emerald-400/40 transition-all duration-300 relative">
              <div className="absolute -top-4 -left-4 w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400/30 to-emerald-600/30 border-2 border-emerald-400/50 flex items-center justify-center text-white font-bold text-lg backdrop-blur-sm">
                3
              </div>
              <div className="mb-6 -mt-4">
                <Success3DIcon />
              </div>
              <h3 className="text-xl font-semibold mb-3 font-display">
                {t('featureXRechnungTitle')}
              </h3>
              <p className="text-faded leading-relaxed mb-4">{t('featureXRechnungDesc')}</p>
              <div className="text-xs text-emerald-200 bg-emerald-500/10 rounded-lg px-3 py-2">
                {t('instantDownload')}
              </div>
            </div>
          </div>
        </div>

        {/* Trust & Compliance */}
        <div className="max-w-6xl mx-auto mb-24 md:mb-32">
          <div className="glass-card p-8 md:p-12">
            <h3 className="text-xl md:text-2xl font-bold text-white mb-8 text-center font-display">
              {t('trustTitle')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-sky-200 mb-3">100%</div>
                <div className="text-faded font-medium mb-2">{t('trustCompliance')}</div>
                <div className="text-xs text-faded">{t('trustComplianceDesc')}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-emerald-200 mb-3">EN 16931</div>
                <div className="text-faded font-medium mb-2">{t('trustStandard')}</div>
                <div className="text-xs text-faded">{t('trustStandardDesc')}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-violet-200 mb-3">v3.0.2</div>
                <div className="text-faded font-medium mb-2">{t('trustVersion')}</div>
                <div className="text-xs text-faded">{t('trustVersionDesc')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Problem/Solution Section */}
        <div className="max-w-6xl mx-auto mb-24 md:mb-32">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
            {/* Problem */}
            <div className="glass-card p-6 md:p-8 border-rose-400/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-200">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white font-display">{t('problemTitle')}</h3>
              </div>
              <ul className="space-y-3 text-faded">
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 mt-1">•</span>
                  <span>{t('problem1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 mt-1">•</span>
                  <span>{t('problem2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 mt-1">•</span>
                  <span>{t('problem3')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-400 mt-1">•</span>
                  <span>{t('problem4')}</span>
                </li>
              </ul>
            </div>

            {/* Solution */}
            <div className="glass-card p-6 md:p-8 border-emerald-400/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-200">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white font-display">{t('solutionTitle')}</h3>
              </div>
              <ul className="space-y-3 text-slate-200">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">✓</span>
                  <span>{t('solution1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">✓</span>
                  <span>{t('solution2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">✓</span>
                  <span>{t('solution3')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-1">✓</span>
                  <span>{t('solution4')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Who Is This For */}
        <div className="max-w-6xl mx-auto mb-24 md:mb-32">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4 font-display">
              {t('whoIsThisForTitle')}
            </h2>
            <p className="text-lg text-faded max-w-2xl mx-auto">{t('whoIsThisForSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-6 text-center">
              <div className="text-4xl mb-4">👤</div>
              <h3 className="text-lg font-semibold text-white mb-2">{t('audience1Title')}</h3>
              <p className="text-sm text-faded">{t('audience1Desc')}</p>
            </div>
            <div className="glass-card p-6 text-center">
              <div className="text-4xl mb-4">🏢</div>
              <h3 className="text-lg font-semibold text-white mb-2">{t('audience2Title')}</h3>
              <p className="text-sm text-faded">{t('audience2Desc')}</p>
            </div>
            <div className="glass-card p-6 text-center">
              <div className="text-4xl mb-4">🧮</div>
              <h3 className="text-lg font-semibold text-white mb-2">{t('audience3Title')}</h3>
              <p className="text-sm text-faded">{t('audience3Desc')}</p>
            </div>
          </div>
        </div>

        {/* Pricing Preview */}
        <div className="max-w-4xl mx-auto mb-24 md:mb-32">
          <div className="glass-card p-8 md:p-12 border-sky-400/30 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 font-display">
              {t('pricingTitle')}
            </h2>
            <p className="text-lg text-faded mb-8">{t('pricingSubtitle')}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/5 rounded-xl p-6">
                <div className="text-3xl font-bold text-sky-200 mb-2">{t('price1')}</div>
                <div className="text-sm text-faded mb-2">{t('price1Conversions')}</div>
                <div className="text-xs text-faded">{t('price1Validity')}</div>
              </div>
              <div className="bg-white/5 rounded-xl p-6 border-2 border-emerald-400/30">
                <div className="text-xs font-semibold text-emerald-200 mb-2">
                  {t('mostPopular')}
                </div>
                <div className="text-3xl font-bold text-emerald-200 mb-2">{t('price2')}</div>
                <div className="text-sm text-faded mb-2">{t('price2Conversions')}</div>
                <div className="text-xs text-faded">{t('price2Validity')}</div>
              </div>
              <div className="bg-white/5 rounded-xl p-6">
                <div className="text-3xl font-bold text-violet-200 mb-2">{t('price3')}</div>
                <div className="text-sm text-faded mb-2">{t('price3Conversions')}</div>
                <div className="text-xs text-faded">{t('price3Validity')}</div>
              </div>
            </div>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 bg-sky-400/20 hover:bg-sky-400/30 border border-sky-400/30 rounded-full text-sky-100 transition-all"
            >
              {t('viewAllPricing')}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </div>

        {/* Technical Deep Dive (Collapsible) */}
        <details className="max-w-7xl mx-auto mb-20">
          <summary className="cursor-pointer text-center mb-12">
            <span className="chip mb-4 inline-block">{t('validationChip')}</span>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-6 font-display">
              {t('validationTitle')}
            </h2>
            <p className="text-base text-faded max-w-3xl mx-auto mb-4">{t('validationSubtitle')}</p>
            <div className="inline-flex items-center gap-2 text-sky-200 text-sm">
              <span>{t('clickToExpand')}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </summary>

          <div className="mt-12">
            {/* 3D Illustration - Centered */}
            <div className="mb-16 max-w-2xl mx-auto">
              <Validation3DIllustration />
            </div>

            {/* Validation Pipeline Steps */}
            <div className="space-y-8">
              <ValidationPipeline />
            </div>
          </div>
        </details>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto mb-24 md:mb-32">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-4 font-display">
              {t('faqTitle')}
            </h2>
            <p className="text-lg text-faded">{t('faqSubtitle')}</p>
          </div>

          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <details key={num} className="glass-card p-6 group cursor-pointer">
                <summary className="flex items-center justify-between font-semibold text-white list-none">
                  <span>{t(`faq${num}Q`)}</span>
                  <svg
                    className="w-5 h-5 transition-transform group-open:rotate-180"
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
                <p className="mt-4 text-faded leading-relaxed">{t(`faq${num}A`)}</p>
              </details>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="max-w-4xl mx-auto text-center">
          <div className="glass-card p-8 md:p-12 border-sky-400/30">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 font-display">
              {t('ctaTitle')}
            </h2>
            <p className="text-lg text-faded mb-8 max-w-2xl mx-auto">{t('ctaSubtitle')}</p>
            <HeroActions />
            <p className="text-sm text-faded mt-6">{t('ctaFooter')}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
