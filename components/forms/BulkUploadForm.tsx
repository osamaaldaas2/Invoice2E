'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FILE_LIMITS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import AILoadingSpinner from '@/components/ui/AILoadingSpinner';

type ReviewStatus = 'pending_review' | 'reviewed' | 'not_available';

type BatchResult = {
    filename: string;
    status: 'pending' | 'success' | 'failed';
    invoiceNumber?: string;
    error?: string;
    extractionId?: string;
    confidenceScore?: number;
    reviewStatus?: ReviewStatus;
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

type ExtractionResponse = {
    success: boolean;
    data?: {
        extractionData?: Record<string, unknown>;
    };
    error?: string;
};

type ReviewDraft = {
    payload: Record<string, unknown>;
    payloadEditor: string;
};

function toNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureLineItems(raw: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((item) => ({
            description: String((item as any)?.description || ''),
            quantity: Math.max(1, toNumber((item as any)?.quantity, 1)),
            unitPrice: Math.max(0.01, toNumber((item as any)?.unitPrice, 0.01)),
            totalPrice: Math.max(0.01, toNumber((item as any)?.totalPrice ?? (item as any)?.lineTotal, 0.01)),
            taxRate: toNumber((item as any)?.taxRate, 19),
        }));
    }
    return [{ description: '', quantity: 1, unitPrice: 1, totalPrice: 1, taxRate: 19 }];
}

function toReviewPayload(raw: Record<string, unknown>): Record<string, unknown> {
    const lineItems = ensureLineItems(raw.lineItems ?? raw.items);
    const subtotal = Math.max(0, toNumber(raw.subtotal, lineItems.reduce((sum, item) => sum + toNumber(item.totalPrice, 0), 0)));
    const taxAmount = Math.max(0, toNumber(raw.taxAmount, subtotal * 0.19));
    const totalAmount = Math.max(0, toNumber(raw.totalAmount, subtotal + taxAmount));

    return {
        invoiceNumber: String(raw.invoiceNumber || ''),
        invoiceDate: String(raw.invoiceDate || new Date().toISOString().split('T')[0] || ''),
        buyerName: String(raw.buyerName || ''),
        buyerEmail: String(raw.buyerEmail || ''),
        buyerAddress: String(raw.buyerAddress || ''),
        buyerCity: String(raw.buyerCity || ''),
        buyerPostalCode: String(raw.buyerPostalCode || ''),
        buyerCountryCode: String(raw.buyerCountryCode || 'DE'),
        buyerTaxId: String(raw.buyerTaxId || ''),
        buyerReference: String(raw.buyerReference || ''),
        sellerName: String(raw.sellerName || raw.supplierName || ''),
        sellerEmail: String(raw.sellerEmail || raw.supplierEmail || ''),
        sellerAddress: String(raw.sellerAddress || raw.supplierAddress || ''),
        sellerCity: String(raw.sellerCity || raw.supplierCity || ''),
        sellerPostalCode: String(raw.sellerPostalCode || raw.supplierPostalCode || ''),
        sellerCountryCode: String(raw.sellerCountryCode || 'DE'),
        sellerTaxId: String(raw.sellerTaxId || raw.supplierTaxId || ''),
        sellerPhone: String(raw.sellerPhone || raw.supplierPhone || ''),
        sellerContact: String(raw.sellerContact || raw.sellerContactName || ''),
        sellerIban: String(raw.sellerIban || ''),
        sellerBic: String(raw.sellerBic || ''),
        bankName: String(raw.bankName || ''),
        buyerPhone: String(raw.buyerPhone || ''),
        paymentTerms: String(raw.paymentTerms || 'Net 30'),
        paymentDueDate: String(raw.paymentDueDate || ''),
        paymentInstructions: String(raw.paymentInstructions || ''),
        lineItems,
        subtotal,
        taxAmount,
        totalAmount,
        currency: String(raw.currency || 'EUR'),
        notes: String(raw.notes || ''),
    };
}

