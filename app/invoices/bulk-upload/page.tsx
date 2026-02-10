'use client';

import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/layout/DashboardLayout';
import BulkUploadForm from '@/components/forms/BulkUploadForm';

export default function BulkUploadPage() {
    const t = useTranslations('bulkUpload');

    return (
        <DashboardLayout>
            <div className="mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-white font-display">
                    {t('pageTitle')}
                </h1>
                <p className="mt-2 text-faded">
                    {t('pageDescription')}
                </p>
            </div>

            <BulkUploadForm />

            {/* Instructions */}
            <div className="mt-6 glass-card p-4 md:p-6">
                <h3 className="text-lg font-semibold text-white font-display mb-4">
                    {t('instructions')}
                </h3>
                <ul className="space-y-2 text-faded">
                    <li className="flex items-start gap-2">
                        <span className="text-emerald-300">✓</span>
                        {t('instruction1')}
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-emerald-300">✓</span>
                        {t('instruction2')}
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-emerald-300">✓</span>
                        {t('instruction3')}
                    </li>
                    <li className="flex items-start gap-2">
                        <span className="text-emerald-300">✓</span>
                        {t('instruction4')}
                    </li>
                </ul>
            </div>
        </DashboardLayout>
    );
}
