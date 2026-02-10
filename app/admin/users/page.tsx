'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminUserWithCredits } from '@/types/admin';
import { logger } from '@/lib/logger';

export default function AdminUsersPage() {
    const router = useRouter();
    const [users, setUsers] = useState<AdminUserWithCredits[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filter, setFilter] = useState<'all' | 'banned' | 'admin'>('all');

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
            });

            if (search) params.set('search', search);
            if (filter === 'banned') params.set('isBanned', 'true');
            if (filter === 'admin') params.set('role', 'admin');

            const response = await fetch(`/api/admin/users?${params}`, {
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('Failed to fetch users');
            }

            const data = await response.json();
            setUsers(data.data.users);
            setTotalPages(data.data.pagination.pages);
        } catch (err) {
            logger.error('Failed to fetch users', err);
            setError('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [page, filter]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchUsers();
    };

    const handleBan = async (userId: string, isBanned: boolean) => {
        const action = isBanned ? 'unban' : 'ban';
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

            // Refresh list
            fetchUsers();
        } catch (err) {
            logger.error('Ban/unban error', err);
            alert('Failed to update user');
        }
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white font-display">
                        Users
                    </h1>
                    <p className="mt-1 text-sm text-faded">
                        Manage platform users
                    </p>
                </div>
            </div>

            {/* Filters and search */}
            <div className="glass-card p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <form onSubmit={handleSearch} className="flex-1">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Search by email or name..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="flex-1 px-4 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                            />
                            <button
                                type="submit"
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Search
                            </button>
                        </div>
                    </form>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setFilter('all'); setPage(1); }}
                            className={`px-4 py-2 rounded-lg ${
                                filter === 'all'
                                    ? 'bg-white/10 text-white'
                                    : 'bg-white/5 text-slate-200 border border-white/10'
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => { setFilter('banned'); setPage(1); }}
                            className={`px-4 py-2 rounded-lg ${
                                filter === 'banned'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-white/5 text-slate-200 border border-white/10'
                            }`}
                        >
                            Banned
                        </button>
                        <button
                            onClick={() => { setFilter('admin'); setPage(1); }}
                            className={`px-4 py-2 rounded-lg ${
                                filter === 'admin'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-white/5 text-slate-200 border border-white/10'
                            }`}
                        >
                            Admins
                        </button>
                    </div>
                </div>
            </div>

            {/* Error state */}
            {error && (
                <div className="glass-panel border border-rose-400/30 rounded-lg p-4 text-rose-200">
                    <p className="text-rose-200">{error}</p>
                </div>
            )}

            {/* Loading state */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
                </div>
            ) : (
                <>
                    {/* Users table */}
                    <div className="glass-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-white/5">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            User
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Role
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Credits
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Joined
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-faded uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {users.map((user) => (
                                        <tr key={user.id} className="hover:bg-white/5">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div>
                                                    <div className="text-sm font-medium text-white font-display">
                                                        {user.firstName} {user.lastName}
                                                    </div>
                                                    <div className="text-sm text-faded">
                                                        {user.email}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span
                                                    className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                        user.role === 'super_admin'
                                                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                                            : user.role === 'admin'
                                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                                            : 'bg-white/5 text-slate-200 border border-white/10'
                                                    }`}
                                                >
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-display">
                                                {user.availableCredits}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {user.isBanned ? (
                                                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-rose-500/15 text-rose-200 border border-rose-400/30">
                                                        Banned
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                                        Active
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-faded">
                                                {new Date(user.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => router.push(`/admin/users/${user.id}`)}
                                                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        onClick={() => handleBan(user.id, user.isBanned)}
                                                        className={`${
                                                            user.isBanned
                                                                ? 'text-green-600 hover:text-green-800'
                                                                : 'text-rose-200 hover:text-rose-100'
                                                        }`}
                                                    >
                                                        {user.isBanned ? 'Unban' : 'Ban'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <span className="px-4 py-2 text-slate-200">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg disabled:opacity-50"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
