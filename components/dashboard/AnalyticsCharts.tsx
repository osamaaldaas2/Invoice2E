'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';

interface ChartData {
    date: string;
    count: number;
}

interface Props {
    period?: '7d' | '30d' | '90d';
}

export default function AnalyticsCharts({ period = '30d' }: Props) {
    const t = useTranslations('analytics');
    const [chartData, setChartData] = useState<ChartData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPeriod, setSelectedPeriod] = useState(period);
    const [error, setError] = useState<string | null>(null);

    const fetchChartData = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/invoices/analytics?period=${selectedPeriod}`);
            if (!response.ok) throw new Error('Failed to fetch analytics');
            const data = await response.json();
            setChartData(data.chartData || []);
            setError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch chart data';
            setError(message);
            logger.error('Failed to fetch chart data', err);
        } finally {
            setLoading(false);
        }
    }, [selectedPeriod]);

    useEffect(() => {
        fetchChartData();
    }, [fetchChartData]);

    const maxCount = Math.max(...chartData.map(d => d.count), 1);

    if (loading) {
        return (
            <div className="glass-card p-6">
                <div className="animate-pulse">
                    <div className="h-6 bg-white/10 rounded w-1/4 mb-4"></div>
                    <div className="h-64 bg-white/10 rounded"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card overflow-hidden">
            {error ? (
                <div className="mx-4 mt-4 glass-panel text-rose-200 p-3 rounded-lg border border-rose-400/30" role="alert">
                    {error}
                </div>
            ) : null}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white font-display">
                    {t('conversionTrend')}
                </h3>
                <div className="flex gap-2">
                    {(['7d', '30d', '90d'] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setSelectedPeriod(p)}
                            className={`px-3 py-1 text-sm rounded-full transition-colors border ${selectedPeriod === p
                                    ? 'bg-gradient-to-r from-sky-400/20 via-blue-500/10 to-transparent text-sky-100 border-sky-300/30'
                                    : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
                                }`}
                        >
                            {p === '7d' ? t('week') : p === '30d' ? t('month') : t('quarter')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4">
                {chartData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-faded">
                        {t('noData')}
                    </div>
                ) : (
                    <div className="h-64 flex items-end gap-1">
                        {chartData.map((item, index) => {
                            const height = (item.count / maxCount) * 100;
                            return (
                                <div
                                    key={index}
                                    className="flex-1 flex flex-col items-center group"
                                >
                                    <div className="relative w-full flex justify-center mb-1">
                                        <div
                                            className="absolute bottom-0 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-xs px-2 py-1 rounded -translate-y-full whitespace-nowrap border border-white/10"
                                        >
                                            {item.count} {t('conversions')}
                                        </div>
                                    </div>
                                    <div
                                        className="w-full bg-gradient-to-t from-sky-500 to-blue-400 rounded-t transition-all duration-300 hover:from-sky-400 hover:to-blue-500"
                                        style={{ height: `${Math.max(height, 2)}%` }}
                                    />
                                    <span className="text-xs text-slate-400 mt-1 truncate w-full text-center">
                                        {new Date(item.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="px-4 pb-4 flex items-center justify-center gap-4 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-gradient-to-r from-sky-500 to-blue-400"></div>
                    <span>{t('dailyConversions')}</span>
                </div>
            </div>
        </div>
    );
}
