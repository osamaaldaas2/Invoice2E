import { getTranslations } from 'next-intl/server';
import { PricingCards } from '@/components/payment/PricingCards';

export default async function PricingPage() {
    const t = await getTranslations('pricing');

    return (
        <div className="container mx-auto px-4 py-12">
            <div className="text-center mb-12">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-white font-display">
                    {t('title')}
                </h1>
                <p className="text-lg text-faded max-w-2xl mx-auto">
                    {t('subtitle')}
                </p>
            </div>

            <PricingCards />

            <div className="mt-12 text-center text-sm text-faded">
                <p>
                    🔒 {t('securePayment')}
                </p>
                <p className="mt-2">
                    {t('noSubscriptions')}
                </p>
            </div>
        </div>
    );
}
