'use client';

import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/layout/DashboardLayout';
import BulkUploadForm from '@/components/forms/BulkUploadForm';

export default function BulkUploadPage() {
    const t = useTranslations('bulkUpload');

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

            <BulkUploadForm />

            {/* Instructions */}
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    {t('instructions')}
                </h3>
                <ul className="space-y-2 text-gray-600 dark:text-gray-400">
                    <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        {t('instruction1')}
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        {t('instruction2')}
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        {t('instruction3')}
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-green-500">✓</span>
                        {t('instruction4')}
                    </li>
                </ul>
            </div>
        </DashboardLayout>
    );
}
