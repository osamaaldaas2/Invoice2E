'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordForm() {
    const t = useTranslations('auth');
    const tErr = useTranslations('errors');
    const tCommon = useTranslations('common');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [email, setEmail] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || tErr('sendResetFailed'));
                return;
            }

            setSuccess(true);
        } catch {
            setError(tErr('generic'));
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="text-center space-y-4">
                <div className="p-4 glass-panel border border-emerald-400/30 rounded-xl text-emerald-200 text-sm">
                    {t('reset_link_sent')}
                </div>
                <Link
                    href="/login"
                    className="text-sky-200 hover:text-sky-100 font-medium text-sm"
                >
                    {tCommon('backToLogin')}
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6" aria-label="Forgot password form">
            <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
                    {t('email')}
                </label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    aria-required="true"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
                    placeholder="you@example.com"
                    disabled={loading}
                    autoComplete="email"
                />
            </div>

            {error && (
                <div
                    role="alert"
                    aria-live="polite"
                    className="p-3 glass-panel border border-rose-400/30 rounded-xl text-rose-200 text-sm"
                >
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="w-full px-4 py-3 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white font-semibold rounded-full hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                {loading ? (
                    <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" aria-hidden="true" />
                        <span>{t('sending')}</span>
                    </span>
                ) : (
                    t('send_reset_link')
                )}
            </button>

            <div className="text-center">
                <Link
                    href="/login"
                    className="text-sky-200 hover:text-sky-100 font-medium text-sm"
                >
                    {tCommon('backToLogin')}
                </Link>
            </div>
        </form>
    );
}
