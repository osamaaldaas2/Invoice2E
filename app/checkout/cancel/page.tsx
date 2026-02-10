'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function CheckoutCancelPage() {
    const t = useTranslations('checkout');
    const router = useRouter();

    return (
        <div className="container mx-auto px-4 py-24 text-center max-w-lg">
            <div className="text-4xl sm:text-6xl mb-6">{'\u274c'}</div>

            <h1 className="text-3xl font-bold text-white font-display mb-4">
                {t('cancelTitle')}
            </h1>

            <p className="text-lg text-faded mb-8">
                {t('cancelDesc')}
            </p>

            <div className="space-y-4">
                <Button
                    className="w-full"
                    onClick={() => router.push('/pricing')}
                >
                    {t('backToPricing')}
                </Button>

                <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => router.push('/dashboard')}
                >
                    {t('goToDashboard')}
                </Button>
            </div>
        </div>
    );
}
