'use client';

import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';

interface Transaction {
    id: string;
    userId: string;
    userEmail: string;
    userName: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    paymentStatus: string;
    creditsPurchased: number;
    createdAt: string;
}

export default function AdminTransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [refundingId, setRefundingId] = useState<string | null>(null);
    const [refundReason, setRefundReason] = useState('');
    const [showRefundModal, setShowRefundModal] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

    useEffect(() => {
        fetchTransactions();
    }, [page, statusFilter]);

    const fetchTransactions = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: page.toString(),
                limit: '20',
            });
            if (statusFilter !== 'all') {
                params.append('status', statusFilter);
            }

            const response = await fetch(`/api/admin/transactions?${params}`, {
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('Failed to fetch transactions');
            }

            const data = await response.json();
            setTransactions(data.data.transactions);
            setTotalPages(data.data.pagination.pages);
        } catch (err) {
            logger.error('Failed to fetch transactions', err);
            setError('Failed to load transactions');
        } finally {
            setLoading(false);
        }
    };

    const openRefundModal = (transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setRefundReason('');
        setShowRefundModal(true);
    };

    const handleRefund = async () => {
        if (!selectedTransaction || !refundReason.trim()) return;

        try {
            setRefundingId(selectedTransaction.id);
            const response = await fetch(`/api/admin/transactions/${selectedTransaction.id}/refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ reason: refundReason }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to refund transaction');
            }

            setShowRefundModal(false);
            setSelectedTransaction(null);
            fetchTransactions();
        } catch (err) {
            logger.error('Refund failed', err);
            setError(err instanceof Error ? err.message : 'Failed to process refund');
        } finally {
            setRefundingId(null);
        }
    };

    const getStatusBadge = (paymentStatus: string) => {
        const status = paymentStatus || 'unknown';

        const colors: Record<string, string> = {
            completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
            failed: 'bg-rose-500/15 text-rose-200 border border-rose-400/30',
            refunded: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
            unknown: 'bg-white/5 text-slate-200 border border-white/10',
        };

        return (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || colors.unknown}`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
        );
    };

    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount);
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white font-display">
                        Transactions
                    </h1>
                    <p className="mt-1 text-sm text-faded">
                        View and manage all payment transactions
                    </p>
                </div>

                {/* Status filter */}
                <select
                    value={statusFilter}
                    onChange={(e) => {
                        setStatusFilter(e.target.value);
                        setPage(1);
                    }}
                    className="px-4 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                </select>
            </div>

            {/* Error state */}
            {error && (
                <div className="glass-panel border border-rose-400/30 rounded-lg p-4 text-rose-200">
                    <p className="text-rose-200">{error}</p>
                    <button
                        onClick={() => setError(null)}
                        className="mt-2 text-sm text-rose-200 hover:text-rose-100"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Loading state */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
                </div>
            ) : (
                <>
                    {/* Transactions table */}
                    <div className="glass-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-white/5">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Date
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            User
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Method
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Amount
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Credits
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {transactions.map((transaction) => (
                                        <tr key={transaction.id} className="hover:bg-white/5">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-faded">
                                                {new Date(transaction.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div>
                                                    <div className="text-sm font-medium text-white font-display">
                                                        {transaction.userName}
                                                    </div>
                                                    <div className="text-xs text-faded">
                                                        {transaction.userEmail}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-display capitalize">
                                                {transaction.paymentMethod}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white font-display">
                                                {formatCurrency(transaction.amount, transaction.currency)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-display">
                                                {transaction.creditsPurchased}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {getStatusBadge(transaction.paymentStatus)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                {transaction.paymentStatus === 'completed' && (
                                                    <button
                                                        onClick={() => openRefundModal(transaction)}
                                                        className="text-rose-200 hover:text-rose-100"
                                                    >
                                                        Refund
                                                    </button>
                                                )}
                                                {transaction.paymentStatus === 'refunded' && (
                                                    <span className="text-faded">
                                                        Refunded
                                                    </span>
                                                )}
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

            {/* Refund Modal */}
            {showRefundModal && selectedTransaction && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="glass-card p-6 w-full max-w-md mx-4">
                        <h3 className="text-lg font-semibold text-white font-display mb-4">
                            Refund Transaction
                        </h3>

                        <div className="mb-4 p-4 glass-panel border border-amber-400/30 rounded-lg">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                <strong>Warning:</strong> This will refund {formatCurrency(selectedTransaction.amount, selectedTransaction.currency)} and
                                deduct {selectedTransaction.creditsPurchased} credits from the user&apos;s balance.
                            </p>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-200 mb-2">
                                Refund Reason *
                            </label>
                            <textarea
                                value={refundReason}
                                onChange={(e) => setRefundReason(e.target.value)}
                                className="w-full px-3 py-2 border border-white/10 rounded-xl bg-slate-950/60 text-white"
                                rows={3}
                                placeholder="Enter reason for refund..."
                            />
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowRefundModal(false)}
                                className="px-4 py-2 text-slate-200 hover:bg-white/10 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRefund}
                                disabled={!refundReason.trim() || refundingId === selectedTransaction.id}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {refundingId === selectedTransaction.id ? 'Processing...' : 'Process Refund'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
