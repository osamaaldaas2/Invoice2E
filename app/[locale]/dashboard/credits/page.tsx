'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import DashboardLayout from '@/components/layout/DashboardLayout';
import VoucherRedeemForm from '@/components/forms/VoucherRedeemForm';
import CreditHistory from '@/components/dashboard/CreditHistory';
import { logger } from '@/lib/logger';

export default function CreditsPage() {
    const t = useTranslations('credits');
    const router = useRouter();
    const locale = useLocale();
    const [credits, setCredits] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCredits = async () => {
            try {
                const response = await fetch('/api/invoices/analytics?type=stats');
                if (response.ok) {
                    const data = await response.json();
                    setCredits(data.statistics?.availableCredits ?? 0);
                }
            } catch (error) {
                logger.error('Failed to fetch credits', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCredits();
        const handleCreditsUpdate = () => fetchCredits();
        window.addEventListener('credits-updated', handleCreditsUpdate);
        return () => window.removeEventListener('credits-updated', handleCreditsUpdate);
    }, []);

    return (
        <DashboardLayout>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white font-display">
                    {t('pageTitle')}
                </h1>
                <p className="mt-2 text-faded">
                    {t('pageDescription')}
                </p>
            </div>

            {/* Current Balance Card */}
            <div className="glass-card p-6">
                <h3 className="text-lg font-semibold text-white font-display mb-4">
                    {t('yourBalance')}
                </h3>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-4xl font-bold bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
                            {loading ? '...' : credits ?? 0}
                        </div>
                        <div className="text-sm text-faded">
                            {t('creditsAvailable')}
                        </div>
                    </div>
                    <div className="text-6xl">💳</div>
                </div>
                <button
                    type="button"
                    onClick={() => router.push(`/${locale}/pricing`)}
                    className="mt-4 w-full px-6 py-3 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white font-semibold rounded-full hover:brightness-110 transition-colors"
                >
                    {t('purchaseCredits')}
                </button>
            </div>

            <div className="mt-6">
                <VoucherRedeemForm />
            </div>

            <div className="mt-6">
                <CreditHistory locale={locale} />
            </div>
        </DashboardLayout>
    );
}

