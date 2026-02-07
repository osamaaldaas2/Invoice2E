'use client';

import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/layout/DashboardLayout';
import TemplateManager from '@/components/forms/TemplateManager';

export default function TemplatesPage() {
    const t = useTranslations('templates');

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
            <TemplateManager />
        </DashboardLayout>
    );
}
