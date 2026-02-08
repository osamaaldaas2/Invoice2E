'use client';

import { useEffect, useState } from 'react';
import { AdminAuditLog } from '@/types/admin';
import { logger } from '@/lib/logger';

export default function AdminAuditLogsPage() {
    const [logs, setLogs] = useState<AdminAuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                setLoading(true);
                const response = await fetch(`/api/admin/audit-logs?page=${page}&limit=50`, {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch audit logs');
                }

                const data = await response.json();
                setLogs(data.data.logs);
                setTotalPages(data.data.pagination.pages);
            } catch (err) {
                logger.error('Failed to fetch audit logs', err);
                setError('Failed to load audit logs');
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, [page]);

    const getActionColor = (action: string) => {
        if (action.includes('banned') || action.includes('removed') || action.includes('deleted')) {
            return 'text-rose-200';
        }
        if (action.includes('unbanned') || action.includes('added') || action.includes('created')) {
            return 'text-green-600 dark:text-green-400';
        }
        return 'text-blue-600 dark:text-blue-400';
    };

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div>
                <h1 className="text-2xl font-bold text-white font-display">
                    Audit Logs
                </h1>
                <p className="mt-1 text-sm text-faded">
                    Track all admin actions on the platform
                </p>
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
                    {/* Logs table */}
                    <div className="glass-card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-white/5">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Time
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Admin
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Action
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Target
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-faded uppercase tracking-wider">
                                            Details
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-white/5">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-faded">
                                                {new Date(log.createdAt).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div>
                                                    <div className="text-sm font-medium text-white font-display">
                                                        {log.adminName || 'Unknown'}
                                                    </div>
                                                    <div className="text-xs text-faded">
                                                        {log.adminEmail}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`text-sm font-medium ${getActionColor(log.action)}`}>
                                                    {log.action.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div>
                                                    <div className="text-sm text-white font-display">
                                                        {log.resourceType}
                                                    </div>
                                                    {log.targetEmail && (
                                                        <div className="text-xs text-faded">
                                                            {log.targetEmail}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {log.newValues && (
                                                    <details className="text-xs">
                                                        <summary className="cursor-pointer text-blue-600 dark:text-blue-400">
                                                            View changes
                                                        </summary>
                                                        <pre className="mt-2 p-2 bg-slate-950/80 rounded text-slate-200 max-w-xs overflow-x-auto">
                                                            {JSON.stringify(log.newValues, null, 2)}
                                                        </pre>
                                                    </details>
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
        </div>
    );
}
