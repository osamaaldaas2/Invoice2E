'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Admin navigation items
const adminNavItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/users', label: 'Users', icon: '👥' },
    { href: '/admin/packages', label: 'Packages', icon: '📦' },
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

    useEffect(() => {
        const userData = localStorage.getItem('user');
        if (userData) {
            setUser(JSON.parse(userData));
        }
    }, []);

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        }
        localStorage.removeItem('user');
        router.push('/login');
    };

    // Get locale from pathname
    const locale = pathname?.split('/')[1] || 'en';

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
            {/* Sidebar */}
            <aside
                className={`fixed left-0 top-0 z-40 h-screen transition-transform ${
                    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                } bg-gray-800 w-64`}
            >
                {/* Logo / Header */}
                <div className="flex items-center justify-between h-16 px-4 bg-gray-900">
                    <Link href={`/${locale}/admin`} className="flex items-center">
                        <span className="text-2xl">🛡️</span>
                        <span className="ml-2 text-xl font-bold text-white">Admin</span>
                    </Link>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden text-gray-400 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-2">
                    {adminNavItems.map((item) => {
                        const fullHref = `/${locale}${item.href}`;
                        const isActive =
                            pathname === fullHref ||
                            (item.href !== '/admin' && pathname?.startsWith(fullHref));

                        return (
                            <Link
                                key={item.href}
                                href={fullHref}
                                className={`flex items-center px-4 py-3 rounded-lg transition-colors ${
                                    isActive
                                        ? 'bg-red-600 text-white'
                                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                }`}
                            >
                                <span className="mr-3">{item.icon}</span>
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* User info at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
                    <div className="flex items-center">
                        <div className="flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-red-600 flex items-center justify-center text-white font-medium">
                                {user?.firstName?.[0]}
                                {user?.lastName?.[0]}
                            </div>
                        </div>
                        <div className="ml-3 flex-1">
                            <p className="text-sm font-medium text-white truncate">
                                {user?.firstName} {user?.lastName}
                            </p>
                            <p className="text-xs text-gray-400 capitalize">
                                {user?.role?.replace('_', ' ')}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="mt-3 w-full px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Mobile sidebar toggle */}
            <button
                onClick={() => setSidebarOpen(true)}
                className={`fixed top-4 left-4 z-30 lg:hidden p-2 rounded-lg bg-gray-800 text-white ${
                    sidebarOpen ? 'hidden' : ''
                }`}
            >
                ☰
            </button>

            {/* Backdrop for mobile */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main content */}
            <div className={`transition-all ${sidebarOpen ? 'lg:ml-64' : ''}`}>
                {/* Top header */}
                <header className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between px-6 py-4">
                        <div className="flex items-center">
                            <button
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                className="hidden lg:block p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                ☰
                            </button>
                            <h1 className="ml-4 text-xl font-semibold text-gray-900 dark:text-white">
                                Admin Panel
                            </h1>
                        </div>
                        <div className="flex items-center space-x-4">
                            <Link
                                href={`/${locale}/dashboard`}
                                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
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
