'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { APP_NAME } from '@/lib/constants';
import { emitAuthChanged, fetchSessionUser } from '@/lib/client-auth';
import { logger } from '@/lib/logger';

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

export default function Header(): React.ReactElement {
    const t = useTranslations('common');
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [mounted, setMounted] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const [logoutError, setLogoutError] = useState<string | null>(null);

    const withLocale = useMemo(() => {
        return (path: string) => {
            if (!path.startsWith('/')) {
                return `/${locale}/${path}`;
            }
            if (path === '/') {
                return `/${locale}`;
            }
            if (path.startsWith(`/${locale}/`) || path === `/${locale}`) {
                return path;
            }
            return `/${locale}${path}`;
        };
    }, [locale]);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const sessionUser = await fetchSessionUser();
                setUser(sessionUser);
            } catch {
                setUser(null);
            }
        };

        void loadUser();

        const handleAuthChanged = () => void loadUser();
        window.addEventListener('auth-changed', handleAuthChanged);
        window.addEventListener('profile-updated', handleAuthChanged);

        return () => {
            window.removeEventListener('auth-changed', handleAuthChanged);
            window.removeEventListener('profile-updated', handleAuthChanged);
        };
    }, [pathname]);

    const handleLogout = async () => {
        try {
            setLoggingOut(true);
            setLogoutError(null);
            const response = await fetch('/api/auth/logout', { method: 'POST' });
            if (!response.ok) {
                throw new Error(`Logout failed (${response.status})`);
            }
            emitAuthChanged();
            setUser(null);
            router.replace(withLocale('/login'));
            router.refresh();
        } catch (error) {
            setLogoutError(t('logout') + ' failed. Please try again.');
            logger.error('Header logout failed', error);
        } finally {
            setLoggingOut(false);
        }
    };

    // Prevent hydration mismatch by not rendering auth buttons until mounted
    if (!mounted) {
        return (
            <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
                <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
                    <Link
                        href={withLocale('/')}
                        className="text-2xl font-semibold font-display tracking-tight gradient-text hover:opacity-90 transition-opacity"
                    >
                        {APP_NAME}
                    </Link>
                    <div className="flex items-center gap-3">
                        {/* Placeholder for hydration */}
                    </div>
                </nav>
            </header>
        );
    }

    return (
        <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
            <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
                <Link
                    href={withLocale('/')}
                    className="text-2xl font-semibold font-display tracking-tight gradient-text hover:opacity-90 transition-opacity"
                >
                    {APP_NAME}
                </Link>
                <div className="flex items-center gap-3">
                    {logoutError ? (
                        <span className="text-xs text-rose-300" role="alert">{logoutError}</span>
                    ) : null}
                    {user ? (
                        <>
                            <Link
                                href={withLocale('/dashboard/profile')}
                                className={`nav-pill ${pathname === withLocale('/dashboard/profile') ? 'nav-pill-active' : ''}`}
                            >
                                {t('profile')}
                            </Link>
                            <Link
                                href={withLocale('/dashboard')}
                                className={`nav-pill ${pathname === withLocale('/dashboard') ? 'nav-pill-active' : ''}`}
                            >
                                Dashboard
                            </Link>
                            <button
                                type="button"
                                onClick={handleLogout}
                                disabled={loggingOut}
                                className="nav-pill"
                            >
                                {loggingOut ? 'Logging out...' : t('logout')}
                            </button>
                        </>
                    ) : (
                        <>
                            <Link
                                href={withLocale('/login')}
                                className="nav-pill"
                            >
                                {t('login')}
                            </Link>
                            <Link
                                href={withLocale('/signup')}
                                className="nav-pill nav-pill-active"
                            >
                                {t('signup')}
                            </Link>
                        </>
                    )}
                </div>
            </nav>
        </header>
    );
}
