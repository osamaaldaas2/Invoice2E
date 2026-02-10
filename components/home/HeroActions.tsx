'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useUser } from '@/lib/user-context';

export default function HeroActions() {
    const t = useTranslations('home');
    const { user } = useUser();

    if (user) {
        return (
            <div className="flex justify-center gap-4 flex-wrap">
                <Link
                    href={'/dashboard'}
                    className="px-8 py-4 rounded-full font-semibold text-base md:text-lg bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_18px_40px_-24px_rgba(56,189,248,0.7)] hover:brightness-110 transition"
                >
                    {t('goToDashboard')}
                </Link>
            </div>
        );
    }

    return (
        <div className="flex justify-center gap-4 flex-wrap">
            <Link
                href={'/signup'}
                className="px-8 py-4 rounded-full font-semibold text-base md:text-lg bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_18px_40px_-24px_rgba(56,189,248,0.7)] hover:brightness-110 transition"
            >
                {t('getStartedFree')}
            </Link>
            <Link
                href={'/login'}
                className="px-8 py-4 rounded-full font-semibold text-base md:text-lg border border-white/20 text-white bg-white/5 hover:bg-white/10 transition"
            >
                {t('cta_login')}
            </Link>
        </div>
    );
}
