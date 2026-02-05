'use client';

import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/layout/DashboardLayout';
import DashboardStats from '@/components/dashboard/DashboardStats';
import AnalyticsCharts from '@/components/dashboard/AnalyticsCharts';

export default function AnalyticsPage() {
    const t = useTranslations('analytics');

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
            <div className="space-y-6">
                <DashboardStats />
                <AnalyticsCharts period="30d" />
            </div>
        </DashboardLayout>
    );
}
