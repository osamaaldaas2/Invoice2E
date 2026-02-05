'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AdminUserWithCredits } from '@/types/admin';
import AdminStatsCard from '@/components/admin/AdminStatsCard';

export default function AdminUserDetailPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.id as string;

    const [user, setUser] = useState<AdminUserWithCredits | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await fetch(`/api/admin/users/${userId}`, {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch user');
                }

                const data = await response.json();
                setUser(data.data);
            } catch (err) {
                console.error('Failed to fetch user:', err);
                setError('Failed to load user');
            } finally {
                setLoading(false);
            }
        };

        if (userId) {
            fetchUser();
        }
    }, [userId]);

    const handleModifyCredits = async () => {
        const amountStr = prompt('Enter credit amount (positive to add, negative to remove):');
        if (!amountStr) return;

        const amount = parseInt(amountStr);
        if (isNaN(amount) || amount === 0) {
            alert('Please enter a valid non-zero number');
            return;
        }

        const reason = prompt('Enter reason for this modification:');
        if (!reason || reason.length < 5) {
            alert('Reason must be at least 5 characters');
            return;
        }

        try {
            const response = await fetch(`/api/admin/users/${userId}/credits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ amount, reason }),
            });

            if (!response.ok) {
                const data = await response.json();
                alert(data.error || 'Failed to modify credits');
                return;
            }

            const data = await response.json();
            alert(`Credits ${amount > 0 ? 'added' : 'removed'}. New balance: ${data.data.newBalance}`);

            // Refresh user
            setUser((prev) => prev ? { ...prev, availableCredits: data.data.newBalance } : null);
        } catch (err) {
            console.error('Modify credits error:', err);
            alert('Failed to modify credits');
        }
    };

    const handleBan = async () => {
        if (!user) return;

        const action = user.isBanned ? 'unban' : 'ban';
        const reason = action === 'ban' ? prompt('Enter ban reason:') : undefined;

        if (action === 'ban' && !reason) return;

        try {
            const response = await fetch(`/api/admin/users/${userId}/ban`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ action, reason }),
            });

            if (!response.ok) {
                const data = await response.json();
                alert(data.error || 'Failed to update user');
                return;
            }

            const data = await response.json();
            setUser(data.data);
        } catch (err) {
            console.error('Ban/unban error:', err);
            alert('Failed to update user');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
            </div>
        );
    }

    if (error || !user) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-red-600 dark:text-red-400">{error || 'User not found'}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Back button */}
            <button
                onClick={() => router.push('/en/admin/users')}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2"
            >
                ← Back to Users
            </button>

            {/* User header */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold">
                            {user.firstName[0]}{user.lastName[0]}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                {user.firstName} {user.lastName}
                            </h1>
                            <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
                            <div className="mt-2 flex gap-2">
                                <span
                                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                                        user.role === 'super_admin'
                                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                            : user.role === 'admin'
                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                                    }`}
                                >
                                    {user.role}
                                </span>
                                {user.isBanned && (
                                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                                        Banned
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleModifyCredits}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                            Modify Credits
                        </button>
                        <button
                            onClick={handleBan}
                            className={`px-4 py-2 rounded-lg text-white ${
                                user.isBanned
                                    ? 'bg-blue-600 hover:bg-blue-700'
                                    : 'bg-red-600 hover:bg-red-700'
                            }`}
                        >
                            {user.isBanned ? 'Unban User' : 'Ban User'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Ban info */}
            {user.isBanned && user.bannedReason && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <h3 className="font-medium text-red-800 dark:text-red-200">Ban Reason</h3>
                    <p className="mt-1 text-red-700 dark:text-red-300">{user.bannedReason}</p>
                    {user.bannedAt && (
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                            Banned on: {new Date(user.bannedAt).toLocaleString()}
                        </p>
                    )}
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <AdminStatsCard
                    title="Available Credits"
                    value={user.availableCredits}
                    icon="💳"
                    color="green"
                />
                <AdminStatsCard
                    title="Used Credits"
                    value={user.usedCredits}
                    icon="📊"
                    color="blue"
                />
                <AdminStatsCard
                    title="Login Count"
                    value={user.loginCount}
                    icon="🔑"
                    color="purple"
                />
            </div>

            {/* User details */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    User Details
                </h2>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <dt className="text-sm text-gray-500 dark:text-gray-400">User ID</dt>
                        <dd className="text-sm font-mono text-gray-900 dark:text-white">{user.id}</dd>
                    </div>
                    <div>
                        <dt className="text-sm text-gray-500 dark:text-gray-400">Email</dt>
                        <dd className="text-sm text-gray-900 dark:text-white">{user.email}</dd>
                    </div>
                    <div>
                        <dt className="text-sm text-gray-500 dark:text-gray-400">Joined</dt>
                        <dd className="text-sm text-gray-900 dark:text-white">
                            {new Date(user.createdAt).toLocaleString()}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-sm text-gray-500 dark:text-gray-400">Last Login</dt>
                        <dd className="text-sm text-gray-900 dark:text-white">
                            {user.lastLoginAt
                                ? new Date(user.lastLoginAt).toLocaleString()
                                : 'Never'}
                        </dd>
                    </div>
                </dl>
            </div>
        </div>
    );
}
