'use client';

import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function CheckoutCancelPage() {
    const routeParams = useParams();
    const locale = (routeParams?.locale as string) || 'en';
    const isGerman = locale === 'de';
    const router = useRouter();

    return (
        <div className="container mx-auto px-4 py-24 text-center max-w-lg">
            <div className="text-6xl mb-6">❌</div>

            <h1 className="text-3xl font-bold text-white font-display mb-4">
                {isGerman ? 'Zahlung abgebrochen' : 'Payment Cancelled'}
            </h1>

            <p className="text-lg text-faded mb-8">
                {isGerman
                    ? 'Die Zahlung wurde abgebrochen. Es wurden keine Kosten berechnet.'
                    : 'The payment was cancelled. No charges were made.'}
            </p>

            <div className="space-y-4">
                <Button
                    className="w-full"
                    onClick={() => router.push(`/${locale}/pricing`)}
                >
                    {isGerman ? 'Zurück zur Preisseite' : 'Back to Pricing'}
                </Button>

                <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => router.push(`/${locale}/dashboard`)}
                >
                    {isGerman ? 'Zum Dashboard' : 'Go to Dashboard'}
                </Button>
            </div>
        </div>
    );
}
