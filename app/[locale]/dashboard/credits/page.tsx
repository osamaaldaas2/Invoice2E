'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CreditPurchaseForm from '@/components/forms/CreditPurchaseForm';
import VoucherRedeemForm from '@/components/forms/VoucherRedeemForm';

export default function CreditsPage() {
    const t = useTranslations('credits');
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
                console.error('Failed to fetch credits:', error);
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

            <CreditPurchaseForm />

            <div className="mt-6">
                <VoucherRedeemForm />
            </div>

            {/* Current Balance Card */}
            <div className="mt-6 glass-card p-6">
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
            </div>
        </DashboardLayout>
    );
}

