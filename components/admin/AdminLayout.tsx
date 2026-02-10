'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { emitAuthChanged } from '@/lib/client-auth';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { useUser } from '@/lib/user-context';

// Admin navigation items
const adminNavItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/users', label: 'Users', icon: '👥' },
    { href: '/admin/packages', label: 'Packages', icon: '📦' },
    { href: '/admin/vouchers', label: 'Vouchers', icon: '🎟️' },
    { href: '/admin/transactions', label: 'Transactions', icon: '💳' },
    { href: '/admin/audit-logs', label: 'Audit Logs', icon: '📋' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();

    const t = useTranslations('admin');
    const { user } = useUser();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [loggingOut, setLoggingOut] = useState(false);
    const [logoutError, setLogoutError] = useState<string | null>(null);

    const handleLogout = async () => {
        try {
            setLoggingOut(true);
            setLogoutError(null);
            const response = await fetch('/api/auth/logout', { method: 'POST' });
            if (!response.ok) {
                throw new Error(`Logout failed (${response.status})`);
            }
            emitAuthChanged();
            router.push('/login');
        } catch (error) {
            setLogoutError('Failed to sign out. Please try again.');
            logger.error('Admin logout failed', error);
        } finally {
            setLoggingOut(false);
        }
    };

    const userRole = user?.role || 'user';

    const visibleNavItems = useMemo(() => {
        if (userRole === 'super_admin') {
            return adminNavItems;
        }
        return adminNavItems.filter((item) => item.href !== '/admin/vouchers');
    }, [userRole]);

    return (
        <div className="min-h-screen overflow-x-hidden">
            {/* Sidebar */}
            <aside
                className={`fixed left-0 top-0 z-40 h-screen transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    } bg-slate-950/85 border-r border-white/10 backdrop-blur-xl w-64`}
            >
                {/* Logo / Header */}
                <div className="flex items-center justify-between h-16 px-4 border-b border-white/10">
                    <Link href="/admin" className="flex items-center">
                        <span className="text-2xl">🛡️</span>
                        <span className="ml-2 text-xl font-bold text-white font-display">Admin</span>
                    </Link>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden text-slate-400 hover:text-white"
                        onClick={() => setSidebarOpen(false)}
                    >
                        ✕
                    </Button>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-2">
                    {visibleNavItems.map((item) => {
                        const fullHref = item.href;
                        const isActive =
                            pathname === fullHref ||
                            (item.href !== '/admin' && pathname?.startsWith(fullHref));

                        return (
                            <Link
                                key={item.href}
                                href={fullHref}
                                className={`flex items-center px-4 py-3 rounded-xl transition-all border ${isActive
                                        ? 'bg-gradient-to-r from-sky-400/20 via-blue-500/10 to-transparent text-sky-100 border-sky-300/30 shadow-[0_0_24px_rgba(56,189,248,0.2)]'
                                        : 'text-slate-300 border-transparent hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <span className="mr-3">{item.icon}</span>
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* User info at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-slate-900 font-medium">
                                {user?.firstName?.[0]}
                                {user?.lastName?.[0]}
                            </div>
                        </div>
                        <div className="ml-3 flex-1">
                            <p className="text-sm font-medium text-white truncate">
                                {user?.firstName} {user?.lastName}
                            </p>
                            <p className="text-xs text-slate-400 capitalize">
                                {userRole.replace('_', ' ')}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3 w-full border border-white/10"
                        onClick={handleLogout}
                        disabled={loggingOut}
                    >
                        {loggingOut ? t('signingOut') : t('signOut')}
                    </Button>
                    {logoutError ? (
                        <p className="mt-2 text-xs text-rose-300" role="alert">{logoutError}</p>
                    ) : null}
                </div>
            </aside>

            {/* Mobile sidebar toggle */}
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className={`fixed top-4 left-4 z-30 lg:hidden bg-slate-950/80 border border-white/10 ${sidebarOpen ? 'hidden' : ''}`}
            >
                ☰
            </Button>

            {/* Backdrop for mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/70 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main content */}
            <div className={`transition-all lg:ml-64 min-w-0`}>
                {/* Top header */}
                <header className="sticky top-0 z-20 bg-slate-950/80 border-b border-white/10 backdrop-blur-xl">
                    <div className="flex items-center justify-between px-3 md:px-6 py-4">
                        <div className="flex items-center">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="hidden lg:block"
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                            >
                                ☰
                            </Button>
                            <h1 className="ml-4 text-xl font-semibold text-white font-display">
                                {t('panelTitle')}
                            </h1>
                        </div>
                        <div className="flex items-center space-x-4">
                            <Link
                                href="/dashboard"
                                className="text-sm text-slate-300 hover:text-white"
                            >
                                ← {t('backToApp')}
                            </Link>
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main className="p-3 md:p-6 min-w-0">
                    <ErrorBoundary>
                        {children}
                    </ErrorBoundary>
                </main>
            </div>
        </div>
    );
}
