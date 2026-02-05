'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

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

    const fetchChartData = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/invoices/analytics?period=${selectedPeriod}`);
            if (!response.ok) throw new Error('Failed to fetch analytics');
            const data = await response.json();
            setChartData(data.chartData || []);
        } catch (err) {
            console.error('Failed to fetch chart data:', err);
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
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
                    <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('conversionTrend')}
                </h3>
                <div className="flex gap-2">
                    {(['7d', '30d', '90d'] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setSelectedPeriod(p)}
                            className={`px-3 py-1 text-sm rounded-lg transition-colors ${selectedPeriod === p
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                        >
                            {p === '7d' ? t('week') : p === '30d' ? t('month') : t('quarter')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4">
                {chartData.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
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
                                            className="absolute bottom-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded -translate-y-full whitespace-nowrap"
                                        >
                                            {item.count} {t('conversions')}
                                        </div>
                                    </div>
                                    <div
                                        className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all duration-300 hover:from-blue-600 hover:to-blue-500"
                                        style={{ height: `${Math.max(height, 2)}%` }}
                                    />
                                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate w-full text-center">
                                        {new Date(item.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="px-4 pb-4 flex items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-gradient-to-r from-blue-500 to-blue-400"></div>
                    <span>{t('dailyConversions')}</span>
                </div>
            </div>
        </div>
    );
}
