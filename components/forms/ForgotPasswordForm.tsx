'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';

export default function ForgotPasswordForm() {
    const locale = useLocale();
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
                setError(data.error || 'Failed to send reset link');
                return;
            }

            setSuccess(true);
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="text-center space-y-4">
                <div className="p-4 glass-panel border border-emerald-400/30 rounded-xl text-emerald-200 text-sm">
                    If an account with that email exists, we&apos;ve sent a password reset link.
                    Please check your inbox.
                </div>
                <Link
                    href={`/${locale}/login`}
                    className="text-sky-200 hover:text-sky-100 font-medium text-sm"
                >
                    Back to Login
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6" aria-label="Forgot password form">
            <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">
                    Email
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
                        <span>Sending...</span>
                    </span>
                ) : (
                    'Send Reset Link'
                )}
            </button>

            <div className="text-center">
                <Link
                    href={`/${locale}/login`}
                    className="text-sky-200 hover:text-sky-100 font-medium text-sm"
                >
                    Back to Login
                </Link>
            </div>
        </form>
    );
}
