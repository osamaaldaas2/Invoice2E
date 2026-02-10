'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { CreditPackage } from '@/types/credit-package';
import { Button } from '@/components/ui/button';

export default function CheckoutPage() {
    const locale = useLocale();
    const t = useTranslations('checkout');
    const tp = useTranslations('pricing');
    const searchParams = useSearchParams();
    const router = useRouter();
    const packageSlug = searchParams.get('package') || 'starter';

    const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal'>('stripe');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();

        const fetchPackage = async () => {
            setError(null); // Clear stale error on re-fetch
            try {
                const response = await fetch('/api/packages', {
                    signal: controller.signal,
                });
                if (controller.signal.aborted) return;
                const data = await response.json();
                if (data.success) {
                    const pkg = data.packages.find((p: CreditPackage) => p.slug === packageSlug);
                    setSelectedPackage(pkg || null);
                }
            } catch (err) {
                if (err instanceof Error && err.name === 'AbortError') return;
                setError(t('failedToLoad'));
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        fetchPackage();
        return () => controller.abort();
    }, [packageSlug, t]);

    const handleCheckout = async () => {
        if (!selectedPackage) return;

        setProcessing(true);
        setError(null);

        try {
            const response = await fetch('/api/payments/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    packageSlug: selectedPackage.slug,
                    paymentMethod,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Checkout failed');
            }

            // Redirect to payment provider
            if (data.url) {
                window.location.href = data.url;
            } else if (data.approvalUrl) {
                window.location.href = data.approvalUrl;
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Checkout failed');
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-12 max-w-2xl">
                <div className="animate-pulse">
                    <div className="h-8 bg-white/10 rounded w-48 mb-8" />
                    <div className="h-32 bg-white/10 rounded mb-8" />
                    <div className="h-48 bg-white/10 rounded" />
                </div>
            </div>
        );
    }

    if (!selectedPackage) {
        return (
            <div className="container mx-auto px-4 py-12 text-center">
                <h1 className="text-2xl font-bold mb-4 text-white font-display">
                    {t('packageNotFound')}
                </h1>
                <Button onClick={() => router.push('/pricing')}>
                    {t('backToPricing')}
                </Button>
            </div>
        );
    }

    const getLocalizedName = () =>
        locale === 'de' && selectedPackage.name_de ? selectedPackage.name_de : selectedPackage.name;

    return (
        <div className="container mx-auto px-4 py-12 max-w-2xl">
            <h1 className="text-3xl font-bold mb-8 text-white font-display">
                {t('title')}
            </h1>

            {/* Order Summary */}
            <div className="glass-card p-6 mb-8">
                <h2 className="text-lg font-semibold mb-4 text-white font-display">
                    {t('orderSummary')}
                </h2>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="font-medium">{getLocalizedName()}</p>
                        <p className="text-sm text-faded">
                            {selectedPackage.credits} {tp('conversions')}
                        </p>
                    </div>
                    <p className="text-2xl font-bold">
                        {selectedPackage.currency === 'EUR' ? '\u20ac' : '$'}{selectedPackage.price}
                    </p>
                </div>
            </div>

            {/* Payment Method Selection */}
            <div className="glass-card p-6 mb-8">
                <h2 className="text-lg font-semibold mb-4 text-white font-display">
                    {t('paymentMethod')}
                </h2>
                <div className="space-y-3">
                    <label className="flex items-center p-4 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-colors">
                        <input
                            type="radio"
                            name="payment"
                            value="stripe"
                            checked={paymentMethod === 'stripe'}
                            onChange={() => setPaymentMethod('stripe')}
                            className="mr-3"
                        />
                        <span className="flex items-center">
                            {'\ud83d\udcb3'} {t('creditCard')}
                        </span>
                    </label>
                    <label className="flex items-center p-4 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-colors">
                        <input
                            type="radio"
                            name="payment"
                            value="paypal"
                            checked={paymentMethod === 'paypal'}
                            onChange={() => setPaymentMethod('paypal')}
                            className="mr-3"
                        />
                        <span>PayPal</span>
                    </label>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="glass-panel border border-rose-400/30 text-rose-200 p-4 rounded-lg mb-8">
                    {error}
                </div>
            )}

            {/* Pay Button */}
            <Button
                className="w-full"
                size="lg"
                onClick={handleCheckout}
                disabled={processing}
            >
                {processing ? (
                    <span className="animate-spin mr-2">{'\u23f3'}</span>
                ) : null}
                {t('payNow')} - {selectedPackage.currency === 'EUR' ? '\u20ac' : '$'}{selectedPackage.price}
            </Button>

            <p className="text-sm text-faded text-center mt-4">
                {'\ud83d\udd12'} {t('securePayment')}
            </p>
        </div>
    );
}
