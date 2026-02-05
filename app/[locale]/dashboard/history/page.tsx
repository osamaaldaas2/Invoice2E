'use client';

import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ConversionHistory from '@/components/dashboard/ConversionHistory';

export default function HistoryPage() {
    const t = useTranslations('history');

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
            <ConversionHistory limit={20} showPagination={true} />
        </DashboardLayout>
    );
}
