'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FILE_LIMITS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { useUser } from '@/lib/user-context';
import AILoadingSpinner from '@/components/ui/AILoadingSpinner';
import { Button } from '@/components/ui/button';
import InvoiceReviewForm from '@/components/forms/invoice-review/InvoiceReviewForm';

/* ------------------------------------------------------------------ */
/*  Shared constants                                                   */
/* ------------------------------------------------------------------ */

const APPLYABLE_FIELDS = [
  { key: 'sellerName', label: 'Verkäufername' },
  { key: 'sellerEmail', label: 'Verkäufer-E-Mail (BT-34)' },
  { key: 'sellerPhone', label: 'Verkäufer-Telefon' },
  { key: 'sellerStreet', label: 'Verkäufer-Straße' },
  { key: 'sellerCity', label: 'Verkäufer-Stadt' },
  { key: 'sellerPostalCode', label: 'Verkäufer-PLZ' },
  { key: 'sellerCountryCode', label: 'Verkäufer-Ländercode' },
  { key: 'sellerTaxId', label: 'Verkäufer-Steuer-ID' },
  { key: 'sellerVatId', label: 'Verkäufer-USt-ID' },
  { key: 'sellerIban', label: 'Verkäufer-IBAN' },
  { key: 'sellerBic', label: 'Verkäufer-BIC' },
  { key: 'buyerName', label: 'Käufername' },
  { key: 'buyerEmail', label: 'Käufer-E-Mail (BT-49)' },
  { key: 'buyerStreet', label: 'Käufer-Straße' },
  { key: 'buyerCity', label: 'Käufer-Stadt' },
  { key: 'buyerPostalCode', label: 'Käufer-PLZ' },
  { key: 'buyerCountryCode', label: 'Käufer-Ländercode' },
  { key: 'buyerTaxId', label: 'Käufer-Steuer-ID' },
  { key: 'buyerReference', label: 'Käufer-Referenz (BR-DE-15)' },
  { key: 'paymentTerms', label: 'Zahlungsbedingungen' },
  { key: 'currency', label: 'Währung' },
];

/* ------------------------------------------------------------------ */
/*  Readiness field labels (for tooltips)                              */
/* ------------------------------------------------------------------ */

const READINESS_CHECKS: { test: (d: any) => boolean; label: string }[] = [
  { test: (d) => !!d.sellerName, label: 'Verkäufername' },
  { test: (d) => !!(d.sellerEmail || d.sellerElectronicAddress), label: 'Verkäufer-E-Mail' },
  { test: (d) => !!(d.buyerEmail || d.buyerElectronicAddress), label: 'Käufer-E-Mail' },
  { test: (d) => !!d.sellerIban, label: 'Verkäufer-IBAN' },
  { test: (d) => Array.isArray(d.lineItems) && d.lineItems.length > 0, label: 'Positionen' },
  { test: (d) => Number(d.totalAmount) > 0, label: 'Gesamtbetrag' },
];

/* ------------------------------------------------------------------ */
/*  Apply to All Panel                                                 */
/* ------------------------------------------------------------------ */

