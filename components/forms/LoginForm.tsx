'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { emitAuthChanged } from '@/lib/client-auth';

export default function LoginForm() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const locale = useMemo(() => {
        const parts = pathname?.split('/') || [];
        return parts.length > 1 ? parts[1] : 'en';
    }, [pathname]);

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
        <form onSubmit={handleSubmit} className="space-y-6">
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
                    className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
                    placeholder="you@example.com"
                    disabled={loading}
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
                    className="w-full px-4 py-3 rounded-xl bg-slate-950/60 border border-white/10 text-white focus:ring-2 focus:ring-sky-400/60 focus:border-sky-400/60 transition-colors"
                    placeholder="********"
                    disabled={loading}
                />
            </div>

            {error && (
                <div className="p-3 glass-panel border border-rose-400/30 rounded-xl text-rose-200 text-sm">
                    {error}
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white font-semibold rounded-full hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                {loading ? (
                    <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Logging in...
                    </span>
                ) : (
                    'Login'
                )}
            </button>
        </form>
    );
}
