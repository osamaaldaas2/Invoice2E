'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

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

    useEffect(() => {
        const userData = localStorage.getItem('user');

        if (!userData) {
            router.push('/login');
            return;
        }

        try {
            setUser(JSON.parse(userData));
        } catch {
            router.push('/login');
        } finally {
            setLoading(false);
        }
    }, [router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    // Get locale from pathname
    const locale = pathname.split('/')[1] || 'en';

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            <div className="flex">
                {/* Sidebar Navigation */}
                <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-screen fixed left-0 top-16">
                    <div className="p-4">
                        <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Welcome back,</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{user.firstName} {user.lastName}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-500">{user.email}</p>
                        </div>
                        <nav className="space-y-1">
                            {navItems.map((item) => {
                                const fullPath = `/${locale}${item.href}`;
                                const isActive = pathname === fullPath ||
                                    (item.href === '/dashboard' && pathname === `/${locale}/dashboard`);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive
                                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                <main className="flex-1 ml-64 p-8">
                    <div className="max-w-6xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
