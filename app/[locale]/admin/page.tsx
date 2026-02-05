'use client';

import { useEffect, useState } from 'react';
import AdminStatsCard from '@/components/admin/AdminStatsCard';
import { AdminDashboardStats } from '@/types/admin';

export default function AdminDashboardPage() {
    const [stats, setStats] = useState<AdminDashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await fetch('/api/admin/stats', {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch stats');
                }

                const data = await response.json();
                setStats(data.data);
            } catch (err) {
                console.error('Failed to fetch stats:', err);
                setError('Failed to load dashboard stats');
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
        );
    }

    const successRate = stats?.totalConversions
        ? ((stats.successfulConversions / stats.totalConversions) * 100).toFixed(1)
        : '0';

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Dashboard
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Overview of your Invoice2E platform
                </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <AdminStatsCard
                    title="Total Users"
                    value={stats?.totalUsers || 0}
                    subtitle={`+${stats?.newUsers30d || 0} this month`}
                    icon="👥"
                    color="blue"
                />
                <AdminStatsCard
                    title="Total Revenue"
                    value={`€${(stats?.totalRevenue || 0).toFixed(2)}`}
                    subtitle={`€${(stats?.revenue30d || 0).toFixed(2)} this month`}
                    icon="💰"
                    color="green"
                />
                <AdminStatsCard
                    title="Conversions"
                    value={stats?.totalConversions || 0}
                    subtitle={`${stats?.conversions30d || 0} this month`}
                    icon="📄"
                    color="purple"
                />
                <AdminStatsCard
                    title="Success Rate"
                    value={`${successRate}%`}
                    subtitle={`${stats?.successfulConversions || 0} successful`}
                    icon="✓"
                    color="yellow"
                />
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <AdminStatsCard
                    title="Transactions"
                    value={stats?.totalTransactions || 0}
                    icon="💳"
                    color="blue"
                />
                <AdminStatsCard
                    title="Active Packages"
                    value={stats?.activePackages || 0}
                    icon="📦"
                    color="green"
                />
                <AdminStatsCard
                    title="Banned Users"
                    value={stats?.bannedUsers || 0}
                    icon="🚫"
                    color="red"
                />
            </div>

            {/* Quick actions */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Quick Actions
                </h2>
                <div className="flex flex-wrap gap-4">
                    <a
                        href="/en/admin/users"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Manage Users
                    </a>
                    <a
                        href="/en/admin/packages"
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                        Manage Packages
                    </a>
                    <a
                        href="/en/admin/audit-logs"
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                        View Audit Logs
                    </a>
                </div>
            </div>
        </div>
    );
}
