'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/lib/toast-context';

export default function VoucherRedeemForm() {
    const t = useTranslations('credits');
    const { toast } = useToast();
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/vouchers/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || t('redeemError'));
            }

            toast({
                title: t('redeemSuccess', {
                    credits: data?.data?.creditsAdded ?? 0,
                    balance: data?.data?.newBalance ?? 0,
                }),
                variant: 'success',
            });
            setCode('');
            window.dispatchEvent(new Event('credits-updated'));
        } catch (err) {
            const message = err instanceof Error ? err.message : t('redeemError');
            setError(message);
            toast({ title: message, variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white font-display">
                {t('redeemTitle')}
            </h3>
            <p className="text-sm text-faded mt-1">
                {t('redeemDescription')}
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                <div className="flex flex-col md:flex-row gap-3">
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="flex-1 px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
                        placeholder={t('redeemPlaceholder')}
                        disabled={loading}
                        required
                    />
                    <button
                        type="submit"
                        disabled={loading || !code.trim()}
                        className="px-6 py-3 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white font-semibold rounded-full hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? t('redeeming') : t('redeemButton')}
                    </button>
                </div>

                {error && (
                    <p className="text-sm text-rose-300">{error}</p>
                )}
            </form>
        </div>
    );
}
