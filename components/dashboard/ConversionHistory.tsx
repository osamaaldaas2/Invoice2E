'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

interface Conversion {
    id: string;
    invoice_number: string;
    file_name: string;
    status: string;
    created_at: string;
    output_format: string;
    processing_time_ms: number;
}

interface Props {
    limit?: number;
    showPagination?: boolean;
}

export default function ConversionHistory({ limit = 10, showPagination = true }: Props) {
    const t = useTranslations('history');
    const [conversions, setConversions] = useState<Conversion[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const fetchHistory = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/invoices/history?page=${page}&limit=${limit}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('History API Error:', response.status, response.statusText, errorData);
                throw new Error(errorData.error || `Failed to fetch history (${response.status})`);
            }
            const data = await response.json();
            console.log('History API response:', data); // Debug logging
            setConversions(data.items || []);
            setTotal(data.total || 0);
        } catch (err: any) {
            console.error('Fetch history exception:', err);
            setError(err.message || 'Failed to load history');
        } finally {
            setLoading(false);
        }
    }, [page, limit]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const getStatusBadge = (status: string) => {
        const styles = {
            completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
            processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        };
        return styles[status as keyof typeof styles] || styles.pending;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6">
                <div className="animate-pulse space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl">
                {error}
            </div>
        );
    }

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('recentConversions')}
                </h3>
            </div>

            {conversions.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    {t('noConversions')}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                    {t('invoiceNumber')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                    {t('fileName')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                    {t('format')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                    {t('status')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                    {t('date')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {conversions.map((conversion) => (
                                <tr key={conversion.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                        {conversion.invoice_number || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {conversion.file_name}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {conversion.output_format || 'XRechnung'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(conversion.status)}`}>
                                            {conversion.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                        {formatDate(conversion.created_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showPagination && totalPages > 1 && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        {t('showing')} {(page - 1) * limit + 1}-{Math.min(page * limit, total)} {t('of')} {total}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50"
                        >
                            {t('previous')}
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50"
                        >
                            {t('next')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
