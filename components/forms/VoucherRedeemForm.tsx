'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function VoucherRedeemForm() {
    const t = useTranslations('credits');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

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

            setSuccess(
                t('redeemSuccess', {
                    credits: data?.data?.creditsAdded ?? 0,
                    balance: data?.data?.newBalance ?? 0,
                })
            );
            setCode('');
            window.dispatchEvent(new Event('credits-updated'));
        } catch (err) {
            setError(err instanceof Error ? err.message : t('redeemError'));
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
                    <div className="p-3 glass-panel border border-rose-400/30 rounded-xl text-rose-200 text-sm">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="p-3 glass-panel border border-emerald-400/30 rounded-xl text-emerald-200 text-sm">
                        {success}
                    </div>
                )}
            </form>
        </div>
    );
}
