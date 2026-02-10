'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FILE_LIMITS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { useUser } from '@/lib/user-context';
import AILoadingSpinner from '@/components/ui/AILoadingSpinner';
import { Button } from '@/components/ui/button';
import InvoiceReviewForm from '@/components/forms/invoice-review/InvoiceReviewForm';

type BatchResult = {
    filename: string;
    status: 'pending' | 'success' | 'failed';
    invoiceNumber?: string;
    error?: string;
    extractionId?: string;
    confidenceScore?: number;
    reviewStatus?: 'pending_review' | 'reviewed' | 'not_available';
};

type BatchJob = {
    id: string;
    status: string;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    progress: number;
    results: BatchResult[];
    downloadUrl?: string;
};

export default function BulkUploadForm() {
    const t = useTranslations('bulkUpload');
    const { user } = useUser();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const listScrollRef = useRef<HTMLDivElement>(null);
    const savedScrollPos = useRef<number>(0);

    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [job, setJob] = useState<BatchJob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [polling, setPolling] = useState(false);

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [extractionCache, setExtractionCache] = useState<Record<string, any>>({});
    const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
    const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'done'>('idle');

    const completedStatuses = useMemo(() => new Set(['completed', 'failed', 'cancelled', 'partial_success']), []);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearTimeout(pollRef.current);
            pollRef.current = null;
        }
        abortRef.current?.abort();
        abortRef.current = null;
        setPolling(false);
    }, []);

    useEffect(() => {
        return () => {
            stopPolling();
            abortRef.current?.abort();
        };
    }, [stopPolling]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;
        if (!selectedFile.name.toLowerCase().endsWith('.zip')) {
            setError(t('zipOnly'));
            return;
        }
        if (selectedFile.size > FILE_LIMITS.MAX_ZIP_SIZE_BYTES) {
            setError(t('fileTooLarge'));
            return;
        }
        setFile(selectedFile);
        setError(null);
    };

    const startPolling = (batchId: string) => {
        stopPolling();
        const controller = new AbortController();
        abortRef.current = controller;
        setPolling(true);
        let delay = 2000;

        const poll = async () => {
            if (controller.signal.aborted) return;
            try {
                const response = await fetch(`/api/invoices/bulk-upload?batchId=${batchId}`, {
                    signal: controller.signal,
                });
                const payload = await response.json() as {
                    success?: boolean;
                    status?: string;
                    totalFiles?: number;
                    completedFiles?: number;
                    failedFiles?: number;
                    progress?: number;
                    results?: BatchResult[];
                    downloadUrl?: string;
                };
                if (payload.success) {
                    setJob((prev) => ({
                        id: batchId,
                        status: payload.status || prev?.status || 'pending',
                        totalFiles: payload.totalFiles || prev?.totalFiles || 0,
                        completedFiles: payload.completedFiles || 0,
                        failedFiles: payload.failedFiles || 0,
                        progress: payload.progress || 0,
                        results: payload.results || prev?.results || [],
                        downloadUrl: payload.downloadUrl || prev?.downloadUrl,
                    }));
                    if (payload.status && completedStatuses.has(payload.status)) {
                        stopPolling();
                        return;
                    }
                }
            } catch (pollError) {
                logger.warn('Bulk status polling failed', {
                    error: pollError instanceof Error ? pollError.message : String(pollError),
                });
            }
            delay = Math.min(delay * 1.5, 20000);
            pollRef.current = setTimeout(poll, delay);
        };

        pollRef.current = setTimeout(poll, delay);
    };

    const handleUpload = async () => {
        if (!file) return;
        try {
            setUploading(true);
            setError(null);
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch('/api/invoices/bulk-upload', { method: 'POST', body: formData });
            const payload = await response.json() as { batchId?: string; status?: string; totalFiles?: number; error?: string };
            if (!response.ok || !payload.batchId) {
                throw new Error(payload.error || 'Upload failed');
            }
            setJob({
                id: payload.batchId,
                status: payload.status || 'pending',
                totalFiles: payload.totalFiles || 0,
                completedFiles: 0,
                failedFiles: 0,
                progress: 0,
                results: [],
            });
            startPolling(payload.batchId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleCancel = async () => {
        if (!job) return;
        try {
            await fetch(`/api/invoices/bulk-upload?batchId=${job.id}`, { method: 'DELETE' });
            stopPolling();
            setJob((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
        } catch {
            // ignore
        }
    };

    const handleReset = () => {
        stopPolling();
        setFile(null);
        setJob(null);
        setError(null);
        setExpandedId(null);
        setExtractionCache({});
        setReviewedIds(new Set());
        setDownloadState('idle');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDownload = async () => {
        if (!job?.downloadUrl) return;
        setDownloadState('downloading');
        try {
            const response = await fetch(job.downloadUrl);
            if (!response.ok) throw new Error('Download failed');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'batch_xrechnung.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            setDownloadState('done');
            setTimeout(() => setDownloadState('idle'), 2500);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Download failed');
            setDownloadState('idle');
        }
    };

    const loadExtraction = useCallback(async (extractionId: string) => {
        if (extractionCache[extractionId]) return;
        try {
            const res = await fetch(`/api/invoices/extractions/${extractionId}`);
            const data = await res.json();
            if (data.data) {
                setExtractionCache(prev => ({ ...prev, [extractionId]: data.data }));
            }
        } catch {
            // Silently fail — user can retry by collapsing/expanding
        }
    }, [extractionCache]);

    return (
        <div className="glass-card p-6">
            <h2 className="text-xl font-bold text-white mb-4 font-display">{t('title')}</h2>
            <p className="text-faded mb-6">{t('description')}</p>

            {error && (
                <div className="mb-4 p-4 glass-panel text-rose-200 rounded-lg border border-rose-400/30">{error}</div>
            )}

            {!job ? (
                <>
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-white/20 rounded-2xl p-8 text-center cursor-pointer hover:border-sky-400/60 transition-colors bg-white/5"
                    >
                        <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileChange} className="hidden" />
                        <div className="text-4xl mb-4">📦</div>
                        {file ? (
                            <div>
                                <p className="font-medium text-white">{file.name}</p>
                                <p className="text-sm text-faded">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                        ) : (
                            <div>
                                <p className="font-medium text-white">{t('dropZip')}</p>
                                <p className="text-sm text-faded">{t('maxSize')}</p>
                            </div>
                        )}
                    </div>
                    {uploading ? (
                        <div className="mt-4">
                            <AILoadingSpinner message={t('uploading')} />
                        </div>
                    ) : (
                        <Button
                            className="mt-4 w-full"
                            onClick={handleUpload}
                            disabled={!file}
                        >
                            {t('startProcessing')}
                        </Button>
                    )}
                </>
            ) : (
                <div className="space-y-4">
                    {/* Processing header */}
                    {polling ? (
                        <AILoadingSpinner
                            message={`${t('processing')} — ${job.completedFiles + job.failedFiles}/${job.totalFiles} (${job.progress}%)`}
                        />
                    ) : (
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-300">{t('processing')}</span>
                            <span className="px-2 py-1 text-xs rounded-full border border-white/10 text-white">{job.status}</span>
                        </div>
                    )}

                    {/* Progress bar */}
                    <div className="w-full bg-white/10 rounded-full h-3">
                        <div className="bg-gradient-to-r from-emerald-400 to-green-500 h-3 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
                    </div>

                    {/* Stats grid */}
                    {(() => {
                        const totalInvoices = job.results.length;
                        const showInvoices = totalInvoices > job.totalFiles;
                        return (
                            <div className={`grid grid-cols-1 ${showInvoices ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-4 text-center`}>
                                <div><div className="text-2xl text-white">{job.totalFiles}</div><div className="text-xs text-faded">{t('total')}</div></div>
                                {showInvoices && (
                                    <div><div className="text-2xl text-sky-200">{totalInvoices}</div><div className="text-xs text-faded">{t('invoices')}</div></div>
                                )}
                                <div><div className="text-2xl text-emerald-200">{job.completedFiles}</div><div className="text-xs text-faded">{t('completed')}</div></div>
                                <div><div className="text-2xl text-rose-200">{job.failedFiles}</div><div className="text-xs text-faded">{t('failed')}</div></div>
                            </div>
                        );
                    })()}

                    {/* Live processing list (during polling) */}
                    {polling && job.results.length > 0 && (
                        <div className="glass-panel p-4 rounded-xl border border-white/10">
                            <div className="space-y-1 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                                {job.results.map((row, idx) => (
                                    <div
                                        key={`${row.filename}-${idx}`}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5"
                                    >
                                        {row.status === 'success' ? (
                                            <span className="text-emerald-400 text-sm flex-shrink-0">&#10003;</span>
                                        ) : row.status === 'failed' ? (
                                            <span className="text-rose-400 text-sm flex-shrink-0">&#10007;</span>
                                        ) : (
                                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-sky-400 border-t-transparent flex-shrink-0" />
                                        )}
                                        <span className={`text-sm truncate ${row.status === 'pending' ? 'text-faded' : 'text-white'}`}>
                                            {row.filename}
                                        </span>
                                        {row.status === 'success' && typeof row.confidenceScore === 'number' && (
                                            <span className="text-xs text-faded ml-auto flex-shrink-0">
                                                {(row.confidenceScore * 100).toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Download loading / done overlay */}
                    {!polling && downloadState === 'downloading' && (
                        <div className="py-8">
                            <AILoadingSpinner message={t('generatingZip')} />
                        </div>
                    )}

                    {!polling && downloadState === 'done' && (
                        <div className="flex flex-col items-center justify-center py-8">
                            <div className="text-4xl mb-2">&#10003;</div>
                            <p className="text-emerald-200 font-semibold">{t('downloadComplete')}</p>
                        </div>
                    )}

                    {/* Completed results list (after polling, hidden during download) */}
                    {!polling && downloadState === 'idle' && job.results.length > 0 && (
                        <div className="glass-panel p-4 rounded-xl border border-white/10">
                            {/* Review counter */}
                            {(() => {
                                const reviewable = job.results.filter(r => r.extractionId).length;
                                return reviewable > 0 ? (
                                    <p className="text-xs text-faded mb-2">
                                        {reviewedIds.size}/{reviewable} {t('reviewed').toLowerCase()}
                                    </p>
                                ) : null;
                            })()}

                            {/* Scrollable accordion list */}
                            <div
                                ref={listScrollRef}
                                className={`space-y-2 pr-1 ${job.results.length > 5 ? 'max-h-[70vh] overflow-y-auto scrollbar-thin' : ''}`}
                            >
                                {job.results.map((row, idx) => (
                                    <div key={`${row.filename}-${idx}`}>
                                        {/* Compact row */}
                                        <div className="flex items-center justify-between glass-panel p-2.5 rounded-lg">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {row.extractionId && reviewedIds.has(row.extractionId) ? (
                                                    <span className="text-emerald-400 text-sm flex-shrink-0">&#10003;</span>
                                                ) : row.status === 'success' ? (
                                                    <span className="text-emerald-400 text-sm flex-shrink-0">&#10003;</span>
                                                ) : row.status === 'failed' ? (
                                                    <span className="text-rose-400 text-sm flex-shrink-0">&#10007;</span>
                                                ) : null}
                                                <span className="text-sm font-medium text-white truncate">
                                                    {row.filename}
                                                </span>
                                                {typeof row.confidenceScore === 'number' && (
                                                    <span className="text-xs text-faded flex-shrink-0">
                                                        {(row.confidenceScore * 100).toFixed(0)}%
                                                    </span>
                                                )}
                                            </div>
                                            {row.extractionId ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        const isCollapsing = expandedId === row.extractionId;
                                                        if (isCollapsing) {
                                                            setReviewedIds(prev => new Set(prev).add(row.extractionId!));
                                                            setExpandedId(null);
                                                            requestAnimationFrame(() => {
                                                                if (listScrollRef.current) {
                                                                    listScrollRef.current.scrollTop = savedScrollPos.current;
                                                                }
                                                            });
                                                        } else {
                                                            if (listScrollRef.current) {
                                                                savedScrollPos.current = listScrollRef.current.scrollTop;
                                                            }
                                                            setExpandedId(row.extractionId!);
                                                            loadExtraction(row.extractionId!);
                                                        }
                                                    }}
                                                    className={
                                                        reviewedIds.has(row.extractionId)
                                                            ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                                                            : expandedId === row.extractionId
                                                                ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                                                                : ''
                                                    }
                                                >
                                                    {reviewedIds.has(row.extractionId)
                                                        ? t('reviewed')
                                                        : expandedId === row.extractionId
                                                            ? t('collapse')
                                                            : t('reviewAndEdit')}
                                                </Button>
                                            ) : row.error ? (
                                                <span className="text-xs text-rose-300 flex-shrink-0 max-w-[200px] truncate" title={row.error}>
                                                    {row.error}
                                                </span>
                                            ) : null}
                                        </div>

                                        {/* Expanded InvoiceReviewForm */}
                                        {expandedId === row.extractionId && (
                                            <div className="mt-2 p-4 glass-panel rounded-xl border border-white/10">
                                                {extractionCache[row.extractionId!] ? (
                                                    <InvoiceReviewForm
                                                        extractionId={row.extractionId!}
                                                        userId={user?.id || ''}
                                                        initialData={extractionCache[row.extractionId!].extractionData || extractionCache[row.extractionId!]}
                                                        confidence={extractionCache[row.extractionId!].confidenceScore || row.confidenceScore || 0}
                                                        compact
                                                        onSubmitSuccess={() => {
                                                            setReviewedIds(prev => new Set(prev).add(row.extractionId!));
                                                            setExpandedId(null);
                                                            requestAnimationFrame(() => {
                                                                if (listScrollRef.current) {
                                                                    listScrollRef.current.scrollTop = savedScrollPos.current;
                                                                }
                                                            });
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="flex items-center justify-center py-8">
                                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-sky-400 border-t-transparent" />
                                                        <span className="ml-3 text-sm text-faded">{t('loadingDraft')}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2">
                        {polling ? (
                            <Button variant="outline" className="flex-1 border-rose-400/30 text-rose-200 bg-rose-500/15 hover:bg-rose-500/25" onClick={handleCancel}>
                                {t('cancel')}
                            </Button>
                        ) : (
                            <>
                                {job.downloadUrl && job.completedFiles > 0 && (
                                    <Button
                                        onClick={handleDownload}
                                        disabled={downloadState !== 'idle'}
                                        className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 text-white"
                                    >
                                        {downloadState === 'downloading' ? t('generatingZip') : downloadState === 'done' ? t('downloadComplete') : t('downloadAllXml')}
                                    </Button>
                                )}
                                <Button variant="outline" className="flex-1" onClick={handleReset}>
                                    {t('newUpload')}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