function ApplyToAllPanel({
  extractionIds,
  onApplied,
  onClose,
}: {
  extractionIds: string[];
  onApplied: () => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const isApplyingRef = useRef(false);

  const handleApply = async () => {
    if (isApplyingRef.current) return;
    const filledFields = Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim()));
    if (Object.keys(filledFields).length === 0) return;

    isApplyingRef.current = true;
    setApplying(true);
    try {
      const res = await fetch('/api/invoices/batch-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractionIds, fields: filledFields }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        setResult(`Fehler: ${errorData.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setResult(
          `✅ ${data.data.updated} Rechnungen aktualisiert (${data.data.skipped} hatten bereits Werte)`
        );
        setTimeout(() => {
          onApplied();
        }, 1500);
      } else {
        setResult(`Fehler: ${data.error}`);
      }
    } catch (err) {
      setResult(`Fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
    } finally {
      setApplying(false);
      isApplyingRef.current = false;
    }
  };

  return (
    <div className="p-4 glass-panel border border-sky-400/20 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-sky-200">
          Auf alle Rechnungen anwenden (füllt nur leere Felder)
        </h4>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">
          Schließen
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {APPLYABLE_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-0.5">
            <label className="text-[11px] text-slate-400">{label}</label>
            <input
              type="text"
              value={fields[key] || ''}
              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
              placeholder={label}
              className="px-2 py-1 text-xs bg-white/5 border border-white/10 rounded text-white placeholder:text-slate-600 focus:border-sky-400/50 focus:outline-none"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleApply}
          disabled={applying || Object.values(fields).every((v) => !v.trim())}
          className="px-4 py-1.5 text-xs font-medium rounded-full bg-sky-500/20 border border-sky-400/30 text-sky-100 hover:bg-sky-500/30 disabled:opacity-40"
        >
          {applying ? 'Wird angewendet...' : 'Auf alle anwenden'}
        </button>
        {result && <span className="text-xs text-sky-300">{result}</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

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
  const [showApplyAll, setShowApplyAll] = useState(false);

  const completedStatuses = useMemo(
    () => new Set(['completed', 'failed', 'cancelled', 'partial_success']),
    []
  );

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
        const payload = (await response.json()) as {
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
            status: payload.status ?? prev?.status ?? 'pending',
            totalFiles: payload.totalFiles ?? prev?.totalFiles ?? 0,
            completedFiles: payload.completedFiles ?? 0,
            failedFiles: payload.failedFiles ?? 0,
            progress: payload.progress ?? 0,
            results: payload.results ?? prev?.results ?? [],
            downloadUrl: payload.downloadUrl ?? prev?.downloadUrl,
          }));
          const isDone = payload.status && completedStatuses.has(payload.status);
          const allProcessed =
            (payload.totalFiles ?? 0) > 0 &&
            (payload.completedFiles ?? 0) + (payload.failedFiles ?? 0) >= (payload.totalFiles ?? 0);
          if (isDone || allProcessed) {
            stopPolling();
            return;
          }
        }
      } catch (pollError) {
        logger.warn('Bulk status polling failed', {
          error: pollError instanceof Error ? pollError.message : String(pollError),
        });
      }
      delay = Math.min(delay * 1.5, 10000);
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
      const payload = (await response.json()) as {
        batchId?: string;
        status?: string;
        totalFiles?: number;
        error?: string;
      };
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
    setShowApplyAll(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownload = async () => {
    if (!job) return;
    setDownloadState('downloading');
    setError(null);
    try {
      // Always re-fetch status to get a fresh signed download URL
      const statusRes = await fetch(`/api/invoices/bulk-upload?batchId=${job.id}`);
      const statusData = await statusRes.json();
      const url = statusData.downloadUrl;
      if (url) {
        setJob((prev) => (prev ? { ...prev, downloadUrl: url } : prev));
      }

      if (!url) throw new Error('Download-URL nicht verfügbar. Bitte versuchen Sie es erneut.');
      const response = await fetch(url);
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Download fehlgeschlagen (${response.status})`);
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'batch_xrechnung.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      setDownloadState('done');
      setTimeout(() => setDownloadState('idle'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download fehlgeschlagen');
      setDownloadState('idle');
    }
  };

  // Compute per-invoice readiness from cached extraction data
  const computeReadiness = (data: any): 'ready' | 'warning' => {
    const d = data?.extractionData || data;
    if (!d) return 'warning';
    return READINESS_CHECKS.every((c) => c.test(d)) ? 'ready' : 'warning';
  };

  // Get list of missing field labels for a given extraction
  const getMissingFields = (data: any): string[] => {
    const d = data?.extractionData || data;
    if (!d) return READINESS_CHECKS.map((c) => c.label);
    return READINESS_CHECKS.filter((c) => !c.test(d)).map((c) => c.label);
  };

  const loadExtraction = useCallback(
    async (extractionId: string) => {
      if (extractionCache[extractionId]) return;
      try {
        const res = await fetch(`/api/invoices/extractions/${extractionId}`);
        const data = await res.json();
        if (data.data) {
          setExtractionCache((prev) => ({ ...prev, [extractionId]: data.data }));
        }
      } catch {
        // Silently fail — user can retry by collapsing/expanding
      }
    },
    [extractionCache]
  );

  // Auto-load extractions for readiness check when processing completes
  useEffect(() => {
    if (polling || !job) return;
    const idsToLoad = job.results
      .filter((r) => r.extractionId && !extractionCache[r.extractionId])
      .map((r) => r.extractionId!);
    if (idsToLoad.length === 0) return;

    // Load in batches of 5 to avoid overwhelming the server
    let idx = 0;
    const loadNext = () => {
      const batch = idsToLoad.slice(idx, idx + 5);
      if (batch.length === 0) return;
      idx += 5;
      batch.forEach((id) => {
        fetch(`/api/invoices/extractions/${id}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.data) {
              setExtractionCache((prev) => ({ ...prev, [id]: data.data }));
            }
          })
          .catch(() => {});
      });
      if (idx < idsToLoad.length) {
        setTimeout(loadNext, 500);
      }
    };
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling, job?.results.length]);

  // Compute summary stats
  const extractionIds = useMemo(
    () => (job?.results ?? []).filter((r) => r.extractionId).map((r) => r.extractionId!),
    [job?.results]
  );

  const { warningCount, readyCount } = useMemo(() => {
    let wc = 0;
    let rc = 0;
    for (const id of extractionIds) {
      const cached = extractionCache[id];
      if (!cached) {
        wc++;
        continue;
      } // not loaded yet = treat as warning
      if (computeReadiness(cached) === 'warning') wc++;
      else rc++;
    }
    return { warningCount: wc, readyCount: rc };
  }, [extractionIds, extractionCache]);

  // Callback when Apply to All succeeds — refresh extraction cache
  const handleApplyAllDone = useCallback(() => {
    setShowApplyAll(false);
    // Clear cache to force re-fetch with updated data
    setExtractionCache({});
  }, []);

  return (
    <div className="glass-card p-6">
      <h2 className="text-xl font-bold text-white mb-4 font-display">{t('title')}</h2>
      <p className="text-faded mb-6">{t('description')}</p>

      {error && (
        <div className="mb-4 p-4 glass-panel text-rose-200 rounded-lg border border-rose-400/30">
          {error}
        </div>
      )}

      {!job ? (
        <>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/20 rounded-2xl p-8 text-center cursor-pointer hover:border-sky-400/60 transition-colors bg-white/5"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="hidden"
            />
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
            <Button className="mt-4 w-full" onClick={handleUpload} disabled={!file}>
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
              <span className="px-2 py-1 text-xs rounded-full border border-white/10 text-white">
                {job.status}
              </span>
            </div>
          )}

          {/* Progress bar */}
          <div className="w-full bg-white/10 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-emerald-400 to-green-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>

          {/* Stats grid */}
          {(() => {
            const totalInvoices = job.results.length;
            const showInvoices = totalInvoices > job.totalFiles;
            return (
              <div
                className={`grid grid-cols-1 ${showInvoices ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-4 text-center`}
              >
                <div>
                  <div className="text-2xl text-white">{job.totalFiles}</div>
                  <div className="text-xs text-faded">{t('total')}</div>
                </div>
                {showInvoices && (
                  <div>
                    <div className="text-2xl text-sky-200">{totalInvoices}</div>
                    <div className="text-xs text-faded">{t('invoices')}</div>
                  </div>
                )}
                <div>
                  <div className="text-2xl text-emerald-200">{job.completedFiles}</div>
                  <div className="text-xs text-faded">{t('completed')}</div>
                </div>
                <div>
                  <div className="text-2xl text-rose-200">{job.failedFiles}</div>
                  <div className="text-xs text-faded">{t('failed')}</div>
                </div>
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
                    <span
                      className={`text-sm truncate ${row.status === 'pending' ? 'text-faded' : 'text-white'}`}
                    >
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
                const reviewable = job.results.filter((r) => r.extractionId).length;
                return reviewable > 0 ? (
                  <p className="text-xs text-faded mb-2">
                    {reviewedIds.size}/{reviewable} {t('reviewed').toLowerCase()}
                  </p>
                ) : null;
              })()}

              {/* Validation error summary */}
              {extractionIds.length > 0 && warningCount > 0 && (
                <div className="mb-3 space-y-2">
                  <div className="p-3 rounded-xl border border-amber-400/30 bg-amber-500/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400">⚠</span>
                        <span className="text-sm text-amber-200">
                          <strong>{warningCount}</strong> von {extractionIds.length} Rechnungen
                          haben fehlende Felder — einzeln korrigieren oder „Auf alle anwenden"
                          nutzen.
                        </span>
                      </div>
                      <button
                        onClick={() => setShowApplyAll(!showApplyAll)}
                        className="px-3 py-1.5 text-xs font-medium rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-200 hover:bg-sky-500/25 flex-shrink-0 ml-2"
                      >
                        {showApplyAll ? 'Schließen' : 'Auf alle anwenden'}
                      </button>
                    </div>
                  </div>
                  {showApplyAll && (
                    <ApplyToAllPanel
                      extractionIds={extractionIds}
                      onApplied={handleApplyAllDone}
                      onClose={() => setShowApplyAll(false)}
                    />
                  )}
                </div>
              )}

              {/* All valid banner */}
              {extractionIds.length > 0 && warningCount === 0 && readyCount > 0 && (
                <div className="mb-3 p-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-sm text-emerald-200">
                      Alle {readyCount} Rechnungen sind vollständig.
                    </span>
                  </div>
                </div>
              )}

              {/* Scrollable accordion list */}
              <div
                ref={listScrollRef}
                className={`space-y-2 pr-1 ${job.results.length > 5 ? 'max-h-[70vh] overflow-y-auto scrollbar-thin' : ''}`}
              >
                {job.results.map((row, idx) => {
                  const cached = row.extractionId ? extractionCache[row.extractionId] : null;
                  const readiness = cached ? computeReadiness(cached) : null;
                  const missing = cached && readiness === 'warning' ? getMissingFields(cached) : [];

                  return (
                    <div key={`${row.filename}-${idx}`}>
                      {/* Compact row */}
                      <div
                        className={`flex items-center justify-between glass-panel p-2.5 rounded-lg ${
                          readiness === 'warning'
                            ? 'border border-amber-400/20'
                            : readiness === 'ready'
                              ? 'border border-emerald-400/20'
                              : row.status === 'failed'
                                ? 'border border-rose-400/20'
                                : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {row.extractionId && reviewedIds.has(row.extractionId) ? (
                            <span className="text-emerald-400 text-sm flex-shrink-0">&#10003;</span>
                          ) : row.status === 'success' ? (
                            readiness === 'warning' ? (
                              <span className="text-amber-400 text-sm flex-shrink-0">⚠</span>
                            ) : (
                              <span className="text-emerald-400 text-sm flex-shrink-0">
                                &#10003;
                              </span>
                            )
                          ) : row.status === 'failed' ? (
                            <span className="text-rose-400 text-sm flex-shrink-0">&#10007;</span>
                          ) : null}
                          <span className="text-sm font-medium text-white truncate">
                            {row.filename}
                          </span>
                          {/* Readiness dot with tooltip */}
                          {row.extractionId && cached && (
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${readiness === 'ready' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                              title={
                                readiness === 'ready'
                                  ? 'Bereit'
                                  : `Fehlende Felder: ${missing.join(', ')}`
                              }
                            />
                          )}
                          {/* Missing field count badge */}
                          {missing.length > 0 && (
                            <span className="text-xs text-amber-300/80 flex-shrink-0">
                              ⚠ {missing.length} fehlend
                            </span>
                          )}
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
                                setReviewedIds((prev) => new Set(prev).add(row.extractionId!));
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
                              readiness === 'warning'
                                ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                                : reviewedIds.has(row.extractionId)
                                  ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                                  : expandedId === row.extractionId
                                    ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                                    : ''
                            }
                          >
                            {readiness === 'warning'
                              ? 'Fehler beheben'
                              : reviewedIds.has(row.extractionId)
                                ? t('reviewed')
                                : expandedId === row.extractionId
                                  ? t('collapse')
                                  : t('reviewAndEdit')}
                          </Button>
                        ) : row.error ? (
                          <span
                            className="text-xs text-rose-300 flex-shrink-0 max-w-[200px] truncate"
                            title={row.error}
                          >
                            {row.error}
                          </span>
                        ) : null}
                      </div>

                      {/* Inline missing fields when not expanded */}
                      {missing.length > 0 && expandedId !== row.extractionId && (
                        <div className="ml-6 mt-1 space-y-0.5">
                          {missing.slice(0, 3).map((f, i) => (
                            <p key={i} className="text-[11px] text-amber-400/70 truncate">
                              • {f}
                            </p>
                          ))}
                          {missing.length > 3 && (
                            <p className="text-[11px] text-amber-400/50">
                              +{missing.length - 3} weitere
                            </p>
                          )}
                        </div>
                      )}

                      {/* Expanded InvoiceReviewForm */}
                      {expandedId === row.extractionId && (
                        <div className="mt-2 p-4 glass-panel rounded-xl border border-white/10">
                          {extractionCache[row.extractionId!] ? (
                            <InvoiceReviewForm
                              extractionId={row.extractionId!}
                              userId={user?.id || ''}
                              initialData={
                                extractionCache[row.extractionId!].extractionData ||
                                extractionCache[row.extractionId!]
                              }
                              confidence={
                                extractionCache[row.extractionId!].confidenceScore ||
                                row.confidenceScore ||
                                0
                              }
                              compact
                              onSubmitSuccess={() => {
                                setReviewedIds((prev) => new Set(prev).add(row.extractionId!));
                                setExpandedId(null);
                                // Clear this extraction's cache to re-fetch updated data
                                setExtractionCache((prev) => {
                                  const next = { ...prev };
                                  delete next[row.extractionId!];
                                  return next;
                                });
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
                  );
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {polling ? (
              <Button
                variant="outline"
                className="flex-1 border-rose-400/30 text-rose-200 bg-rose-500/15 hover:bg-rose-500/25"
                onClick={handleCancel}
              >
                {t('cancel')}
              </Button>
            ) : (
              <>
                {job.completedFiles > 0 && (
                  <Button
                    onClick={handleDownload}
                    disabled={downloadState !== 'idle'}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-green-600 hover:brightness-110 text-white"
                  >
                    {downloadState === 'downloading'
                      ? t('generatingZip')
                      : downloadState === 'done'
                        ? t('downloadComplete')
                        : t('downloadAllXml')}
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
