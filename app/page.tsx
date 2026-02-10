import HeroActions from '@/components/home/HeroActions';
import { getTranslations } from 'next-intl/server';

export default async function Home() {
    const t = await getTranslations('home');

    return (
        <div className="relative overflow-hidden">
            <div className="absolute -top-40 left-0 h-96 w-96 rounded-full bg-sky-500/20 blur-[160px]" />
            <div className="absolute -top-20 right-0 h-80 w-80 rounded-full bg-orange-500/20 blur-[140px]" />
            <main className="container mx-auto px-4 py-12 md:py-20">
                <div className="max-w-3xl mx-auto text-center">
                    <span className="chip mb-6">{t('chip')}</span>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold text-white mb-6 font-display">
                        {t('heading')} <span className="gradient-text">{t('headingHighlight')}</span>
                    </h1>
                    <p className="text-lg md:text-xl text-faded mb-10">
                        {t('subtitle')}
                    </p>
                    <HeroActions />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mt-12 md:mt-20">
                    <div className="glass-card p-4 md:p-6 text-white">
                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-4 text-sky-200">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4V5h12v10z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold mb-2 font-display">{t('featureUploadTitle')}</h3>
                        <p className="text-faded">
                            {t('featureUploadDesc')}
                        </p>
                    </div>

                    <div className="glass-card p-4 md:p-6 text-white">
                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-4 text-sky-200">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold mb-2 font-display">{t('featureAITitle')}</h3>
                        <p className="text-faded">
                            {t('featureAIDesc')}
                        </p>
                    </div>

                    <div className="glass-card p-4 md:p-6 text-white">
                        <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-4 text-sky-200">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold mb-2 font-display">{t('featureXRechnungTitle')}</h3>
                        <p className="text-faded">
                            {t('featureXRechnungDesc')}
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