export default function BulkUploadForm() {
    const t = useTranslations('bulkUpload');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [job, setJob] = useState<BatchJob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [polling, setPolling] = useState(false);

    const [activeRow, setActiveRow] = useState<string | null>(null);
    const [tableReviewOpen, setTableReviewOpen] = useState(false);
    const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
    const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({});
    const [savingAll, setSavingAll] = useState(false);
    const [loadingDraft, setLoadingDraft] = useState<Record<string, boolean>>({});

    const completedStatuses = useMemo(() => new Set(['completed', 'failed', 'cancelled', 'partial_success']), []);

    const stopPolling = () => {
        if (pollRef.current) {
            clearTimeout(pollRef.current);
            pollRef.current = null;
        }
        setPolling(false);
    };

    useEffect(() => {
        return () => stopPolling();
    }, []);

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
        setPolling(true);
        let delay = 2000;

        const poll = async () => {
            try {
                const response = await fetch(`/api/invoices/bulk-upload?batchId=${batchId}`);
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
        setActiveRow(null);
        setTableReviewOpen(false);
        setReviewDrafts({});
        setRowSaving({});
        setSavingAll(false);
        setLoadingDraft({});
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const loadDraft = async (extractionId: string): Promise<void> => {
        if (reviewDrafts[extractionId]) return;
        setLoadingDraft((prev) => ({ ...prev, [extractionId]: true }));
        try {
            const response = await fetch(`/api/invoices/extractions/${extractionId}`);
            const payload = await response.json() as ExtractionResponse;
            if (!response.ok || !payload.success || !payload.data) {
                throw new Error(payload.error || 'Failed to load extraction');
            }
            const payloadData = toReviewPayload(payload.data.extractionData || {});
            setReviewDrafts((prev) => ({
                ...prev,
                [extractionId]: {
                    payload: payloadData,
                    payloadEditor: JSON.stringify(payloadData, null, 2),
                },
            }));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load review draft');
        } finally {
            setLoadingDraft((prev) => ({ ...prev, [extractionId]: false }));
        }
    };

    const openRowReview = async (extractionId: string) => {
        await loadDraft(extractionId);
        setActiveRow(extractionId);
    };

    const openTableReview = async () => {
        if (!job) return;
        const extractionIds = job.results.filter((row) => row.extractionId).map((row) => row.extractionId as string);
        await Promise.all(extractionIds.map((id) => loadDraft(id)));
        setTableReviewOpen(true);
    };

    const updateDraftPayload = (extractionId: string, key: string, value: string | number) => {
        setReviewDrafts((prev) => {
            const current = prev[extractionId];
            if (!current) return prev;
            const updatedPayload = { ...current.payload, [key]: value };
            return {
                ...prev,
                [extractionId]: {
                    payload: updatedPayload,
                    payloadEditor: JSON.stringify(updatedPayload, null, 2),
                },
            };
        });
    };

    const updateDraftEditor = (extractionId: string, value: string) => {
        setReviewDrafts((prev) => {
            const current = prev[extractionId];
            if (!current) return prev;
            let parsed = current.payload;
            try {
                parsed = JSON.parse(value);
            } catch {
                // keep previous payload while editing invalid JSON
            }
            return {
                ...prev,
                [extractionId]: {
                    payload: parsed,
                    payloadEditor: value,
                },
            };
        });
    };

    const saveBulk = async (items: Array<{ extractionId: string; reviewedData: Record<string, unknown> }>) => {
        if (!job || items.length === 0) return [];
        const response = await fetch('/api/invoices/review/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId: job.id, items }),
        });
        const payload = await response.json() as {
            success?: boolean;
            data?: { results?: Array<{ extractionId: string; success: boolean; error?: string }> };
            error?: string;
        };
        if (!response.ok || !payload.success) {
            throw new Error(payload.error || 'Failed to save bulk review');
        }
        return payload.data?.results || [];
    };

    const refreshBatchStatus = async () => {
        if (!job) return;
        try {
            const response = await fetch(`/api/invoices/bulk-upload?batchId=${job.id}`);
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
                setJob((prev) => prev ? ({
                    ...prev,
                    status: payload.status || prev.status,
                    totalFiles: payload.totalFiles || prev.totalFiles,
                    completedFiles: payload.completedFiles ?? prev.completedFiles,
                    failedFiles: payload.failedFiles ?? prev.failedFiles,
                    progress: payload.progress ?? prev.progress,
                    results: payload.results || prev.results,
                    downloadUrl: payload.downloadUrl || prev.downloadUrl,
                }) : prev);
            }
        } catch {
            // ignore refresh errors
        }
    };

    const markReviewed = (extractionIds: Set<string>) => {
        setJob((prev) => {
            if (!prev) return prev;
            return {
                ...prev,
                results: prev.results.map((row) =>
                    row.extractionId && extractionIds.has(row.extractionId)
                        ? { ...row, reviewStatus: 'reviewed' as ReviewStatus }
                        : row
                ),
            };
        });
    };

    const saveRowReview = async (extractionId: string) => {
        const draft = reviewDrafts[extractionId];
        if (!draft) return;
        setRowSaving((prev) => ({ ...prev, [extractionId]: true }));
        try {
            const results = await saveBulk([{ extractionId, reviewedData: draft.payload }]);
            const success = results.find((r) => r.extractionId === extractionId && r.success);
            if (!success) {
                throw new Error(results.find((r) => r.extractionId === extractionId)?.error || 'Failed to save row');
            }
            markReviewed(new Set([extractionId]));
            await refreshBatchStatus();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save row');
        } finally {
            setRowSaving((prev) => ({ ...prev, [extractionId]: false }));
        }
    };

    const saveAllReviews = async () => {
        if (!job) return;
        setSavingAll(true);
        try {
            const items = job.results
                .filter((row) => row.extractionId)
                .map((row) => row.extractionId as string)
                .map((id) => ({ extractionId: id, reviewedData: reviewDrafts[id]?.payload }))
                .filter((item): item is { extractionId: string; reviewedData: Record<string, unknown> } => Boolean(item.reviewedData));

            if (items.length === 0) {
                throw new Error('No review drafts loaded');
            }

            const results = await saveBulk(items);
            const successIds = new Set(results.filter((item) => item.success).map((item) => item.extractionId));
            markReviewed(successIds);
            await refreshBatchStatus();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Failed to save all');
        } finally {
            setSavingAll(false);
        }
    };

    const renderEditor = (extractionId: string) => {
        const draft = reviewDrafts[extractionId];
        if (!draft) return <p className="text-faded">Draft not loaded.</p>;
        return (
            <div className="space-y-3">
                <h4 className="text-xs text-faded uppercase tracking-wide">Invoice Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field
                        label="Invoice Number"
                        value={String(draft.payload.invoiceNumber || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'invoiceNumber', value)}
                    />
                    <Field
                        label="Invoice Date"
                        value={String(draft.payload.invoiceDate || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'invoiceDate', value)}
                    />
                    <Field
                        label="Currency"
                        value={String(draft.payload.currency || 'EUR')}
                        onChange={(value) => updateDraftPayload(extractionId, 'currency', value)}
                    />
                </div>
                <h4 className="text-xs text-faded uppercase tracking-wide pt-2">Seller</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field
                        label="Seller Name *"
                        value={String(draft.payload.sellerName || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'sellerName', value)}
                    />
                    <Field
                        label="Seller Email"
                        value={String(draft.payload.sellerEmail || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'sellerEmail', value)}
                    />
                    <Field
                        label="Seller Tax ID"
                        value={String(draft.payload.sellerTaxId || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'sellerTaxId', value)}
                    />
                    <Field
                        label="Seller Address"
                        value={String(draft.payload.sellerAddress || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'sellerAddress', value)}
                    />
                    <Field
                        label="Seller City *"
                        value={String(draft.payload.sellerCity || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'sellerCity', value)}
                    />
                    <Field
                        label="Seller Postal Code *"
                        value={String(draft.payload.sellerPostalCode || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'sellerPostalCode', value)}
                    />
                    <Field
                        label="Seller Country Code *"
                        value={String(draft.payload.sellerCountryCode || 'DE')}
                        onChange={(value) => updateDraftPayload(extractionId, 'sellerCountryCode', value)}
                    />
                    <Field
                        label="Seller Phone"
                        value={String(draft.payload.sellerPhone || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'sellerPhone', value)}
                    />
                </div>
                <h4 className="text-xs text-faded uppercase tracking-wide pt-2">Buyer</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field
                        label="Buyer Name"
                        value={String(draft.payload.buyerName || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'buyerName', value)}
                    />
                    <Field
                        label="Buyer Email"
                        value={String(draft.payload.buyerEmail || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'buyerEmail', value)}
                    />
                    <Field
                        label="Buyer Tax ID"
                        value={String(draft.payload.buyerTaxId || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'buyerTaxId', value)}
                    />
                    <Field
                        label="Buyer Address"
                        value={String(draft.payload.buyerAddress || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'buyerAddress', value)}
                    />
                    <Field
                        label="Buyer City"
                        value={String(draft.payload.buyerCity || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'buyerCity', value)}
                    />
                    <Field
                        label="Buyer Postal Code"
                        value={String(draft.payload.buyerPostalCode || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'buyerPostalCode', value)}
                    />
                    <Field
                        label="Buyer Country Code *"
                        value={String(draft.payload.buyerCountryCode || 'DE')}
                        onChange={(value) => updateDraftPayload(extractionId, 'buyerCountryCode', value)}
                    />
                    <Field
                        label="Buyer Phone"
                        value={String(draft.payload.buyerPhone || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'buyerPhone', value)}
                    />
                </div>
                <h4 className="text-xs text-faded uppercase tracking-wide pt-2">Payment</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field
                        label="Payment Terms"
                        value={String(draft.payload.paymentTerms || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'paymentTerms', value)}
                    />
                    <Field
                        label="Seller IBAN"
                        value={String(draft.payload.sellerIban || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'sellerIban', value)}
                    />
                    <Field
                        label="Seller BIC"
                        value={String(draft.payload.sellerBic || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'sellerBic', value)}
                    />
                    <Field
                        label="Bank Name"
                        value={String(draft.payload.bankName || '')}
                        onChange={(value) => updateDraftPayload(extractionId, 'bankName', value)}
                    />
                </div>
                <label className="block">
                    <span className="text-xs text-faded">Advanced Payload (JSON)</span>
                    <textarea
                        rows={10}
                        value={draft.payloadEditor}
                        onChange={(e) => updateDraftEditor(extractionId, e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/10 text-white text-sm font-mono"
                    />
                </label>
                <button
                    type="button"
                    onClick={() => saveRowReview(extractionId)}
                    disabled={Boolean(rowSaving[extractionId])}
                    className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
                >
                    {rowSaving[extractionId] ? 'Saving...' : 'Save Row'}
                </button>
            </div>
        );
    };

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
                        <button
                            type="button"
                            onClick={handleUpload}
                            disabled={!file}
                            className="mt-4 w-full py-3 px-4 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 hover:brightness-110 text-white font-semibold rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {t('startProcessing')}
                        </button>
                    )}
                </>
            ) : (
                <div className="space-y-4">
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
                    <div className="w-full bg-white/10 rounded-full h-3">
                        <div className="bg-gradient-to-r from-emerald-400 to-green-500 h-3 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div><div className="text-2xl text-white">{job.totalFiles}</div><div className="text-xs text-faded">{t('total')}</div></div>
                        <div><div className="text-2xl text-emerald-200">{job.completedFiles}</div><div className="text-xs text-faded">{t('completed')}</div></div>
                        <div><div className="text-2xl text-rose-200">{job.failedFiles}</div><div className="text-xs text-faded">{t('failed')}</div></div>
                    </div>

                    {job.results.length > 0 && (
                        <div className="glass-panel p-4 rounded-xl border border-white/10">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <h3 className="text-white font-semibold">Per-Invoice Progress</h3>
                                <div className="flex gap-2">
                                    <button type="button" onClick={openTableReview} className="px-3 py-1.5 rounded border border-white/10 bg-white/5 text-white text-sm hover:bg-white/10">
                                        Table Review
                                    </button>
                                    <button type="button" onClick={saveAllReviews} disabled={savingAll} className="px-3 py-1.5 rounded bg-sky-600 text-white text-sm hover:bg-sky-700 disabled:opacity-50">
                                        {savingAll ? 'Saving...' : 'Save All'}
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-x-auto -mx-4 px-4">
                                <table className="w-full text-sm min-w-[600px]">
                                    <thead>
                                        <tr className="border-b border-white/10 text-faded">
                                            <th className="text-left py-2">File</th>
                                            <th className="text-left py-2">Status</th>
                                            <th className="text-left py-2">Confidence</th>
                                            <th className="text-left py-2">Review</th>
                                            <th className="text-left py-2">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {job.results.map((row, idx) => (
                                            <tr key={`${row.filename}-${idx}`} className="border-b border-white/5">
                                                <td className="py-2 text-white">{row.filename}</td>
                                                <td className="py-2 text-slate-200">{row.status}</td>
                                                <td className="py-2 text-slate-200">{typeof row.confidenceScore === 'number' ? `${(row.confidenceScore * 100).toFixed(0)}%` : '-'}</td>
                                                <td className="py-2 text-slate-200">{row.reviewStatus || '-'}</td>
                                                <td className="py-2">
                                                    {row.extractionId ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openRowReview(row.extractionId as string)}
                                                            disabled={Boolean(loadingDraft[row.extractionId])}
                                                            className="px-3 py-1 rounded border border-white/10 text-white bg-white/5 hover:bg-white/10 disabled:opacity-50"
                                                        >
                                                            {loadingDraft[row.extractionId] ? 'Loading...' : 'Row Review'}
                                                        </button>
                                                    ) : (
                                                        <span className="text-faded">{row.error ? 'Failed' : '-'}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeRow && (
                        <div className="glass-panel p-4 rounded-xl border border-sky-400/30">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-white font-semibold">Row Review: {activeRow}</h3>
                                <button type="button" onClick={() => setActiveRow(null)} className="px-3 py-1 rounded border border-white/10 text-slate-200 bg-white/5 hover:bg-white/10">
                                    Close
                                </button>
                            </div>
                            {renderEditor(activeRow)}
                        </div>
                    )}

                    {tableReviewOpen && (
                        <div className="glass-panel p-4 rounded-xl border border-amber-400/30">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-white font-semibold">Table Review</h3>
                                <button type="button" onClick={() => setTableReviewOpen(false)} className="px-3 py-1 rounded border border-white/10 text-slate-200 bg-white/5 hover:bg-white/10">
                                    Close
                                </button>
                            </div>
                            <div className="space-y-4 max-h-[70vh] overflow-auto pr-2">
                                {job.results.filter((row) => row.extractionId).map((row) => {
                                    const extractionId = row.extractionId as string;
                                    return (
                                        <div key={extractionId} className="border border-white/10 rounded-xl p-4 bg-white/5">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-white">{row.filename}</h4>
                                                <button
                                                    type="button"
                                                    onClick={() => saveRowReview(extractionId)}
                                                    disabled={Boolean(rowSaving[extractionId])}
                                                    className="px-3 py-1 rounded bg-sky-600 text-white text-sm hover:bg-sky-700 disabled:opacity-50"
                                                >
                                                    {rowSaving[extractionId] ? 'Saving...' : 'Save Row'}
                                                </button>
                                            </div>
                                            {renderEditor(extractionId)}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-4">
                                <button
                                    type="button"
                                    onClick={saveAllReviews}
                                    disabled={savingAll}
                                    className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                    {savingAll ? 'Saving All...' : 'Save All Reviews'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2">
                        {polling ? (
                            <button type="button" onClick={handleCancel} className="flex-1 py-2 px-4 rounded-full border border-rose-400/30 text-rose-200 bg-rose-500/15 hover:bg-rose-500/25">
                                {t('cancel')}
                            </button>
                        ) : (
                            <>
                                {job.downloadUrl && job.completedFiles > 0 && (
                                    <a
                                        href={job.downloadUrl}
                                        download
                                        className="flex-1 py-2 px-4 rounded-full text-center font-semibold bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 text-white transition-all"
                                    >
                                        Download All XML
                                    </a>
                                )}
                                <button type="button" onClick={handleReset} className="flex-1 py-2 px-4 rounded-full border border-white/15 text-slate-100 bg-white/5 hover:bg-white/10">
                                    {t('newUpload')}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function Field(props: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <label className="block">
            <span className="block text-xs text-faded mb-1">{props.label}</span>
            <input
                value={props.value}
                onChange={(e) => props.onChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/10 text-white text-sm"
            />
        </label>
    );
}
