'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface CreditPackage {
    id: string;
    name: string;
    credits: number;
    price: number;
    currency: string;
    discount: number;
    pricePerCredit: number;
}

export default function CreditPurchaseForm() {
    const t = useTranslations('credits');
    const [packages, setPackages] = useState<CreditPackage[]>([]);
    const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal'>('stripe');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [packagesLoading, setPackagesLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const loadPackages = async () => {
            try {
                const response = await fetch('/api/payments/create-checkout');
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data?.error || 'Failed to load packages');
                }

                if (!cancelled) {
                    setPackages(data.packages || []);
                    setPackagesLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load packages');
                    setPackagesLoading(false);
                }
            }
        };

        void loadPackages();

        return () => {
            cancelled = true;
        };
    }, []);

    const handlePurchase = async () => {
        if (!selectedPackage) return;

        try {
            setLoading(true);
            setError(null);

            const response = await fetch('/api/payments/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    packageId: selectedPackage,
                    method: paymentMethod,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Payment failed');
            }

            // Redirect to payment page
            window.location.href = data.url;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Payment failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card p-6">
            <h2 className="text-xl font-bold text-white mb-6 font-display">
                {t('purchaseCredits')}
            </h2>

            {error && (
                <div className="mb-4 p-4 glass-panel text-rose-200 rounded-lg border border-rose-400/30">
                    {error}
                </div>
            )}

            {/* Package Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {packagesLoading ? (
                    [...Array(4)].map((_, index) => (
                        <div
                            key={`pkg-skeleton-${index}`}
                            className="p-4 rounded-2xl border border-white/10 bg-white/5 animate-pulse h-32"
                        />
                    ))
                ) : (
                    packages.map((pkg) => (
                        <button
                            key={pkg.id}
                            onClick={() => setSelectedPackage(pkg.id)}
                            className={`relative p-4 rounded-2xl border transition-all text-left ${
                                selectedPackage === pkg.id
                                    ? 'border-sky-300/40 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent shadow-[0_0_24px_rgba(56,189,248,0.2)]'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}
                        >
                            {pkg.discount > 0 && (
                                <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full">
                                    -{pkg.discount}%
                                </span>
                            )}
                            <div className="text-2xl font-bold text-white font-display">
                                {pkg.credits}
                            </div>
                            <div className="text-sm text-faded mb-2">
                                {t('credits')}
                            </div>
                            <div className="text-lg font-semibold text-sky-200">
                                €{pkg.price.toFixed(2)}
                            </div>
                            <div className="text-xs text-faded">
                                €{pkg.pricePerCredit.toFixed(2)} / {t('credit')}
                            </div>
                        </button>
                    ))
                )}
            </div>

            {/* Payment Method Selection */}
            <div className="mb-6">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                    {t('paymentMethod')}
                </label>
                <div className="flex gap-4">
                    <button
                        onClick={() => setPaymentMethod('stripe')}
                        className={`flex-1 p-4 rounded-2xl border flex items-center justify-center gap-2 transition-all ${
                            paymentMethod === 'stripe'
                                ? 'border-sky-300/40 bg-gradient-to-br from-sky-500/10 to-transparent'
                                : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                    >
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
                        </svg>
                        <span className="font-medium text-slate-100">Stripe</span>
                    </button>
                    <button
                        onClick={() => setPaymentMethod('paypal')}
                        className={`flex-1 p-4 rounded-2xl border flex items-center justify-center gap-2 transition-all ${
                            paymentMethod === 'paypal'
                                ? 'border-sky-300/40 bg-gradient-to-br from-sky-500/10 to-transparent'
                                : 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                    >
                        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="#003087">
                            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106z" />
                        </svg>
                        <span className="font-medium text-slate-100">PayPal</span>
                    </button>
                </div>
            </div>

            {/* Purchase Button */}
            <button
                onClick={handlePurchase}
                disabled={!selectedPackage || loading || packagesLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 hover:brightness-110 text-white font-semibold rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        {t('processing')}
                    </span>
                ) : (
                    t('purchaseNow')
                )}
            </button>
        </div>
    );
}

