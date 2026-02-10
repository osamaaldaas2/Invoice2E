'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations('auth');
    const tErr = useTranslations('errors');
    const tCommon = useTranslations('common');
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const token = searchParams?.get('token') || '';

    // Validate token on mount
    useEffect(() => {
        if (!token) {
            setValidating(false);
            return;
        }

        const controller = new AbortController();
        fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, {
            signal: controller.signal,
        })
            .then(res => res.json())
            .then(data => {
                if (!controller.signal.aborted) {
                    setTokenValid(data.valid === true);
                }
            })
            .catch((err) => {
                if (err instanceof Error && err.name === 'AbortError') return;
                setTokenValid(false);
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setValidating(false);
                }
            });

        return () => controller.abort();
    }, [token]);

    // Cleanup redirect timer on unmount
    useEffect(() => {
        return () => {
            if (redirectTimerRef.current) {
                clearTimeout(redirectTimerRef.current);
            }
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError(t('passwordsNoMatch'));
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || tErr('resetFailed'));
                return;
            }

            setSuccess(true);
            // Redirect to login after 3 seconds
            redirectTimerRef.current = setTimeout(() => router.push('/login'), 3000);
        } catch {
            setError(tErr('generic'));
        } finally {
            setLoading(false);
        }
    };

    if (validating) {
        return (
            <div className="text-center py-8">
                <span className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400 inline-block" />
                <p className="text-faded mt-4">{t('validatingLink')}</p>
            </div>
        );
    }

    if (!token || !tokenValid) {
        return (
            <div className="text-center space-y-4">
                <div className="p-4 glass-panel border border-rose-400/30 rounded-xl text-rose-200 text-sm">
                    {t('invalid_reset_link')}
                </div>
                <Link
                    href="/forgot-password"
                    className="text-sky-200 hover:text-sky-100 font-medium text-sm"
                >
                    {t('request_new_link')}
                </Link>
            </div>
        );
    }

    if (success) {
        return (
            <div className="text-center space-y-4">
                <div className="p-4 glass-panel border border-emerald-400/30 rounded-xl text-emerald-200 text-sm">
                    {t('reset_success')}
                </div>
                <Link
                    href="/login"
                    className="text-sky-200 hover:text-sky-100 font-medium text-sm"
                >
                    {tCommon('goToLogin')}
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6" aria-label="Reset password form">
            <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                    {t('new_password')}
                </label>
                <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    aria-required="true"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
                    placeholder="********"
                    disabled={loading}
                    autoComplete="new-password"
                    minLength={8}
                />
                <p className="mt-1 text-xs text-slate-400">
                    {t('passwordRequirements')}
                </p>
            </div>

            <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1">
                    {t('confirm_password')}
                </label>
                <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    aria-required="true"
                    className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
                    placeholder="********"
                    disabled={loading}
                    autoComplete="new-password"
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
                        <span>{t('resetting')}</span>
                    </span>
                ) : (
                    t('reset_password')
                )}
            </button>
        </form>
    );
}
