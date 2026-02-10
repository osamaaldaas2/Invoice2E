'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

export default function CheckoutSuccessPage() {
    const t = useTranslations('checkout');
    const searchParams = useSearchParams();
    const router = useRouter();

    const sessionId = searchParams.get('session_id');
    const orderId = searchParams.get('orderId');

    const [verifying, setVerifying] = useState(true);
    const [credits, setCredits] = useState<number | null>(null);
    const [verificationError, setVerificationError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        const verifyPayment = async () => {
            try {
                const response = await fetch('/api/payments/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ sessionId, orderId }),
                    signal: controller.signal,
                });

                if (controller.signal.aborted) return;
                const data = await response.json();

                if (data.success) {
                    setCredits(data.credits);
                    setVerificationError(null);
                } else {
                    setVerificationError(data.error || 'Payment verification could not be completed');
                }
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') return;
                logger.error('Payment verification failed', error);
                setVerificationError('Payment verification failed. Your credits may still be added shortly.');
            } finally {
                if (!controller.signal.aborted) {
                    setVerifying(false);
                }
            }
        };

        if (sessionId || orderId) {
            verifyPayment();
        } else {
            setVerifying(false);
        }

        return () => controller.abort();
    }, [sessionId, orderId]);

    if (verifying) {
        return (
            <div className="container mx-auto px-4 py-24 text-center">
                <div className="animate-spin text-4xl mb-4">{'\u23f3'}</div>
                <p className="text-lg">
                    {t('verifying')}
                </p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-24 text-center max-w-lg">
            <div className="text-4xl sm:text-6xl mb-6">{'\u2705'}</div>

            <h1 className="text-3xl font-bold text-white font-display mb-4">
                {t('successTitle')}
            </h1>

            {credits && (
                <p className="text-lg text-faded mb-8">
                    {t('creditsAdded', { credits })}
                </p>
            )}

            {verificationError ? (
                <div className="mb-6 glass-panel border border-rose-400/30 rounded-xl p-3 text-rose-200" role="alert">
                    {verificationError}
                </div>
            ) : null}

            <div className="space-y-4">
                <Button
                    className="w-full"
                    onClick={() => router.push('/dashboard')}
                >
                    {t('goToDashboard')}
                </Button>

                <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => router.push('/dashboard')}
                >
                    {t('convertInvoice')}
                </Button>
            </div>

            <p className="text-sm text-faded mt-8">
                {t('receiptSent')}
            </p>
        </div>
    );
}
