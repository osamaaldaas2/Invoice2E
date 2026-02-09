'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from 'next-intl';

export default function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const locale = useLocale();
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const token = searchParams?.get('token') || '';

    // Validate token on mount
    useEffect(() => {
        if (!token) {
            setValidating(false);
            return;
        }

        fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
            .then(res => res.json())
            .then(data => {
                setTokenValid(data.valid === true);
            })
            .catch(() => {
                setTokenValid(false);
            })
            .finally(() => {
                setValidating(false);
            });
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
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
                setError(data.error || 'Failed to reset password');
                return;
            }

            setSuccess(true);
            // Redirect to login after 3 seconds
            setTimeout(() => router.push(`/${locale}/login`), 3000);
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (validating) {
        return (
            <div className="text-center py-8">
                <span className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400 inline-block" />
                <p className="text-faded mt-4">Validating reset link...</p>
            </div>
        );
    }

    if (!token || !tokenValid) {
        return (
            <div className="text-center space-y-4">
                <div className="p-4 glass-panel border border-rose-400/30 rounded-xl text-rose-200 text-sm">
                    This password reset link is invalid or has expired.
                </div>
                <Link
                    href={`/${locale}/forgot-password`}
                    className="text-sky-200 hover:text-sky-100 font-medium text-sm"
                >
                    Request a new reset link
                </Link>
            </div>
        );
    }

    if (success) {
        return (
            <div className="text-center space-y-4">
                <div className="p-4 glass-panel border border-emerald-400/30 rounded-xl text-emerald-200 text-sm">
                    Your password has been reset successfully. Redirecting to login...
                </div>
                <Link
                    href={`/${locale}/login`}
                    className="text-sky-200 hover:text-sky-100 font-medium text-sm"
                >
                    Go to Login
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6" aria-label="Reset password form">
            <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                    New Password
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
                    Min 8 characters, with uppercase, lowercase, and a number.
                </p>
            </div>

            <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-1">
                    Confirm Password
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
                        <span>Resetting...</span>
                    </span>
                ) : (
                    'Reset Password'
                )}
            </button>
        </form>
    );
}
