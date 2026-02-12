'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import { useToast } from '@/lib/toast-context';
import { useConfirm } from '@/lib/confirm-context';

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
  record_type?: 'conversion' | 'extraction' | 'batch';
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

// Utility functions outside component — no deps on state, stable references
const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    completed: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30',
    draft: 'bg-amber-500/15 text-amber-200 border border-amber-400/30',
    failed: 'bg-rose-500/15 text-rose-200 border border-rose-400/30',
    processing: 'bg-sky-500/15 text-sky-200 border border-sky-400/30',
    pending: 'bg-amber-500/15 text-amber-200 border border-amber-400/30',
    partial_success: 'bg-orange-500/15 text-orange-200 border border-orange-400/30',
  };
  return styles[status] || styles.pending;
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    completed: '\u2713 completed',
    draft: '\u270E draft',
    failed: '\u2717 failed',
    processing: '\u21BB processing',
    pending: '\u25CB pending',
    partial_success: '\u25D1 partial',
  };
  return labels[status] || status;
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

const downloadFile = (
  content: string | Blob,
  fileName: string,
  mimeType = 'text/xml;charset=utf-8'
) => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof TypeError && err.message.includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }
  return err instanceof Error ? err.message : fallback;
};

function BatchRow({
  conversion,
  isExpanded,
  onToggle,
  onDownloadZip,
  onDownloadSingle,
  downloadingIds,
  t,
}: {
  conversion: Conversion;
  isExpanded: boolean;
  onToggle: () => void;
  onDownloadZip: () => void;
  onDownloadSingle: (result: BatchResultItem) => void;
  downloadingIds: Set<string>;
  t: (key: string) => string;
}) {
  const results = conversion.batch_results || [];
  const successCount = results.filter((r) => r.status === 'success').length;
  const failCount = results.filter((r) => r.status === 'failed').length;

  return (
    <>
      <tr className="hover:bg-white/5 border-l-4 border-amber-400/60 bg-amber-500/5">
        <td className="px-4 py-3 text-sm font-medium text-white max-w-[200px] truncate">
          <span className="inline-flex items-center gap-2">
            <svg
              className="w-4 h-4 text-amber-400 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
            {t('batchLabel')} ({conversion.total_files} {t('batchFiles')})
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-300">{t('batchUpload')}</td>
        <td className="px-4 py-3 text-sm text-slate-300">XRechnung</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(conversion.status)}`}
            aria-label={`Status: ${conversion.status}`}
          >
            {getStatusLabel(conversion.status)}
          </span>
          <span className="ml-2 text-xs">
            {successCount > 0 && <span className="text-emerald-300">{successCount}</span>}
            {successCount > 0 && failCount > 0 && <span className="text-slate-500"> / </span>}
            {failCount > 0 && <span className="text-rose-400">{failCount} failed</span>}
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-slate-300">{formatDate(conversion.created_at)}</td>
        <td className="px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            {successCount > 0 && (
              <button
                onClick={onDownloadZip}
                disabled={downloadingIds.has(conversion.id)}
                className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {downloadingIds.has(conversion.id) ? t('downloading') : t('downloadZip')}
              </button>
            )}
            <button
              onClick={onToggle}
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-100 hover:bg-white/10"
            >
              {isExpanded ? t('hide') : t('show')}
              <svg
                className={`ml-1 w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && results.length === 0 && (
        <tr className="border-l-2 border-amber-400/30 bg-white/[0.02]">
          <td colSpan={6} className="px-4 py-3 text-sm text-slate-500 text-center pl-10">
            {t('noFilesInBatch')}
          </td>
        </tr>
      )}
      {isExpanded &&
        results.map((result, idx) => {
          const isFailed = result.status === 'failed';
          return (
            <tr
              key={`${conversion.id}-${idx}`}
              className={`border-l-2 border-amber-400/30 ${isFailed ? 'bg-rose-500/[0.03] hover:bg-rose-500/[0.06]' : 'bg-white/[0.03] hover:bg-white/[0.06]'}`}
            >
              <td
                className="px-4 py-2 text-sm text-slate-300 pl-10 max-w-[200px] truncate"
                title={result.invoiceNumber || '-'}
              >
                {result.invoiceNumber || '-'}
              </td>
              <td
                className="px-4 py-2 text-sm text-slate-400 max-w-[200px] truncate"
                title={result.filename}
              >
                {result.filename}
              </td>
              <td className="px-4 py-2 text-sm text-slate-400">XRechnung</td>
              <td className="px-4 py-2">
                <span
                  className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(result.status === 'success' ? 'completed' : result.status)}`}
                  aria-label={`Status: ${result.status}`}
                >
                  {getStatusLabel(result.status === 'success' ? 'completed' : result.status)}
                </span>
              </td>
              <td className="px-4 py-2 text-sm text-slate-400">-</td>
              <td className="px-4 py-2 text-sm">
                {result.extractionId && result.status === 'success' ? (
                  <button
                    onClick={() => onDownloadSingle(result)}
                    disabled={downloadingIds.has(result.extractionId!)}
                    className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50 text-xs"
                  >
                    {downloadingIds.has(result.extractionId!) ? t('downloading') : t('downloadXml')}
                  </button>
                ) : (
                  <span className="text-slate-500">-</span>
                )}
              </td>
            </tr>
          );
        })}
    </>
  );
}

export default function ConversionHistory({ limit = 10, showPagination = true }: Props) {
  const t = useTranslations('history');
  const { toast } = useToast();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const initialStatus = useMemo<'all' | 'draft' | 'completed'>(() => {
    const statusParam = searchParams.get('status');
    if (statusParam === 'draft' || statusParam === 'completed') {
      return statusParam;
    }
    return 'all';
  }, [searchParams]);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'completed'>(initialStatus);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const downloadingRef = useRef<Set<string>>(new Set());
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchHistory = useCallback(
    async (fetchPage: number, filter: string) => {
      try {
        setFetching(true);
        setError(null);
        const statusParam = filter !== 'all' ? `&status=${filter}` : '';
        const response = await fetch(
          `/api/invoices/history?page=${fetchPage}&limit=${limit}${statusParam}`
        );
        if (!mountedRef.current) return;

        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
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
        if (!mountedRef.current) return;

        setConversions(data.items || []);
        setTotal(data.total || 0);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        logger.error('Fetch history exception', err);
        const message = getErrorMessage(err, 'Failed to load history');
        setError(message);
        toast({ title: message, variant: 'error' });
      } finally {
        if (mountedRef.current) {
          setFetching(false);
          setInitialLoading(false);
        }
      }
    },
    [limit, toast]
  );

  // Single effect for fetching — no racing between multiple effects
  useEffect(() => {
    fetchHistory(page, statusFilter);
  }, [fetchHistory, page, statusFilter]);

  // Sync URL search params → state (with page reset)
  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam === 'draft' || statusParam === 'completed') {
      setStatusFilter(statusParam);
      setPage(1);
    } else if (!statusParam) {
      setStatusFilter('all');
      setPage(1);
    }
  }, [searchParams]);

  const handleFilterChange = useCallback((newFilter: 'all' | 'draft' | 'completed') => {
    setStatusFilter(newFilter);
    setPage(1);
  }, []);

  const addDownloading = useCallback((id: string) => {
    downloadingRef.current.add(id);
    setDownloadingIds((prev) => new Set(prev).add(id));
  }, []);

  const removeDownloading = useCallback((id: string) => {
    downloadingRef.current.delete(id);
    setDownloadingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleDownload = useCallback(
    async (conversion: Conversion) => {
      if (!conversion.extraction_id) return;
      const id = conversion.id;
      if (downloadingRef.current.has(id)) return;

      addDownloading(id);
      try {
        const extractionRes = await fetch(`/api/invoices/extractions/${conversion.extraction_id}`);
        if (extractionRes.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (!extractionRes.ok) {
          const errorData = await extractionRes.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to load extraction');
        }
        const extractionData = await extractionRes.json();

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

        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to generate XML');
        }
        const data = await response.json();

        downloadFile(data.data.xmlContent, data.data.fileName);
      } catch (err) {
        toast({ title: getErrorMessage(err, 'Failed to download XML'), variant: 'error' });
      } finally {
        removeDownloading(id);
      }
    },
    [toast, addDownloading, removeDownloading]
  );

  const handleBatchDownload = useCallback(
    async (conversion: Conversion) => {
      const extractionIds =
        conversion.batch_results
          ?.filter((r) => r.status === 'success' && r.extractionId)
          .map((r) => r.extractionId!) || [];

      if (extractionIds.length === 0) return;

      const id = conversion.id;
      if (downloadingRef.current.has(id)) return;

      const confirmed = await confirm({
        title: t('confirmBatchDownload'),
        description: t('confirmBatchDownloadDesc'),
      });
      if (!confirmed) return;

      addDownloading(id);
      try {
        const response = await fetch('/api/invoices/batch-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extractionIds }),
        });

        if (response.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to download batch ZIP');
        }

        const blob = await response.blob();
        downloadFile(blob, `batch_${conversion.id.slice(0, 8)}_invoices.zip`);
      } catch (err) {
        toast({ title: getErrorMessage(err, 'Failed to download batch ZIP'), variant: 'error' });
      } finally {
        removeDownloading(id);
      }
    },
    [toast, confirm, t, addDownloading, removeDownloading]
  );

  const handleSingleFromBatch = useCallback(
    async (result: BatchResultItem) => {
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
    },
    [handleDownload]
  );

  // Initial full skeleton
  if (initialLoading) {
    return (
      <div className="glass-card p-6" role="status" aria-busy="true">
        <span className="sr-only">Loading conversion history...</span>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-white/10 rounded"></div>
          ))}
        </div>
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
              onClick={() => handleFilterChange('all')}
              aria-pressed={statusFilter === 'all'}
              className={`nav-pill ${statusFilter === 'all' ? 'nav-pill-active' : ''}`}
            >
              {t('filterAll')}
            </button>
            <button
              onClick={() => handleFilterChange('draft')}
              aria-pressed={statusFilter === 'draft'}
              className={`nav-pill ${statusFilter === 'draft' ? 'nav-pill-active' : ''}`}
            >
              {t('filterDraft')}
            </button>
            <button
              onClick={() => handleFilterChange('completed')}
              aria-pressed={statusFilter === 'completed'}
              className={`nav-pill ${statusFilter === 'completed' ? 'nav-pill-active' : ''}`}
            >
              {t('filterCompleted')}
            </button>
          </div>
        </div>
      </div>

      {/* Inline loading overlay for subsequent fetches */}
      <div className="relative">
        {fetching && (
          <div className="absolute inset-0 bg-black/20 z-10 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {error ? (
          <div className="p-8 text-center">
            <p className="text-rose-300 mb-4">{error}</p>
            <button
              onClick={() => fetchHistory(page, statusFilter)}
              className="nav-pill nav-pill-active"
            >
              {t('retry')}
            </button>
          </div>
        ) : conversions.length === 0 ? (
          <div className="p-8 text-center text-faded">{t('noConversions')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]" aria-label="Conversion history">
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
                {conversions.map((conversion) =>
                  conversion.record_type === 'batch' ? (
                    <BatchRow
                      key={conversion.id}
                      conversion={conversion}
                      isExpanded={expandedBatchId === conversion.id}
                      onToggle={() =>
                        setExpandedBatchId(expandedBatchId === conversion.id ? null : conversion.id)
                      }
                      onDownloadZip={() => handleBatchDownload(conversion)}
                      onDownloadSingle={handleSingleFromBatch}
                      downloadingIds={downloadingIds}
                      t={t}
                    />
                  ) : (
                    <tr key={conversion.id} className="hover:bg-white/5">
                      <td
                        className="px-4 py-3 text-sm font-medium text-white max-w-[200px] truncate"
                        title={conversion.invoice_number || '-'}
                      >
                        {conversion.invoice_number || '-'}
                      </td>
                      <td
                        className="px-4 py-3 text-sm text-slate-300 max-w-[200px] truncate"
                        title={conversion.file_name}
                      >
                        {conversion.file_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {conversion.record_type === 'extraction' &&
                        conversion.status !== 'completed'
                          ? '-'
                          : conversion.output_format || 'XRechnung'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(conversion.status)}`}
                          aria-label={`Status: ${conversion.status}`}
                        >
                          {getStatusLabel(conversion.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {formatDate(conversion.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {conversion.extraction_id ? (
                          conversion.status === 'draft' ? (
                            <Link
                              href={`/review/${conversion.extraction_id}`}
                              className="inline-flex items-center px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-100 hover:bg-white/10"
                            >
                              {t('resume')}
                            </Link>
                          ) : conversion.status === 'completed' ? (
                            <button
                              onClick={() => handleDownload(conversion)}
                              disabled={downloadingIds.has(conversion.id)}
                              className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
                            >
                              {downloadingIds.has(conversion.id)
                                ? t('downloading')
                                : t('downloadXml')}
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
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showPagination && totalPages > 1 && (
        <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row gap-2 items-center justify-between">
          {total > 0 && (
            <span className="text-sm text-faded" aria-live="polite">
              {t('showing')} {(page - 1) * limit + 1}-{Math.min(page * limit, total)} {t('of')}{' '}
              {total}
            </span>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="nav-pill disabled:opacity-50"
            >
              {t('previous')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
