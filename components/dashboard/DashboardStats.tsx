'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface Stats {
    totalConversions: number;
    successfulConversions: number;
    failedConversions: number;
    successRate: number;
    averageProcessingTime: number;
    thisMonthConversions: number;
    creditsRemaining: number;
}

export default function DashboardStats() {
    const t = useTranslations('dashboard');
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/invoices/analytics?period=all');
            if (!response.ok) throw new Error('Failed to fetch stats');
            const data = await response.json();
            setStats(data.stats);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load stats');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="glass-card p-6 animate-pulse">
                        <div className="h-4 bg-white/10 rounded w-1/2 mb-2"></div>
                        <div className="h-8 bg-white/10 rounded w-3/4"></div>
                    </div>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="glass-panel text-red-200 p-4 rounded-xl border border-red-400/30">
                {error}
            </div>
        );
    }

    const statCards = [
        {
            label: t('totalConversions'),
            value: stats?.totalConversions || 0,
            icon: '📄',
            color: 'from-blue-500 to-blue-600',
        },
        {
            label: t('successRate'),
            value: `${stats?.successRate || 0}%`,
            icon: '✅',
            color: 'from-green-500 to-green-600',
        },
        {
            label: t('thisMonth'),
            value: stats?.thisMonthConversions || 0,
            icon: '📅',
            color: 'from-purple-500 to-purple-600',
        },
        {
            label: t('creditsRemaining'),
            value: stats?.creditsRemaining || 0,
            icon: '💳',
            color: 'from-amber-500 to-amber-600',
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card, index) => (
                <div
                    key={index}
                    className="glass-card p-6 hover:shadow-[0_20px_50px_-30px_rgba(2,6,23,0.8)] transition-shadow"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-faded text-sm font-medium">
                            {card.label}
                        </span>
                        <span className="text-2xl">{card.icon}</span>
                    </div>
                    <div className={`text-3xl font-bold bg-gradient-to-r ${card.color} bg-clip-text text-transparent`}>
                        {card.value}
                    </div>
                </div>
            ))}
        </div>
    );
}
