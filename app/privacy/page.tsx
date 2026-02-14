import { useTranslations } from 'next-intl';

export default function PrivacyPage(): React.ReactElement {
  const t = useTranslations('privacy');

  return (
    <div className="min-h-screen py-16">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="glass-card p-8 md:p-12">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-8 font-display">
            {t('title')}
          </h1>

          <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
            <p className="text-faded text-sm">{t('lastUpdated')}</p>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">{t('section1Title')}</h2>
              <p>{t('section1Content')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">{t('section2Title')}</h2>
              <p>{t('section2Content')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">{t('section3Title')}</h2>
              <p>{t('section3Content')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">{t('section4Title')}</h2>
              <p>{t('section4Content')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white mb-3">{t('section5Title')}</h2>
              <p>{t('section5Content')}</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
