'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { fetchSessionUser } from '@/lib/client-auth';

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/dashboard/history', label: 'History', icon: '📋' },
    { href: '/dashboard/analytics', label: 'Analytics', icon: '📊' },
    { href: '/dashboard/templates', label: 'Templates', icon: '📝' },
    { href: '/dashboard/credits', label: 'Credits', icon: '💳' },
    { href: '/invoices/bulk-upload', label: 'Bulk Upload', icon: '📦' },
];

interface Props {
    children: React.ReactNode;
}

export default function DashboardLayout({ children }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const locale = useMemo(() => {
        const parts = pathname?.split('/') || [];
        return parts.length > 1 ? parts[1] : 'en';
    }, [pathname]);

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
        const loadUser = async () => {
            try {
                const sessionUser = await fetchSessionUser();
                if (!sessionUser) {
                    router.push(withLocale('/login'));
                    return;
                }
                setUser(sessionUser);
            } catch {
                router.push(withLocale('/login'));
            } finally {
                setLoading(false);
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
    }, [router, withLocale]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <div className="min-h-screen">
            <div className="flex">
                {/* Sidebar Navigation */}
                <aside className="hidden md:block w-64 min-h-screen fixed left-0 top-16 border-r border-white/10 bg-slate-950/70 backdrop-blur-xl">
                    <div className="p-4">
                        <div className="mb-6 pb-4 border-b border-white/10">
                            <p className="text-xs uppercase tracking-[0.2em] text-faded">Welcome back</p>
                            <p className="font-semibold text-white mt-2">{user.firstName} {user.lastName}</p>
                            <p className="text-xs text-faded">{user.email}</p>
                        </div>
                        <nav className="space-y-2">
                            {navItems.map((item) => {
                                const fullPath = withLocale(item.href);
                                const isActive = pathname === fullPath;
                                return (
                                    <Link
                                        key={item.href}
                                        href={fullPath}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${isActive
                                            ? 'bg-gradient-to-r from-sky-400/20 via-blue-500/10 to-transparent text-sky-100 border border-sky-300/30 shadow-[0_0_24px_rgba(56,189,248,0.2)]'
                                            : 'text-slate-200 hover:bg-white/5 border border-transparent'
                                            }`}
                                    >
                                        <span>{item.icon}</span>
                                        <span className="font-medium">{item.label}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 ml-0 md:ml-64 p-6 md:p-8">
                    <div className="max-w-6xl mx-auto">
                        <div className="md:hidden mb-6">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="chip">{user.firstName}</span>
                                <span className="text-faded text-sm">{user.email}</span>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {navItems.map((item) => {
                                    const fullPath = withLocale(item.href);
                                    const isActive = pathname === fullPath;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={fullPath}
                                            className={`nav-pill whitespace-nowrap ${isActive ? 'nav-pill-active' : ''}`}
                                        >
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
