'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { emitAuthChanged, fetchSessionUser } from '@/lib/client-auth';

// Admin navigation items
const adminNavItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/users', label: 'Users', icon: '👥' },
    { href: '/admin/packages', label: 'Packages', icon: '📦' },
    { href: '/admin/vouchers', label: 'Vouchers', icon: '???' },
    { href: '/admin/transactions', label: 'Transactions', icon: '💳' },
    { href: '/admin/audit-logs', label: 'Audit Logs', icon: '📋' },
];

type AdminUser = {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<AdminUser | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const locale = useMemo(() => {
        const parts = pathname?.split('/') || [];
        return parts.length > 1 ? parts[1] : 'en';
    }, [pathname]);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const sessionUser = await fetchSessionUser();
                if (sessionUser) {
                    setUser({
                        id: sessionUser.id,
                        email: sessionUser.email,
                        firstName: sessionUser.firstName,
                        lastName: sessionUser.lastName,
                        role: sessionUser.role || 'user',
                    });
                } else {
                    setUser(null);
                }
            } catch {
                setUser(null);
            }
        };

        void loadUser();
    }, []);

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        }
        emitAuthChanged();
        router.push(`/${locale}/login`);
    };

    const visibleNavItems = useMemo(() => {
        if (user?.role === 'super_admin') {
            return adminNavItems;
        }
        return adminNavItems.filter((item) => item.href !== '/admin/vouchers');
    }, [user?.role]);

    return (
        <div className="min-h-screen">
            {/* Sidebar */}
            <aside
                className={`fixed left-0 top-0 z-40 h-screen transition-transform ${
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                } bg-slate-950/85 border-r border-white/10 backdrop-blur-xl w-64`}
            >
                {/* Logo / Header */}
                <div className="flex items-center justify-between h-16 px-4 border-b border-white/10">
                    <Link href={`/${locale}/admin`} className="flex items-center">
                        <span className="text-2xl">🛡️</span>
                        <span className="ml-2 text-xl font-bold text-white font-display">Admin</span>
                    </Link>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden text-slate-400 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-2">
                    {visibleNavItems.map((item) => {
                        const fullHref = `/${locale}${item.href}`;
                        const isActive =
                            pathname === fullHref ||
                            (item.href !== '/admin' && pathname?.startsWith(fullHref));

                        return (
                            <Link
                                key={item.href}
                                href={fullHref}
                                className={`flex items-center px-4 py-3 rounded-xl transition-all border ${
                                    isActive
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
                                {user?.role?.replace('_', ' ')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="mt-3 w-full px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors border border-white/10"
                    >
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Mobile sidebar toggle */}
            <button
                onClick={() => setSidebarOpen(true)}
                className={`fixed top-4 left-4 z-30 lg:hidden p-2 rounded-xl bg-slate-950/80 text-white border border-white/10 ${
                    sidebarOpen ? 'hidden' : ''
                }`}
            >
                ☰
            </button>

            {/* Backdrop for mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/70 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main content */}
            <div className={`transition-all ${sidebarOpen ? 'lg:ml-64' : ''}`}>
                {/* Top header */}
                <header className="sticky top-0 z-20 bg-slate-950/80 border-b border-white/10 backdrop-blur-xl">
                    <div className="flex items-center justify-between px-6 py-4">
                        <div className="flex items-center">
                            <button
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                className="hidden lg:block p-2 rounded-xl hover:bg-white/10"
                            >
                                ☰
                            </button>
                            <h1 className="ml-4 text-xl font-semibold text-white font-display">
                                Admin Panel
                            </h1>
                        </div>
                        <div className="flex items-center space-x-4">
                            <Link
                                href={`/${locale}/dashboard`}
                                className="text-sm text-slate-300 hover:text-white"
                            >
                                ← Back to App
                            </Link>
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main className="p-6">{children}</main>
            </div>
        </div>
    );
}
