'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AdminStatsCard from '@/components/admin/AdminStatsCard';
import { AdminDashboardStats } from '@/types/admin';
import { logger } from '@/lib/logger';

export default function AdminDashboardPage() {
    const params = useParams();
    const locale = (params?.locale as string) || 'en';
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
                logger.error('Failed to fetch stats', err);
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="glass-panel border border-rose-400/30 rounded-lg p-4">
                <p className="text-rose-200">{error}</p>
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
                <h1 className="text-2xl font-bold text-white font-display">
                    Dashboard
                </h1>
                <p className="mt-1 text-sm text-faded">
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
            <div className="glass-card p-6">
                <h2 className="text-lg font-semibold text-white font-display mb-4">
                    Quick Actions
                </h2>
                <div className="flex flex-wrap gap-4">
                    <Link
                        href={`/${locale}/admin/users`}
                        className="nav-pill nav-pill-active"
                    >
                        Manage Users
                    </Link>
                    <Link
                        href={`/${locale}/admin/packages`}
                        className="nav-pill nav-pill-active"
                    >
                        Manage Packages
                    </Link>
                    <Link
                        href={`/${locale}/admin/audit-logs`}
                        className="nav-pill"
                    >
                        View Audit Logs
                    </Link>
                </div>
            </div>
        </div>
    );
}
