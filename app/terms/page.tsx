import { useTranslations } from 'next-intl';

const SECTION_COUNT = 12;

export default function TermsPage(): React.ReactElement {
  const t = useTranslations('terms');

  const sections = Array.from({ length: SECTION_COUNT }, (_, i) => i + 1);

  return (
    <div className="min-h-screen py-16">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="glass-card p-8 md:p-12">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-8 font-display">
            {t('title')}
          </h1>

          <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
            <p className="text-faded text-sm">{t('lastUpdated')}</p>

            {sections.map((n) => (
              <section key={n}>
                <h2 className="text-xl font-semibold text-white mb-3">{t(`section${n}Title`)}</h2>
                <p className="whitespace-pre-line">{t(`section${n}Content`)}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
