'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function LocaleError({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const t = useTranslations('errorPages.serverError');

    return (
        <div className="flex-1 flex items-center justify-center px-4 py-24">
            <div className="glass-card p-6 sm:p-8 md:p-12 max-w-md w-full text-center space-y-6">
                <div className="text-5xl sm:text-7xl font-bold font-display gradient-text">
                    500
                </div>
                <h1 className="text-2xl font-semibold text-white font-display">
                    {t('title')}
                </h1>
                <p className="text-faded text-sm">
                    {t('description')}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={reset}
                        className="px-6 py-3 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white font-semibold rounded-full hover:brightness-110 transition-all"
                    >
                        {t('tryAgain')}
                    </button>
                    <Link
                        href="/"
                        className="px-6 py-3 border border-white/15 text-slate-200 rounded-full hover:bg-white/5 transition-colors"
                    >
                        {useTranslations('errorPages.notFound')('backHome')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
