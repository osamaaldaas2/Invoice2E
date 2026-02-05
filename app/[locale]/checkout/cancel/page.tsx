'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface CancelPageProps {
    params: { locale: string };
}

export default function CheckoutCancelPage({ params }: CancelPageProps) {
    const isGerman = params.locale === 'de';
    const router = useRouter();

    return (
        <div className="container mx-auto px-4 py-24 text-center max-w-lg">
            <div className="text-6xl mb-6">❌</div>

            <h1 className="text-3xl font-bold mb-4">
                {isGerman ? 'Zahlung abgebrochen' : 'Payment Cancelled'}
            </h1>

            <p className="text-lg text-muted-foreground mb-8">
                {isGerman
                    ? 'Die Zahlung wurde abgebrochen. Es wurden keine Kosten berechnet.'
                    : 'The payment was cancelled. No charges were made.'}
            </p>

            <div className="space-y-4">
                <Button
                    className="w-full"
                    onClick={() => router.push(`/${params.locale}/pricing`)}
                >
                    {isGerman ? 'Zurück zur Preisseite' : 'Back to Pricing'}
                </Button>

                <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => router.push(`/${params.locale}/dashboard`)}
                >
                    {isGerman ? 'Zum Dashboard' : 'Go to Dashboard'}
                </Button>
            </div>
        </div>
    );
}
