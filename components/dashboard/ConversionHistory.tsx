'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';

interface BatchResultItem {
    filename: string;
    status: string;
    invoiceNumber?: string;
    extractionId?: string;
}

interface Conversion {
    id: string;
    invoice_number: string;
    file_name: string;
    status: string;
    created_at: string;
    output_format: string;
    processing_time_ms: number;
    record_type?: 'conversion' | 'draft' | 'batch';
    extraction_id?: string;
    total_files?: number;
    completed_files?: number;
    failed_files?: number;
    batch_results?: BatchResultItem[];
}

interface Props {
    limit?: number;
    showPagination?: boolean;
}

function BatchRow({
    conversion,
    isExpanded,
    onToggle,
    onDownloadZip,
    onDownloadSingle,
    downloadingId,
    formatDate,
    getStatusBadge,
    t,
}: {
    conversion: Conversion;
    isExpanded: boolean;
    onToggle: () => void;
    onDownloadZip: () => void;
    onDownloadSingle: (result: BatchResultItem) => void;
    downloadingId: string | null;
    formatDate: (d: string) => string;
    getStatusBadge: (s: string) => string;
    t: (key: string) => string;
}) {
    const results = conversion.batch_results || [];

    return (
        <>
            <tr className="hover:bg-white/5 bg-white/[0.02]">
                <td className="px-4 py-3 text-sm font-medium text-white">
                    <span className="inline-flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        {t('batchLabel')} ({conversion.total_files} {t('batchFiles')})
                    </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">
                    {t('batchUpload')}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">
                    XRechnung
                </td>
                <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(conversion.status)}`}>
                        {conversion.status === 'partial_success' ? 'partial' : conversion.status}
                    </span>
                    {conversion.failed_files && conversion.failed_files > 0 ? (
                        <span className="ml-1 text-xs text-rose-400">
                            ({conversion.failed_files} failed)
                        </span>
                    ) : null}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300">
                    {formatDate(conversion.created_at)}
                </td>
                <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-2">
                        {results.length > 0 && (
                            <button
                                onClick={onDownloadZip}
                                disabled={downloadingId === conversion.id}
                                className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                            >
                                {downloadingId === conversion.id ? t('downloading') : t('downloadZip')}
                            </button>
                        )}
                        <button
                            onClick={onToggle}
                            className="inline-flex items-center px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-100 hover:bg-white/10"
                        >
                            {isExpanded ? t('hide') : t('show')}
                            <svg
                                className={`ml-1 w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
            {isExpanded && results.map((result, idx) => (
                <tr key={`${conversion.id}-${idx}`} className="bg-white/[0.03] hover:bg-white/[0.06]">
                    <td className="px-4 py-2 text-sm text-slate-300 pl-10">
                        {result.invoiceNumber || '-'}
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-400">
                        {result.filename}
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-400">
                        XRechnung
                    </td>
                    <td className="px-4 py-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(result.status === 'success' ? 'completed' : result.status)}`}>
                            {result.status === 'success' ? 'completed' : result.status}
                        </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-400">
                        -
                    </td>
                    <td className="px-4 py-2 text-sm">
                        {result.extractionId && result.status === 'success' ? (
                            <button
                                onClick={() => onDownloadSingle(result)}
                                disabled={downloadingId === result.extractionId}
                                className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50 text-xs"
                            >
                                {downloadingId === result.extractionId ? t('downloading') : t('downloadXml')}
                            </button>
                        ) : (
                            <span className="text-slate-500">-</span>
                        )}
                    </td>
                </tr>
            ))}
        </>
    );
}

