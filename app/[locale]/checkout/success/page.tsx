'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface SuccessPageProps {
    params: { locale: string };
}

export default function CheckoutSuccessPage({ params }: SuccessPageProps) {
    const isGerman = params.locale === 'de';
    const searchParams = useSearchParams();
    const router = useRouter();

    const sessionId = searchParams.get('session_id');
    const orderId = searchParams.get('orderId');

    const [verifying, setVerifying] = useState(true);
    const [success, setSuccess] = useState(false);
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
                    setSuccess(true);
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
            setSuccess(true);
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

            <h1 className="text-3xl font-bold mb-4">
                {isGerman ? 'Zahlung erfolgreich!' : 'Payment Successful!'}
            </h1>

            {credits && (
                <p className="text-lg text-muted-foreground mb-8">
                    {isGerman
                        ? `${credits} Credits wurden Ihrem Konto gutgeschrieben.`
                        : `${credits} credits have been added to your account.`}
                </p>
            )}

            <div className="space-y-4">
                <Button
                    className="w-full"
                    onClick={() => router.push(`/${params.locale}/dashboard`)}
                >
                    {isGerman ? 'Zum Dashboard' : 'Go to Dashboard'}
                </Button>

                <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => router.push(`/${params.locale}/upload`)}
                >
                    {isGerman ? 'Rechnung konvertieren' : 'Convert Invoice'}
                </Button>
            </div>

            <p className="text-sm text-muted-foreground mt-8">
                {isGerman
                    ? 'Eine Quittung wurde an Ihre E-Mail gesendet.'
                    : 'A receipt has been sent to your email.'}
            </p>
        </div>
    );
}
