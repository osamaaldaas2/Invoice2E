'use client';

import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProfileForm from '@/components/forms/ProfileForm';

export default function ProfilePage() {
    const t = useTranslations('profile');

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
            <ProfileForm />
        </DashboardLayout>
    );
}