export default function ConversionHistory({ limit = 10, showPagination = true }: Props) {
    const t = useTranslations('history');
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const initialStatus = useMemo<'all' | 'draft' | 'completed'>(() => {
        const statusParam = searchParams.get('status');
        if (statusParam === 'draft' || statusParam === 'completed') {
            return statusParam;
        }
        return 'all';
    }, [searchParams]);
    const [conversions, setConversions] = useState<Conversion[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'completed'>(initialStatus);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

    const locale = useMemo(() => {
        const parts = pathname?.split('/') || [];
        return parts.length > 1 ? parts[1] : 'en';
    }, [pathname]);

    const withLocale = useMemo(() => {
        return (path: string) => {
            if (!path.startsWith('/')) {
                return `/${locale}/${path}`;
            }
            if (path === '/') {
                return `/${locale}`;
            }
            if (path.startsWith(`/${locale}/`) || path === `/${locale}`) {
                return path;
            }
            return `/${locale}${path}`;
        };
    }, [locale]);

    const fetchHistory = useCallback(async () => {
        try {
            setLoading(true);
            const statusParam = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
            const response = await fetch(`/api/invoices/history?page=${page}&limit=${limit}${statusParam}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                logger.warn('History API error', {
                    status: response.status,
                    statusText: response.statusText,
                    errorData,
                });
                throw new Error(errorData.error || `Failed to fetch history (${response.status})`);
            }
            const data = await response.json();
            const items = data.items || [];
            const filtered = statusFilter === 'draft'
                ? items.filter((item: Conversion) => item.status === 'draft')
                : statusFilter === 'completed'
                    ? items.filter((item: Conversion) => item.status === 'completed')
                    : items;
            setConversions(filtered);
            setTotal(statusFilter === 'all' ? (data.total || 0) : filtered.length);
        } catch (err: unknown) {
            logger.error('Fetch history exception', err);
            setError(err instanceof Error ? err.message : 'Failed to load history');
        } finally {
            setLoading(false);
        }
    }, [page, limit, statusFilter]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    useEffect(() => {
        setPage(1);
    }, [statusFilter]);

    useEffect(() => {
        const statusParam = searchParams.get('status');
        if (statusParam === 'draft' || statusParam === 'completed') {
            setStatusFilter(statusParam);
        } else if (!statusParam) {
            setStatusFilter('all');
        }
    }, [searchParams]);

    const getStatusBadge = (status: string) => {
        const styles = {
            completed: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30',
            draft: 'bg-amber-500/15 text-amber-200 border border-amber-400/30',
            failed: 'bg-rose-500/15 text-rose-200 border border-rose-400/30',
            processing: 'bg-sky-500/15 text-sky-200 border border-sky-400/30',
            pending: 'bg-amber-500/15 text-amber-200 border border-amber-400/30',
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

    const downloadXml = (xmlContent: string, fileName: string) => {
        const element = document.createElement('a');
        element.setAttribute('href', `data:text/xml;charset=utf-8,${encodeURIComponent(xmlContent)}`);
        element.setAttribute('download', fileName || 'invoice_xrechnung.xml');
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const handleDownload = async (conversion: Conversion) => {
        if (!conversion.extraction_id) return;
        setDownloadingId(conversion.id);
        try {
            const extractionRes = await fetch(`/api/invoices/extractions/${conversion.extraction_id}`);
            const extractionData = await extractionRes.json();
            if (!extractionRes.ok) {
                throw new Error(extractionData.error || 'Failed to load extraction');
            }

            const invoiceData = extractionData.data?.extractionData;
            if (!invoiceData) {
                throw new Error('Missing invoice data for download');
            }

            const response = await fetch('/api/invoices/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversionId: conversion.extraction_id,
                    invoiceData,
                    format: conversion.output_format === 'UBL' ? 'UBL' : 'CII',
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate XML');
            }

            downloadXml(data.data.xmlContent, data.data.fileName);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to download XML');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleBatchDownload = async (conversion: Conversion) => {
        const extractionIds = conversion.batch_results
            ?.filter(r => r.status === 'success' && r.extractionId)
            .map(r => r.extractionId!) || [];

        if (extractionIds.length === 0) return;

        setDownloadingId(conversion.id);
        try {
            const response = await fetch('/api/invoices/batch-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extractionIds }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to download batch ZIP');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `batch_${conversion.id.slice(0, 8)}_invoices.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to download batch ZIP');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleSingleFromBatch = async (result: BatchResultItem) => {
        if (!result.extractionId) return;
        const fakeConversion: Conversion = {
            id: result.extractionId,
            invoice_number: result.invoiceNumber || '',
            file_name: result.filename,
            status: 'completed',
            created_at: '',
            output_format: 'CII',
            processing_time_ms: 0,
            extraction_id: result.extractionId,
        };
        await handleDownload(fakeConversion);
    };

    if (loading) {
        return (
            <div className="glass-card p-6">
                <div className="animate-pulse space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-12 bg-white/10 rounded"></div>
                    ))}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="glass-panel text-rose-200 p-4 rounded-xl border border-rose-400/30">
                {error}
            </div>
        );
    }

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-white/10">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <h3 className="text-lg font-semibold text-white font-display">
                        {t('recentConversions')}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setStatusFilter('all')}
                            className={`nav-pill ${statusFilter === 'all' ? 'nav-pill-active' : ''}`}
                        >
                            {t('filterAll')}
                        </button>
                        <button
                            onClick={() => setStatusFilter('draft')}
                            className={`nav-pill ${statusFilter === 'draft' ? 'nav-pill-active' : ''}`}
                        >
                            {t('filterDraft')}
                        </button>
                        <button
                            onClick={() => setStatusFilter('completed')}
                            className={`nav-pill ${statusFilter === 'completed' ? 'nav-pill-active' : ''}`}
                        >
                            {t('filterCompleted')}
                        </button>
                    </div>
                </div>
            </div>

            {conversions.length === 0 ? (
                <div className="p-8 text-center text-faded">
                    {t('noConversions')}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                                    {t('invoiceNumber')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                                    {t('fileName')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                                    {t('format')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                                    {t('status')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                                    {t('date')}
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                                    {t('action')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {conversions.map((conversion) => (
                                conversion.record_type === 'batch' ? (
                                    <BatchRow
                                        key={conversion.id}
                                        conversion={conversion}
                                        isExpanded={expandedBatchId === conversion.id}
                                        onToggle={() => setExpandedBatchId(expandedBatchId === conversion.id ? null : conversion.id)}
                                        onDownloadZip={() => handleBatchDownload(conversion)}
                                        onDownloadSingle={handleSingleFromBatch}
                                        downloadingId={downloadingId}
                                        formatDate={formatDate}
                                        getStatusBadge={getStatusBadge}
                                        t={t}
                                    />
                                ) : (
                                    <tr key={conversion.id} className="hover:bg-white/5">
                                        <td className="px-4 py-3 text-sm font-medium text-white">
                                            {conversion.invoice_number || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-300">
                                            {conversion.file_name}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-300">
                                            {conversion.record_type === 'draft' ? '-' : (conversion.output_format || 'XRechnung')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(conversion.status)}`}>
                                                {conversion.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-300">
                                            {formatDate(conversion.created_at)}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {conversion.extraction_id ? (
                                                conversion.status === 'draft' ? (
                                                    <Link
                                                        href={withLocale(`/review/${conversion.extraction_id}`)}
                                                        className="inline-flex items-center px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-100 hover:bg-white/10"
                                                    >
                                                        {t('resume')}
                                                    </Link>
                                                ) : conversion.status === 'completed' ? (
                                                    <button
                                                        onClick={() => handleDownload(conversion)}
                                                        disabled={downloadingId === conversion.id}
                                                        className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                                                    >
                                                        {downloadingId === conversion.id ? t('downloading') : t('downloadXml')}
                                                    </button>
                                                ) : (
                                                    <span className="text-slate-500">-</span>
                                                )
                                            ) : (
                                                <span className="text-slate-500">-</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showPagination && totalPages > 1 && (
                <div className="p-4 border-t border-white/10 flex items-center justify-between">
                    <span className="text-sm text-faded">
                        {t('showing')} {(page - 1) * limit + 1}-{Math.min(page * limit, total)} {t('of')} {total}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="nav-pill disabled:opacity-50"
                        >
                            {t('previous')}
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="nav-pill disabled:opacity-50"
                        >
                            {t('next')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
