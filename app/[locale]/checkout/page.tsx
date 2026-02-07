'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { CreditPackage } from '@/types/credit-package';
import { Button } from '@/components/ui/button';

export default function CheckoutPage() {
    const routeParams = useParams();
    const locale = (routeParams?.locale as string) || 'en';
    const isGerman = locale === 'de';
    const searchParams = useSearchParams();
    const router = useRouter();
    const packageSlug = searchParams.get('package') || 'starter';

    const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal'>('stripe');
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPackage = async () => {
            try {
                const response = await fetch('/api/packages');
                const data = await response.json();
                if (data.success) {
                    const pkg = data.packages.find((p: CreditPackage) => p.slug === packageSlug);
                    setSelectedPackage(pkg || null);
                }
            } catch (err) {
                setError('Failed to load package');
            } finally {
                setLoading(false);
            }
        };

        fetchPackage();
    }, [packageSlug]);

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
                    {isGerman ? 'Paket nicht gefunden' : 'Package not found'}
                </h1>
                <Button onClick={() => router.push(`/${locale}/pricing`)}>
                    {isGerman ? 'Zurück zur Preisseite' : 'Back to Pricing'}
                </Button>
            </div>
        );
    }

    const getLocalizedName = () =>
        isGerman && selectedPackage.name_de ? selectedPackage.name_de : selectedPackage.name;

    return (
        <div className="container mx-auto px-4 py-12 max-w-2xl">
            <h1 className="text-3xl font-bold mb-8 text-white font-display">
                {isGerman ? 'Kasse' : 'Checkout'}
            </h1>

            {/* Order Summary */}
            <div className="glass-card p-6 mb-8">
                <h2 className="text-lg font-semibold mb-4 text-white font-display">
                    {isGerman ? 'Bestellübersicht' : 'Order Summary'}
                </h2>
                <div className="flex justify-between items-center">
                    <div>
                        <p className="font-medium">{getLocalizedName()}</p>
                        <p className="text-sm text-faded">
                            {selectedPackage.credits} {isGerman ? 'Konvertierungen' : 'conversions'}
                        </p>
                    </div>
                    <p className="text-2xl font-bold">
                        {selectedPackage.currency === 'EUR' ? '€' : '$'}{selectedPackage.price}
                    </p>
                </div>
            </div>

            {/* Payment Method Selection */}
            <div className="glass-card p-6 mb-8">
                <h2 className="text-lg font-semibold mb-4 text-white font-display">
                    {isGerman ? 'Zahlungsmethode' : 'Payment Method'}
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
                            💳 {isGerman ? 'Kreditkarte' : 'Credit Card'}
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
                    <span className="animate-spin mr-2">⏳</span>
                ) : null}
                {isGerman ? 'Jetzt bezahlen' : 'Pay Now'} - {selectedPackage.currency === 'EUR' ? '€' : '$'}{selectedPackage.price}
            </Button>

            <p className="text-sm text-faded text-center mt-4">
                🔒 {isGerman ? 'Sichere Zahlung' : 'Secure payment'}
            </p>
        </div>
    );
}
