'use client';

import { useEffect, useState } from 'react';
import { AdminAuditLog } from '@/types/admin';

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
                console.error('Failed to fetch audit logs:', err);
                setError('Failed to load audit logs');
            } finally {
                setLoading(false);
            }
        };

        fetchLogs();
    }, [page]);

    const getActionColor = (action: string) => {
        if (action.includes('banned') || action.includes('removed') || action.includes('deleted')) {
            return 'text-red-600 dark:text-red-400';
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
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Audit Logs
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Track all admin actions on the platform
                </p>
            </div>

            {/* Error state */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-600 dark:text-red-400">{error}</p>
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
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Time
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Admin
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Action
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Target
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Details
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {logs.map((log) => (
                                        <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                                {new Date(log.createdAt).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                        {log.adminName || 'Unknown'}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
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
                                                    <div className="text-sm text-gray-900 dark:text-white">
                                                        {log.resourceType}
                                                    </div>
                                                    {log.targetEmail && (
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">
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
                                                        <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-gray-700 dark:text-gray-300 max-w-xs overflow-x-auto">
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
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg disabled:opacity-50"
                            >
                                Previous
                            </button>
                            <span className="px-4 py-2 text-gray-700 dark:text-gray-300">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg disabled:opacity-50"
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
