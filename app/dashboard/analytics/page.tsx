'use client';

import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/layout/DashboardLayout';
import DashboardStats from '@/components/dashboard/DashboardStats';
import AnalyticsCharts from '@/components/dashboard/AnalyticsCharts';
import CreditUsageChart from '@/components/dashboard/CreditUsageChart';

export default function AnalyticsPage() {
    const t = useTranslations('analytics');

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
            <div className="space-y-6">
                <DashboardStats />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <CreditUsageChart />
                    <AnalyticsCharts period="30d" />
                </div>
            </div>
        </DashboardLayout>
    );
}
