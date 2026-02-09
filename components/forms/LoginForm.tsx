'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { emitAuthChanged } from '@/lib/client-auth';
import Link from 'next/link';

export default function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const locale = useLocale();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const redirectTarget = useMemo(() => {
        const fallback = `/${locale}/dashboard`;
        const returnUrl = searchParams?.get('returnUrl');
        if (!returnUrl) {
            return fallback;
        }

        let decoded = returnUrl;
        try {
            decoded = decodeURIComponent(returnUrl);
        } catch {
            return fallback;
        }

        if (!decoded.startsWith('/')) {
            return fallback;
        }

        return decoded;
    }, [locale, searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Login failed');
                return;
            }

            emitAuthChanged();
            router.push(redirectTarget);
        } catch {
            setError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6" aria-label="Login form">
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
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
                    placeholder="you@example.com"
                    disabled={loading}
                    autoComplete="email"
                />
            </div>

            <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                    Password
                </label>
                <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    aria-required="true"
                    aria-invalid={!!error}
                    aria-describedby={error ? "login-error" : undefined}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
                    placeholder="********"
                    disabled={loading}
                    autoComplete="current-password"
                />
                <div className="mt-1 text-right">
                    <Link
                        href={`/${locale}/forgot-password`}
                        className="text-xs text-sky-300 hover:text-sky-200 transition-colors"
                    >
                        Forgot password?
                    </Link>
                </div>
            </div>

            {error && (
                <div
                    id="login-error"
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
                        <span>Logging in...</span>
                    </span>
                ) : (
                    'Login'
                )}
            </button>
        </form>
    );
}
