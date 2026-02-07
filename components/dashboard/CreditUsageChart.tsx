'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type CreditUsage = {
    availableCredits: number;
    usedCreditsThisMonth: number;
    usedCreditsTotal: number;
};

export default function CreditUsageChart() {
    const t = useTranslations('analytics');
    const [usage, setUsage] = useState<CreditUsage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const fetchUsage = async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/credits/usage', { cache: 'no-store' });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'Failed to load credit usage');
                }
                if (mounted) {
                    setUsage({
                        availableCredits: data.availableCredits ?? 0,
                        usedCreditsThisMonth: data.usedCreditsThisMonth ?? 0,
                        usedCreditsTotal: data.usedCreditsTotal ?? 0,
                    });
                }
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err.message : 'Failed to load credit usage');
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        fetchUsage();
        return () => {
            mounted = false;
        };
    }, []);

    if (loading) {
        return (
            <div className="glass-card p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-5 bg-white/10 rounded w-1/3" />
                    <div className="h-48 bg-white/10 rounded-2xl" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="glass-panel text-rose-200 p-4 rounded-xl border border-rose-400/30">
                {error}
            </div>
        );
    }

    const used = usage?.usedCreditsThisMonth ?? 0;
    const remaining = usage?.availableCredits ?? 0;
    const total = used + remaining;
    const percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

    return (
        <div className="glass-card p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-white font-display">
                        {t('creditUsageTitle')}
                    </h3>
                    <p className="text-sm text-faded mt-1">
                        {t('creditUsageSubtitle')}
                    </p>
                </div>
                <span className="chip text-amber-100 border-amber-400/40">
                    {t('thisMonth')}
                </span>
            </div>

            <div className="mt-6 flex flex-col lg:flex-row items-center gap-6">
                <div className="relative h-44 w-44">
                    <div
                        className="h-44 w-44 rounded-full flex items-center justify-center"
                        style={{
                            background: `conic-gradient(#f59e0b 0 ${percent}%, rgba(255,255,255,0.08) ${percent}% 100%)`,
                        }}
                    >
                        <div className="h-32 w-32 rounded-full bg-slate-950/90 border border-white/10 flex flex-col items-center justify-center">
                            <span className="text-2xl font-bold text-white">{percent}%</span>
                            <span className="text-xs text-faded">{t('used')}</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between gap-4 bg-white/5 rounded-xl px-4 py-3 border border-white/10">
                        <div className="flex items-center gap-3">
                            <span className="h-3 w-3 rounded-full bg-amber-400" />
                            <span className="text-sm text-slate-200">{t('used')}</span>
                        </div>
                        <span className="text-sm font-semibold text-amber-200">{used}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 bg-white/5 rounded-xl px-4 py-3 border border-white/10">
                        <div className="flex items-center gap-3">
                            <span className="h-3 w-3 rounded-full bg-emerald-400" />
                            <span className="text-sm text-slate-200">{t('remaining')}</span>
                        </div>
                        <span className="text-sm font-semibold text-emerald-200">{remaining}</span>
                    </div>
                    <div className="text-xs text-faded">
                        {t('totalCreditsLabel', { total })}
                    </div>
                </div>
            </div>
        </div>
    );
}

