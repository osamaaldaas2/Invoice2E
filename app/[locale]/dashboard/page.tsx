'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import FileUploadForm from '@/components/forms/FileUploadForm';

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

type DashboardStats = {
    totalConversions: number;
    successfulConversions: number;
    failedConversions: number;
    totalCreditsUsed: number;
    successRate: number;
    avgProcessingTime: number;
    availableCredits: number;
};

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/dashboard/history', label: 'History', icon: '📋' },
    { href: '/dashboard/analytics', label: 'Analytics', icon: '📊' },
    { href: '/dashboard/templates', label: 'Templates', icon: '📝' },
    { href: '/dashboard/credits', label: 'Credits', icon: '💳' },
    { href: '/invoices/bulk-upload', label: 'Bulk Upload', icon: '📦' },
];

export default function DashboardPage() {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<DashboardStats | null>(null);

    useEffect(() => {
        const userData = localStorage.getItem('user');

        if (!userData) {
            router.push('/login');
            return;
        }

        try {
            setUser(JSON.parse(userData));

            // Fetch stats
            fetch('/api/invoices/analytics?type=stats', { cache: 'no-store' })
                .then(res => res.json())
                .then(data => {
                    if (data.statistics) {
                        setStats(data.statistics);
                    }
                })
                .catch(console.error);
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
                                const isActive = pathname === `/${locale}${item.href}` ||
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
                        <div className="mb-8">
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-2">
                                Welcome back, {user.firstName}! Convert your invoices to XRechnung format.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Upload Section */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <span>📤</span> Upload Invoice
                                </h2>
                                <FileUploadForm
                                    userId={user.id}
                                    availableCredits={stats?.availableCredits ?? 0}
                                    onExtractionComplete={(extractionId) => {
                                        router.push(`/review/${extractionId}`);
                                    }}
                                />
                            </div>

                            {/* Recent Conversions */}
                            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <span>📋</span> Recent Conversions
                                    </h2>
                                    <Link
                                        href="/dashboard/history"
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        View All →
                                    </Link>
                                </div>
                                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                    <p className="text-4xl mb-2">📭</p>
                                    <p>No conversions yet</p>
                                    <p className="text-sm mt-1">Upload an invoice to get started</p>
                                </div>
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                                <h3 className="text-gray-600 dark:text-gray-400 font-medium">Total Conversions</h3>
                                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                                    {stats?.totalConversions || 0}
                                </p>
                            </div>
                            <Link href="/dashboard/credits" className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-green-300 transition-colors">
                                <h3 className="text-gray-600 dark:text-gray-400 font-medium">Credits Remaining</h3>
                                <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                                    {stats?.availableCredits ?? '--'}
                                </p>
                            </Link>
                            <Link href="/dashboard/analytics" className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:border-purple-300 transition-colors">
                                <h3 className="text-gray-600 dark:text-gray-400 font-medium">Success Rate</h3>
                                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-2">
                                    {stats?.successRate || 0}%
                                </p>
                            </Link>
                        </div>

                        {/* Quick Actions */}
                        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Link
                                href="/invoices/bulk-upload"
                                className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4 text-center hover:from-blue-600 hover:to-blue-700 transition-all"
                            >
                                <span className="text-2xl block mb-2">📦</span>
                                <span className="font-medium">Bulk Upload</span>
                            </Link>
                            <Link
                                href="/dashboard/templates"
                                className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-4 text-center hover:from-purple-600 hover:to-purple-700 transition-all"
                            >
                                <span className="text-2xl block mb-2">📝</span>
                                <span className="font-medium">Templates</span>
                            </Link>
                            <Link
                                href="/dashboard/analytics"
                                className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-4 text-center hover:from-green-600 hover:to-green-700 transition-all"
                            >
                                <span className="text-2xl block mb-2">📊</span>
                                <span className="font-medium">Analytics</span>
                            </Link>
                            <Link
                                href="/dashboard/credits"
                                className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-xl p-4 text-center hover:from-amber-600 hover:to-amber-700 transition-all"
                            >
                                <span className="text-2xl block mb-2">💳</span>
                                <span className="font-medium">Buy Credits</span>
                            </Link>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
