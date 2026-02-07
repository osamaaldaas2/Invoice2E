'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function CheckoutSuccessPage() {
    const routeParams = useParams();
    const locale = (routeParams?.locale as string) || 'en';
    const isGerman = locale === 'de';
    const searchParams = useSearchParams();
    const router = useRouter();

    const sessionId = searchParams.get('session_id');
    const orderId = searchParams.get('orderId');

    const [verifying, setVerifying] = useState(true);
    const [credits, setCredits] = useState<number | null>(null);

    useEffect(() => {
        const verifyPayment = async () => {
            try {
                const response = await fetch('/api/payments/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ sessionId, orderId }),
                });

                const data = await response.json();

                if (data.success) {
                    setCredits(data.credits);
                }
            } catch (error) {
                console.error('Verification failed:', error);
            } finally {
                setVerifying(false);
            }
        };

        if (sessionId || orderId) {
            verifyPayment();
        } else {
            // No session/order ID, just show success (webhook handles credit addition)
            setVerifying(false);
        }
    }, [sessionId, orderId]);

    if (verifying) {
        return (
            <div className="container mx-auto px-4 py-24 text-center">
                <div className="animate-spin text-4xl mb-4">⏳</div>
                <p className="text-lg">
                    {isGerman ? 'Zahlung wird verifiziert...' : 'Verifying payment...'}
                </p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-24 text-center max-w-lg">
            <div className="text-6xl mb-6">✅</div>

            <h1 className="text-3xl font-bold text-white font-display mb-4">
                {isGerman ? 'Zahlung erfolgreich!' : 'Payment Successful!'}
            </h1>

            {credits && (
                <p className="text-lg text-faded mb-8">
                    {isGerman
                        ? `${credits} Credits wurden Ihrem Konto gutgeschrieben.`
                        : `${credits} credits have been added to your account.`}
                </p>
            )}

            <div className="space-y-4">
                <Button
                    className="w-full"
                    onClick={() => router.push(`/${locale}/dashboard`)}
                >
                    {isGerman ? 'Zum Dashboard' : 'Go to Dashboard'}
                </Button>

                <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => router.push(`/${locale}/upload`)}
                >
                    {isGerman ? 'Rechnung konvertieren' : 'Convert Invoice'}
                </Button>
            </div>

            <p className="text-sm text-faded mt-8">
                {isGerman
                    ? 'Eine Quittung wurde an Ihre E-Mail gesendet.'
                    : 'A receipt has been sent to your email.'}
            </p>
        </div>
    );
}
