'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    AdminBatchJobSummary,
    AdminConversion,
    AdminCreditTransaction,
    AdminTransaction,
    AdminUserWithCredits,
} from '@/types/admin';
import { fetchSessionUser } from '@/lib/client-auth';
import AdminStatsCard from '@/components/admin/AdminStatsCard';
import { logger } from '@/lib/logger';

type TabKey = 'overview' | 'transactions' | 'credits' | 'conversions' | 'batch';

type PaginatedPayload<T> = {
    success: boolean;
    data?: {
        items: T[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    };
    error?: string;
};

const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'credits', label: 'Credit Movements' },
    { key: 'conversions', label: 'Conversions' },
    { key: 'batch', label: 'Batch Jobs' },
];

export default function AdminUserDetailPage() {
    const params = useParams();
    const router = useRouter();
    const userId = params.id as string;
    const locale = (params.locale as string) || 'en';

    const [user, setUser] = useState<AdminUserWithCredits | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>('overview');

    const [adminRole, setAdminRole] = useState<string>('user');
    const [roleValue, setRoleValue] = useState<'user' | 'admin' | 'super_admin'>('user');
    const [roleSaving, setRoleSaving] = useState(false);

    const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
    const [transactionsPage, setTransactionsPage] = useState(1);
    const [transactionsPages, setTransactionsPages] = useState(1);
    const [transactionsLoading, setTransactionsLoading] = useState(false);

    const [creditTxs, setCreditTxs] = useState<AdminCreditTransaction[]>([]);
    const [creditTxsPage, setCreditTxsPage] = useState(1);
    const [creditTxsPages, setCreditTxsPages] = useState(1);
    const [creditTxsLoading, setCreditTxsLoading] = useState(false);

    const [conversions, setConversions] = useState<AdminConversion[]>([]);
    const [conversionsPage, setConversionsPage] = useState(1);
    const [conversionsPages, setConversionsPages] = useState(1);
    const [conversionsLoading, setConversionsLoading] = useState(false);

    const [batchJobs, setBatchJobs] = useState<AdminBatchJobSummary[]>([]);
    const [batchJobsPage, setBatchJobsPage] = useState(1);
    const [batchJobsPages, setBatchJobsPages] = useState(1);
    const [batchJobsLoading, setBatchJobsLoading] = useState(false);

    const withLocale = useMemo(() => {
        return (path: string) => {
            if (!path.startsWith('/')) return `/${locale}/${path}`;
            if (path === '/') return `/${locale}`;
            if (path.startsWith(`/${locale}/`) || path === `/${locale}`) return path;
            return `/${locale}${path}`;
        };
    }, [locale]);

    const fetchUser = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const [userResponse, sessionUser] = await Promise.all([
                fetch(`/api/admin/users/${userId}`, { credentials: 'include' }),
                fetchSessionUser(),
            ]);

            if (!userResponse.ok) {
                throw new Error('Failed to fetch user');
            }

            const payload = await userResponse.json() as { data: AdminUserWithCredits };
            setUser(payload.data);
            setRoleValue((payload.data.role || 'user') as 'user' | 'admin' | 'super_admin');
            setAdminRole(sessionUser?.role || 'user');
        } catch (err) {
            logger.error('Failed to fetch admin user detail', err as Error);
            setError('Failed to load user');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    const fetchTabData = useCallback(async (tab: TabKey, page: number) => {
        if (!userId || tab === 'overview') return;
        const endpointMap: Record<Exclude<TabKey, 'overview'>, string> = {
            transactions: 'transactions',
            credits: 'credit-transactions',
            conversions: 'conversions',
            batch: 'batch-jobs',
        };

        const endpoint = endpointMap[tab as Exclude<TabKey, 'overview'>];
        if (!endpoint) return;

        const setLoadingState: Record<Exclude<TabKey, 'overview'>, (value: boolean) => void> = {
            transactions: setTransactionsLoading,
            credits: setCreditTxsLoading,
            conversions: setConversionsLoading,
            batch: setBatchJobsLoading,
        };

        setLoadingState[tab as Exclude<TabKey, 'overview'>](true);
        try {
            const response = await fetch(`/api/admin/users/${userId}/${endpoint}?page=${page}&limit=10`, {
                credentials: 'include',
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch ${tab}`);
            }

            if (tab === 'transactions') {
                const payload = await response.json() as PaginatedPayload<AdminTransaction>;
                setTransactions(payload.data?.items || []);
                setTransactionsPages(payload.data?.pagination.pages || 1);
            } else if (tab === 'credits') {
                const payload = await response.json() as PaginatedPayload<AdminCreditTransaction>;
                setCreditTxs(payload.data?.items || []);
                setCreditTxsPages(payload.data?.pagination.pages || 1);
            } else if (tab === 'conversions') {
                const payload = await response.json() as PaginatedPayload<AdminConversion>;
                setConversions(payload.data?.items || []);
                setConversionsPages(payload.data?.pagination.pages || 1);
            } else if (tab === 'batch') {
                const payload = await response.json() as PaginatedPayload<AdminBatchJobSummary>;
                setBatchJobs(payload.data?.items || []);
                setBatchJobsPages(payload.data?.pagination.pages || 1);
            }
        } catch (err) {
            logger.error(`Failed to fetch ${tab}`, err as Error);
        } finally {
            setLoadingState[tab as Exclude<TabKey, 'overview'>](false);
        }
    }, [userId]);

    useEffect(() => {
        void fetchUser();
    }, [fetchUser]);

    useEffect(() => {
        if (activeTab === 'transactions') void fetchTabData('transactions', transactionsPage);
        if (activeTab === 'credits') void fetchTabData('credits', creditTxsPage);
        if (activeTab === 'conversions') void fetchTabData('conversions', conversionsPage);
        if (activeTab === 'batch') void fetchTabData('batch', batchJobsPage);
    }, [activeTab, transactionsPage, creditTxsPage, conversionsPage, batchJobsPage, fetchTabData]);

    const handleModifyCredits = async () => {
        const amountStr = prompt('Enter credit amount (positive to add, negative to remove):');
        if (!amountStr) return;

        const amount = parseInt(amountStr, 10);
        if (Number.isNaN(amount) || amount === 0) {
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
            const payload = await response.json();
            if (!response.ok) {
                alert(payload.error || 'Failed to modify credits');
                return;
            }

            setUser((prev) => prev ? { ...prev, availableCredits: payload.data.newBalance } : null);
            void fetchUser();
            if (activeTab === 'credits') void fetchTabData('credits', creditTxsPage);
            alert(`Credits updated. New balance: ${payload.data.newBalance}`);
        } catch (err) {
            logger.error('Modify credits error', err as Error);
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
            const payload = await response.json();
            if (!response.ok) {
                alert(payload.error || 'Failed to update user');
                return;
            }
            setUser(payload.data as AdminUserWithCredits);
        } catch (err) {
            logger.error('Ban/unban error', err as Error);
            alert('Failed to update user');
        }
    };

    const handleRoleChange = async () => {
        if (!user) return;
        if (adminRole !== 'super_admin') {
            alert('Only super admin can change roles');
            return;
        }
        if (roleValue === user.role) return;
        const confirmed = confirm(`Change role to "${roleValue}"?`);
        if (!confirmed) return;

        try {
            setRoleSaving(true);
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ role: roleValue }),
            });
            const payload = await response.json();
            if (!response.ok) {
                alert(payload.error || 'Failed to update role');
                return;
            }
            setUser(payload.data as AdminUserWithCredits);
            alert('Role updated');
        } catch (err) {
            logger.error('Role update failed', err as Error);
            alert('Failed to update role');
        } finally {
            setRoleSaving(false);
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
            <div className="glass-panel border border-rose-400/30 rounded-lg p-4 text-rose-200">
                <p>{error || 'User not found'}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <button
                onClick={() => router.push(withLocale('/admin/users'))}
                className="text-faded hover:text-white flex items-center gap-2"
            >
                ← Back to Users
            </button>

            <div className="glass-card p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold">
                            {user.firstName?.[0]}{user.lastName?.[0]}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white font-display">
                                {user.firstName} {user.lastName}
                            </h1>
                            <p className="text-faded">{user.email}</p>
                            <div className="mt-2 flex gap-2 items-center">
                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-white/5 text-slate-200 border border-white/10">
                                    {user.role}
                                </span>
                                {user.isBanned && (
                                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-rose-500/15 text-rose-200 border border-rose-400/30">
                                        Banned
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={handleModifyCredits}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                            Modify Credits
                        </button>
                        <button
                            onClick={handleBan}
                            className={`px-4 py-2 rounded-lg text-white ${user.isBanned ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}
                        >
                            {user.isBanned ? 'Unban User' : 'Ban User'}
                        </button>
                    </div>
                </div>

                <div className="mt-4 border-t border-white/10 pt-4 flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-xs text-faded mb-1">Role</label>
                        <select
                            value={roleValue}
                            onChange={(e) => setRoleValue(e.target.value as 'user' | 'admin' | 'super_admin')}
                            className="px-3 py-2 rounded-lg bg-slate-950/60 border border-white/10 text-white"
                            disabled={adminRole !== 'super_admin' || roleSaving}
                        >
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                            <option value="super_admin">super_admin</option>
                        </select>
                    </div>
                    <button
                        onClick={handleRoleChange}
                        disabled={adminRole !== 'super_admin' || roleSaving || roleValue === user.role}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                        {roleSaving ? 'Saving...' : 'Update Role'}
                    </button>
                    {adminRole !== 'super_admin' && (
                        <p className="text-xs text-amber-300">Only super admin can change roles.</p>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <AdminStatsCard title="Available Credits" value={user.availableCredits} icon="💳" color="green" />
                <AdminStatsCard title="Used Credits" value={user.usedCredits} icon="📊" color="blue" />
                <AdminStatsCard title="Login Count" value={user.loginCount} icon="🔑" color="purple" />
            </div>

            <div className="glass-card p-4">
                <div className="flex flex-wrap gap-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-3 py-2 rounded-lg border text-sm ${activeTab === tab.key
                                ? 'bg-sky-500/20 text-sky-100 border-sky-400/40'
                                : 'bg-white/5 text-slate-200 border-white/10'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === 'overview' && (
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Account Information</h2>
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div><dt className="text-faded">User ID</dt><dd className="text-white font-mono">{user.id}</dd></div>
                        <div><dt className="text-faded">Email</dt><dd className="text-white">{user.email}</dd></div>
                        <div><dt className="text-faded">Phone</dt><dd className="text-white">{user.phone || '-'}</dd></div>
                        <div><dt className="text-faded">Tax ID</dt><dd className="text-white">{user.taxId || '-'}</dd></div>
                        <div><dt className="text-faded">Address Line 1</dt><dd className="text-white">{user.addressLine1 || '-'}</dd></div>
                        <div><dt className="text-faded">Address Line 2</dt><dd className="text-white">{user.addressLine2 || '-'}</dd></div>
                        <div><dt className="text-faded">City</dt><dd className="text-white">{user.city || '-'}</dd></div>
                        <div><dt className="text-faded">Postal Code</dt><dd className="text-white">{user.postalCode || '-'}</dd></div>
                        <div><dt className="text-faded">Country</dt><dd className="text-white">{user.country || '-'}</dd></div>
                        <div><dt className="text-faded">Language</dt><dd className="text-white">{user.language || '-'}</dd></div>
                        <div><dt className="text-faded">Created At</dt><dd className="text-white">{new Date(user.createdAt).toLocaleString()}</dd></div>
                        <div><dt className="text-faded">Last Login</dt><dd className="text-white">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</dd></div>
                    </dl>
                </div>
            )}

            {activeTab === 'transactions' && (
                <TabTable
                    title="Purchases / Transactions"
                    loading={transactionsLoading}
                    rows={transactions}
                    emptyText="No transactions found"
                    page={transactionsPage}
                    pages={transactionsPages}
                    onPageChange={setTransactionsPage}
                    columns={[
                        { label: 'Date', render: (row) => new Date(row.createdAt).toLocaleString() },
                        { label: 'Method', render: (row) => row.paymentMethod || '-' },
                        { label: 'Status', render: (row) => row.paymentStatus || '-' },
                        { label: 'Amount', render: (row) => `${row.amount} ${row.currency}` },
                        { label: 'Credits', render: (row) => row.creditsPurchased || 0 },
                    ]}
                />
            )}

            {activeTab === 'credits' && (
                <TabTable
                    title="Credit Movements"
                    loading={creditTxsLoading}
                    rows={creditTxs}
                    emptyText="No credit transactions found"
                    page={creditTxsPage}
                    pages={creditTxsPages}
                    onPageChange={setCreditTxsPage}
                    columns={[
                        { label: 'Date', render: (row) => new Date(row.createdAt).toLocaleString() },
                        { label: 'Type', render: (row) => row.transactionType || '-' },
                        { label: 'Source', render: (row) => row.source || '-' },
                        { label: 'Amount', render: (row) => row.amount || 0 },
                        { label: 'Balance After', render: (row) => row.balanceAfter ?? '-' },
                    ]}
                />
            )}

            {activeTab === 'conversions' && (
                <TabTable
                    title="Invoice Conversions"
                    loading={conversionsLoading}
                    rows={conversions}
                    emptyText="No conversions found"
                    page={conversionsPage}
                    pages={conversionsPages}
                    onPageChange={setConversionsPage}
                    columns={[
                        { label: 'Date', render: (row) => new Date(row.createdAt).toLocaleString() },
                        { label: 'Invoice #', render: (row) => row.invoiceNumber || '-' },
                        { label: 'Format', render: (row) => row.conversionFormat || '-' },
                        { label: 'Status', render: (row) => row.conversionStatus || '-' },
                        { label: 'Validation', render: (row) => row.validationStatus || '-' },
                    ]}
                />
            )}

            {activeTab === 'batch' && (
                <TabTable
                    title="Bulk Upload Jobs"
                    loading={batchJobsLoading}
                    rows={batchJobs}
                    emptyText="No batch jobs found"
                    page={batchJobsPage}
                    pages={batchJobsPages}
                    onPageChange={setBatchJobsPage}
                    columns={[
                        { label: 'Created', render: (row) => new Date(row.createdAt).toLocaleString() },
                        { label: 'Status', render: (row) => row.status || '-' },
                        { label: 'Total', render: (row) => row.totalFiles || 0 },
                        { label: 'Completed', render: (row) => row.completedFiles || 0 },
                        { label: 'Failed', render: (row) => row.failedFiles || 0 },
                    ]}
                />
            )}
        </div>
    );
}

type TabTableColumn<T> = {
    label: string;
    render: (row: T) => string | number;
};

function TabTable<T extends object>(props: {
    title: string;
    loading: boolean;
    rows: T[];
    emptyText: string;
    page: number;
    pages: number;
    onPageChange: (page: number) => void;
    columns: Array<TabTableColumn<T>>;
}) {
    const { title, loading, rows, emptyText, page, pages, onPageChange, columns } = props;

    return (
        <div className="glass-card p-4">
            <h3 className="text-white font-semibold mb-4">{title}</h3>
            {loading ? (
                <div className="text-slate-300">Loading...</div>
            ) : rows.length === 0 ? (
                <div className="text-faded">{emptyText}</div>
            ) : (
                <div className="space-y-4">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10">
                                    {columns.map((col) => (
                                        <th key={col.label} className="text-left py-2 text-faded font-medium">
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, idx) => (
                                    <tr key={idx} className="border-b border-white/5">
                                        {columns.map((col) => (
                                            <td key={col.label} className="py-2 text-white">
                                                {col.render(row)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={() => onPageChange(Math.max(1, page - 1))}
                            disabled={page <= 1}
                            className="px-3 py-1 rounded border border-white/10 disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="text-slate-300 text-xs">Page {page} of {pages}</span>
                        <button
                            onClick={() => onPageChange(Math.min(pages, page + 1))}
                            disabled={page >= pages}
                            className="px-3 py-1 rounded border border-white/10 disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
