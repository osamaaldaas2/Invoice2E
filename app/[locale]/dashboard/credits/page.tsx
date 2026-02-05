'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/layout/DashboardLayout';
import CreditPurchaseForm from '@/components/forms/CreditPurchaseForm';

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
    }, []);

    return (
        <DashboardLayout>
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {t('pageTitle')}
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                    {t('pageDescription')}
                </p>
            </div>

            <CreditPurchaseForm />

            {/* Current Balance Card */}
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    {t('yourBalance')}
                </h3>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            {loading ? '...' : credits ?? 0}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {t('creditsAvailable')}
                        </div>
                    </div>
                    <div className="text-6xl">💳</div>
                </div>
            </div>
        </DashboardLayout>
    );
}

