'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { FILE_LIMITS } from '@/lib/constants';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import AILoadingSpinner from '@/components/ui/AILoadingSpinner';
import { Button } from '@/components/ui/button';
import InvoiceReviewForm from './invoice-review/InvoiceReviewForm';

const APPLYABLE_FIELDS = [
  { key: 'sellerName', label: 'Seller Name' },
  { key: 'sellerEmail', label: 'Seller Email (BT-34)' },
  { key: 'sellerPhone', label: 'Seller Phone' },
  { key: 'sellerStreet', label: 'Seller Street' },
  { key: 'sellerCity', label: 'Seller City' },
  { key: 'sellerPostalCode', label: 'Seller Postal Code' },
  { key: 'sellerCountryCode', label: 'Seller Country Code' },
  { key: 'sellerTaxId', label: 'Seller Tax ID' },
  { key: 'sellerVatId', label: 'Seller VAT ID' },
  { key: 'sellerIban', label: 'Seller IBAN' },
  { key: 'sellerBic', label: 'Seller BIC' },
  { key: 'buyerName', label: 'Buyer Name' },
  { key: 'buyerEmail', label: 'Buyer Email (BT-49)' },
  { key: 'buyerStreet', label: 'Buyer Street' },
  { key: 'buyerCity', label: 'Buyer City' },
  { key: 'buyerPostalCode', label: 'Buyer Postal Code' },
  { key: 'buyerCountryCode', label: 'Buyer Country Code' },
  { key: 'buyerTaxId', label: 'Buyer Tax ID' },
  { key: 'buyerReference', label: 'Buyer Reference (BR-DE-15)' },
  { key: 'paymentTerms', label: 'Payment Terms' },
  { key: 'currency', label: 'Currency' },
];

function DashboardApplyToAll({
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
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        setResult(`Error: ${errorData.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setResult(
          `✅ Updated ${data.data.updated} invoices (${data.data.skipped} already had values)`
        );
        setTimeout(() => {
          onApplied();
        }, 1500);
      } else {
        setResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setResult(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setApplying(false);
      isApplyingRef.current = false;
    }
  };

  return (
    <div className="p-4 glass-panel border border-sky-400/20 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-sky-200">
          Apply to All Invoices (only fills missing fields)
        </h4>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xs">
          Close
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
              placeholder={`Enter ${label.toLowerCase()}`}
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
          {applying ? 'Applying...' : 'Apply to All'}
        </button>
        {result && <span className="text-xs text-sky-300">{result}</span>}
      </div>
    </div>
  );
}

type UploadState =
  | 'idle'
  | 'uploading'
  | 'extracting'
  | 'success'
  | 'error'
  | 'downloading'
  | 'done';

type ExtractedData = {
  extractionId: string;
  confidenceScore: number;
  responseTime: number;
};

type MultiInvoiceResult = {
  totalInvoices: number;
  extractions: {
    extractionId: string;
    label: string;
    confidence: number;
    status?: 'success' | 'failed' | 'pending';
    errorMessage?: string;
  }[];
};

type FileUploadFormProps = {
  userId?: string;
  onExtractionComplete?: (extractionId: string, data: ExtractedData) => void;
  availableCredits?: number;
  targetFormat?: string;
};

const MULTI_RESULT_KEY = 'multiInvoiceResult';

export default function FileUploadForm({
  userId,
  onExtractionComplete,
  availableCredits = 0,
  targetFormat,
}: FileUploadFormProps) {
  const router = useRouter();
  const t = useTranslations('upload');
  const tCommon = useTranslations('common');
  const [state, setState] = useState<UploadState>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ExtractedData | null>(null);
  const [multiResult, setMultiResult] = useState<MultiInvoiceResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [backgroundJobId, setBackgroundJobId] = useState<string | null>(null);
  const [backgroundProgress, setBackgroundProgress] = useState(0);
  const [backgroundTotal, setBackgroundTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [extractionCache, setExtractionCache] = useState<Record<string, any>>({});
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [validationResults, setValidationResults] = useState<
    Record<string, { valid: boolean; errors: string[] }>
  >({});
  const [showApplyAll, setShowApplyAll] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<File | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const savedScrollPos = useRef<number>(0);

  const hasCredits = availableCredits > 0;

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
  }, []);

  const startPolling = useCallback(
    (jobId: string) => {
      stopPolling();
      const controller = new AbortController();
      abortRef.current = controller;
      let delay = 2000;

      const poll = async () => {
        if (controller.signal.aborted) return;
        try {
          const response = await fetch(`/api/invoices/extract?jobId=${jobId}`, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const payload = await response.json();
          if (payload.success) {
            const completed = (payload.completedFiles || 0) + (payload.failedFiles || 0);
            const total = payload.totalFiles || 0;
            setBackgroundProgress(payload.progress || 0);
            setBackgroundTotal(total);
            setProgress(total > 0 ? Math.round((completed / total) * 100) : 0);

            // Build live extraction list from results during processing
            const results = payload.results || [];
            if (results.length > 0) {
              type PollResult = {
                filename?: string;
                extractionId?: string;
                confidenceScore?: number;
                status: string;
                error?: string;
                errorMessage?: string;
              };
              const extractions = results.map((r: PollResult, idx: number) => ({
                extractionId: r.extractionId || '',
                label: r.filename || `Invoice ${idx + 1}`,
                confidence: r.confidenceScore || 0,
                status: r.status as 'success' | 'failed' | 'pending',
                errorMessage: r.errorMessage || r.error || undefined,
              }));
              setMultiResult({
                totalInvoices: total,
                extractions,
              });
            }

            const isDone = payload.status && completedStatuses.has(payload.status);
            const allProcessed =
              (payload.totalFiles || 0) > 0 &&
              (payload.completedFiles || 0) + (payload.failedFiles || 0) >=
                (payload.totalFiles || 0);

            if (isDone || allProcessed) {
              stopPolling();
              setBackgroundJobId(null);
              setState('success');
              setProgress(100);
              return;
            }
          }
        } catch {
          // Silently ignore poll errors, will retry
        }
        delay = Math.min(delay * 1.3, 8000);
        pollRef.current = setTimeout(poll, delay);
      };

      pollRef.current = setTimeout(poll, delay);
    },
    [stopPolling, completedStatuses]
  );

  // Cleanup polling and active fetches on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      abortRef.current?.abort();
    };
  }, [stopPolling]);

  // Restore multi-result from sessionStorage on mount (survives navigation to /review)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(MULTI_RESULT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as MultiInvoiceResult;
        if (parsed.extractions?.length > 0) {
          setMultiResult(parsed);
          setState('success');
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Persist multi-result to sessionStorage when it changes
  useEffect(() => {
    if (multiResult) {
      sessionStorage.setItem(MULTI_RESULT_KEY, JSON.stringify(multiResult));
    }
  }, [multiResult]);

  // Restore reviewedIds from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('reviewedExtractionIds');
      if (saved) {
        setReviewedIds(new Set(JSON.parse(saved) as string[]));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist reviewedIds
  useEffect(() => {
    if (reviewedIds.size > 0) {
      sessionStorage.setItem('reviewedExtractionIds', JSON.stringify([...reviewedIds]));
    }
  }, [reviewedIds]);

  // Auto-validate after multi-invoice extraction completes (success or error with results)
  useEffect(() => {
    if (!multiResult || (state !== 'success' && state !== 'error')) return;
    if (Object.keys(validationResults).length > 0) return; // already fetched
    const extractionIds = multiResult.extractions
      .filter((e) => e.extractionId)
      .map((e) => e.extractionId!);
    if (extractionIds.length === 0) return;

    fetch('/api/invoices/batch-validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extractionIds }),
    })
      .then((r) => r.json())
      .then((data) => {
        const results = data?.data?.results || data?.results;
        if (results) {
          const vMap: Record<string, { valid: boolean; errors: string[] }> = {};
          results.forEach((r: { extractionId: string; valid: boolean; errors?: string[] }) => {
            vMap[r.extractionId] = { valid: r.valid, errors: r.errors || [] };
          });
          setValidationResults(vMap);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, multiResult]);

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

  const validateClientSide = useCallback(
    (file: File): string | null => {
      if (file.size > FILE_LIMITS.MAX_FILE_SIZE_BYTES) {
        return `File size exceeds ${FILE_LIMITS.MAX_FILE_SIZE_MB}MB limit`;
      }
      if (!(FILE_LIMITS.ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
        return t('fileTypeNotAllowed');
      }
      return null;
    },
    [t]
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      lastFileRef.current = file;

      if (!hasCredits) {
        setError(t('insufficientCredits'));
        setState('error');
        return;
      }

      const validationError = validateClientSide(file);
      if (validationError) {
        setState('error');
        setError(validationError);
        return;
      }

      setState('uploading');
      setError('');
      setResult(null);
      setMultiResult(null);
      setProgress(5);

      // FIX-027: Gradual progress simulation, cap at 90% until response
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return 90;
          return prev + Math.random() * 5 + 2;
        });
      }, 500);

      const uploadController = new AbortController();
      abortRef.current = uploadController;

      try {
        // FIX-026: Don't send userId in request body, server gets it from session
        const formData = new FormData();
        formData.append('file', file);
        if (targetFormat) {
          formData.append('targetFormat', targetFormat);
        }

        setState('extracting');

        const response = await fetch('/api/invoices/extract', {
          method: 'POST',
          body: formData,
          signal: uploadController.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          // Check specifically for insufficient credits error from API (402)
          if (response.status === 402) {
            throw new Error(data.error || t('insufficientCredits'));
          }
          throw new Error(data.error || t('extractionFailed'));
        }

        clearInterval(progressInterval);

        if (data.data.backgroundJob) {
          // Large multi-invoice PDF: switch to polling mode
          setBackgroundJobId(data.data.jobId);
          setBackgroundTotal(data.data.totalInvoices);
          setBackgroundProgress(0);
          setState('extracting');
          setProgress(0);
          startPolling(data.data.jobId);
          return;
        }

        setProgress(100);
        setState('success');

        if (data.data.multiInvoice) {
          // Multi-invoice PDF result (inline, ≤3)
          setMultiResult({
            totalInvoices: data.data.totalInvoices,
            extractions: data.data.extractions,
          });
        } else {
          // Single invoice result
          setResult({
            extractionId: data.data.extractionId,
            confidenceScore: data.data.confidenceScore,
            responseTime: data.data.responseTime,
          });

          if (onExtractionComplete) {
            onExtractionComplete(data.data.extractionId, data.data);
          }
        }

        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setState('error');
        setError(err instanceof Error ? err.message : t('extractionFailed'));
      } finally {
        clearInterval(progressInterval);
      }
    },
    [validateClientSide, onExtractionComplete, hasCredits, t, startPolling]
  );

  const confirmAndUpload = useCallback(() => {
    if (pendingFile) {
      setShowConfirm(false);
      handleFileUpload(pendingFile);
      setPendingFile(null);
    }
  }, [pendingFile, handleFileUpload]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
      setShowConfirm(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasCredits) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!hasCredits) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      setPendingFile(file);
      setShowConfirm(true);
    }
  };

  const resetForm = useCallback(() => {
    stopPolling();
    setState('idle');
    setError('');
    setResult(null);
    setMultiResult(null);
    sessionStorage.removeItem(MULTI_RESULT_KEY);
    sessionStorage.removeItem('reviewedExtractionIds');
    setExpandedId(null);
    setExtractionCache({});
    setReviewedIds(new Set());
    setValidationResults({});
    setShowApplyAll(false);
    setProgress(0);
    setBackgroundJobId(null);
    setBackgroundProgress(0);
    setBackgroundTotal(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [stopPolling]);

  const handleDownloadZip = useCallback(async () => {
    if (!multiResult) return;

    const extractionIds = multiResult.extractions
      .filter((e) => e.extractionId)
      .map((e) => e.extractionId);

    if (extractionIds.length === 0) return;

    // Block download if any invoices have validation errors
    const hasValidation = Object.keys(validationResults).length > 0;
    if (hasValidation) {
      const invalidCount = Object.values(validationResults).filter((v) => !v.valid).length;
      if (invalidCount > 0) {
        setError(t('fixErrorsBeforeDownload', { count: invalidCount }));
        setState('error');
        return;
      }
    }

    setIsDownloading(true);
    try {
      setState('downloading');
      const response = await fetch('/api/invoices/batch-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractionIds }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'invoices_einvoice.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      // Show checkmark briefly, then reset to idle
      setState('done');
      setIsDownloading(false);
      setTimeout(() => {
        resetForm();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setState('error');
      setIsDownloading(false);
    }
  }, [multiResult, resetForm, t, validationResults]);

  const getStatusIcon = () => {
    if (!hasCredits) return '🔒';
    switch (state) {
      case 'uploading':
        return '📤';
      case 'extracting':
        return '🤖';
      case 'downloading':
        return '🤖';
      case 'done':
        return '✅';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '📄';
    }
  };

  const getStatusMessage = () => {
    if (!hasCredits) return t('insufficientCredits');
    switch (state) {
      case 'uploading':
        return t('uploading');
      case 'extracting':
        return t('extracting');
      case 'downloading':
        return t('generatingZip');
      case 'done':
        return t('downloadComplete');
      case 'success':
        return t('extractionComplete');
      case 'error':
        return t('extractionFailed');
      default:
        return t('dragOrClick');
    }
  };

  const isProcessing = state === 'uploading' || state === 'extracting' || state === 'downloading';
  const isDisabled = isProcessing || state === 'done' || !hasCredits;

  return (
    <div className="w-full mx-auto max-w-4xl">
      {!hasCredits && state === 'idle' && (
        <div className="mb-4 p-4 rounded-xl border border-amber-400/30 bg-amber-500/10 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div className="flex-1">
            <p className="text-amber-200 font-medium text-sm">{t('noCreditsRemaining')}</p>
            <p className="text-amber-200/70 text-xs">{t('purchaseCreditsPrompt')}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/pricing')}
            className="bg-amber-500 text-white hover:bg-amber-400 whitespace-nowrap"
          >
            {t('getCredits')}
          </Button>
        </div>
      )}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!hasCredits) return;
          fileInputRef.current?.click();
        }}
        className={`
                    border-2 border-dashed rounded-2xl p-4 sm:p-8 text-center transition-all
                    ${isDisabled ? 'cursor-not-allowed opacity-70 bg-white/5 border-white/10' : 'cursor-pointer hover:border-sky-400/60'}
                    ${isDragging ? 'border-sky-400 bg-sky-500/10' : 'border-white/20'}
                `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
          disabled={isDisabled}
          className="hidden"
          id="file-input"
        />

        <div className="pointer-events-none">
          {isProcessing ? (
            <AILoadingSpinner
              message={
                state === 'downloading'
                  ? t('generatingZip')
                  : backgroundJobId
                    ? t('processingInvoices', {
                        count: backgroundTotal,
                        progress: backgroundProgress,
                      })
                    : state === 'uploading'
                      ? t('uploading')
                      : t('aiExtracting')
              }
            />
          ) : (
            <>
              <div className="text-4xl sm:text-5xl mb-4">{getStatusIcon()}</div>
              <p
                className={`text-lg font-semibold ${!hasCredits ? 'text-rose-300' : 'text-white'}`}
              >
                {getStatusMessage()}
              </p>
            </>
          )}

          {!isProcessing && !hasCredits && (
            <div className="mt-4 pointer-events-auto">
              <p className="text-sm text-faded mb-3">{t('needOneCredit')}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push('/pricing');
                }}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-full text-sm font-semibold hover:from-amber-400 hover:to-amber-500 transition-colors shadow-sm"
              >
                {t('buyCredits')}
              </button>
            </div>
          )}
          {!isProcessing && hasCredits && (
            <p className="text-sm text-faded mt-2">
              {t('maxFileSize', { size: FILE_LIMITS.MAX_FILE_SIZE_MB })}
            </p>
          )}
        </div>
      </div>

      {isProcessing && state !== 'downloading' && (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-white/10 rounded-full h-2.5">
              <div
                className="bg-gradient-to-r from-emerald-400 to-green-500 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${backgroundJobId ? backgroundProgress : progress}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                stopPolling();
                abortRef.current?.abort();
                resetForm();
              }}
              className="px-3 py-1 text-xs rounded-full border border-white/15 text-slate-300 hover:bg-white/10 transition-colors"
            >
              {tCommon('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Live extraction list during background processing */}
      {state === 'extracting' &&
        backgroundJobId &&
        multiResult &&
        multiResult.extractions.length > 0 && (
          <div className="mt-4 p-4 glass-panel border border-white/10 rounded-xl">
            <p className="text-sm text-faded mb-3">
              {t('processingInvoices', {
                count: multiResult.totalInvoices,
                progress: backgroundProgress,
              })}
            </p>
            <div className="space-y-1 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
              {multiResult.extractions.map((ext, idx) => (
                <div
                  key={ext.extractionId || idx}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5"
                >
                  {ext.status === 'success' ? (
                    <span className="text-emerald-400 text-sm flex-shrink-0">&#10003;</span>
                  ) : ext.status === 'failed' ? (
                    <span className="text-rose-400 text-sm flex-shrink-0">&#10007;</span>
                  ) : (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-sky-400 border-t-transparent flex-shrink-0" />
                  )}
                  <span
                    className={`text-sm truncate ${ext.status === 'pending' ? 'text-faded' : 'text-white'}`}
                  >
                    {ext.label || `Invoice ${idx + 1}`}
                  </span>
                  {ext.status === 'success' && ext.confidence > 0 && (
                    <span className="text-xs text-faded ml-auto flex-shrink-0">
                      {Math.round(ext.confidence * 100)}%
                    </span>
                  )}
                  {ext.status === 'failed' && ext.errorMessage && (
                    <span
                      className="text-xs text-rose-300/70 ml-auto flex-shrink-0 truncate max-w-[150px]"
                      title={ext.errorMessage}
                    >
                      {ext.errorMessage}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      {state === 'error' && !multiResult && (
        <div className="mt-4 p-4 glass-panel border border-rose-400/30 rounded-xl">
          <p className="text-rose-200 font-medium">❌ {error}</p>
          <div className="flex gap-3 mt-3">
            {lastFileRef.current && hasCredits && (
              <Button
                variant="default"
                size="sm"
                onClick={() => lastFileRef.current && handleFileUpload(lastFileRef.current)}
              >
                {t('retry')}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={resetForm}>
              {t('uploadDifferentFile')}
            </Button>
          </div>
        </div>
      )}

      {/* Error state WITH multi-result: show error + extraction list with validation status */}
      {state === 'error' && multiResult && (
        <div className="mt-4 space-y-3">
          <div className="p-4 glass-panel border border-rose-400/30 rounded-xl">
            <p className="text-rose-200 font-medium">❌ {error}</p>
            <p className="text-sm text-faded mt-1">{t('reviewFixAndRetry')}</p>
          </div>
          <div className="p-4 glass-panel border border-white/10 rounded-xl">
            <p className="text-sm text-faded mb-3">
              {t('invoicesDetected', { count: multiResult.totalInvoices })}
            </p>
            {/* Validation summary + Apply to All for error state */}
            {Object.keys(validationResults).length > 0 &&
              (() => {
                const invalidCount = Object.values(validationResults).filter(
                  (v) => !v.valid
                ).length;
                const extractionIds = multiResult.extractions
                  .filter((e) => e.extractionId)
                  .map((e) => e.extractionId!);
                if (invalidCount > 0) {
                  return (
                    <div className="mb-3 space-y-2">
                      <div className="p-3 rounded-xl border border-amber-400/30 bg-amber-500/10">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-amber-200">
                            <strong>{invalidCount}</strong> invoices have errors — fix individually
                            or use Apply to All.
                          </span>
                          <button
                            onClick={() => setShowApplyAll(!showApplyAll)}
                            className="px-3 py-1.5 text-xs font-medium rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-200 hover:bg-sky-500/25"
                          >
                            {showApplyAll ? t('collapse') : t('applyToAll')}
                          </button>
                        </div>
                      </div>
                      {showApplyAll && (
                        <DashboardApplyToAll
                          extractionIds={extractionIds}
                          onApplied={() => {
                            setShowApplyAll(false);
                            setValidationResults({});
                          }}
                          onClose={() => setShowApplyAll(false)}
                        />
                      )}
                    </div>
                  );
                }
                return null;
              })()}
            <div
              className={`space-y-2 pr-1 ${multiResult.extractions.length > 5 ? 'max-h-[70vh] overflow-y-auto scrollbar-thin' : ''}`}
            >
              {multiResult.extractions.map((ext, idx) => {
                const vr = ext.extractionId ? validationResults[ext.extractionId] : null;
                return (
                  <div key={ext.extractionId || idx}>
                    <div
                      className={`flex items-center justify-between glass-panel p-2.5 rounded-lg ${
                        ext.status === 'failed'
                          ? 'border border-rose-400/30'
                          : vr && !vr.valid
                            ? 'border border-amber-400/30'
                            : vr?.valid
                              ? 'border border-emerald-400/20'
                              : 'border border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {ext.status === 'failed' ? (
                          <span className="text-rose-400 text-sm flex-shrink-0">✗</span>
                        ) : vr && !vr.valid ? (
                          <span className="text-amber-400 text-sm flex-shrink-0">⚠</span>
                        ) : vr?.valid ? (
                          <span className="text-emerald-400 text-sm flex-shrink-0">✓</span>
                        ) : reviewedIds.has(ext.extractionId) ? (
                          <span className="text-emerald-400 text-sm flex-shrink-0">✓</span>
                        ) : null}
                        <span className="text-sm font-medium text-white truncate">
                          {ext.label || `Invoice ${idx + 1}`}
                        </span>
                        {ext.confidence > 0 && (
                          <span className="text-xs text-faded flex-shrink-0">
                            {Math.round(ext.confidence * 100)}%
                          </span>
                        )}
                        {vr && !vr.valid && (
                          <span className="text-xs text-amber-300/80 flex-shrink-0">
                            ⚠ {vr.errors.length} {vr.errors.length === 1 ? 'error' : 'errors'}
                          </span>
                        )}
                        {vr?.valid && (
                          <span className="text-xs text-emerald-300/80 flex-shrink-0">✓ valid</span>
                        )}
                      </div>
                      {ext.extractionId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (expandedId === ext.extractionId) {
                              setReviewedIds((prev) => new Set(prev).add(ext.extractionId));
                              setExpandedId(null);
                            } else {
                              setExpandedId(ext.extractionId);
                              loadExtraction(ext.extractionId);
                            }
                          }}
                          className={
                            vr && !vr.valid
                              ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                              : reviewedIds.has(ext.extractionId)
                                ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                                : 'bg-sky-500/20 text-sky-200 hover:bg-sky-500/30'
                          }
                        >
                          {vr && !vr.valid
                            ? t('fixErrors')
                            : reviewedIds.has(ext.extractionId)
                              ? t('reviewed')
                              : expandedId === ext.extractionId
                                ? t('collapse')
                                : t('reviewAndEdit')}
                        </Button>
                      ) : (
                        <span className="text-xs text-rose-300" title={ext.errorMessage}>
                          {ext.errorMessage || t('extractionFailed')}
                        </span>
                      )}
                    </div>
                    {/* Show validation errors inline */}
                    {vr && !vr.valid && expandedId !== ext.extractionId && (
                      <div className="ml-6 mt-1 space-y-0.5">
                        {vr.errors.slice(0, 3).map((err, i) => (
                          <p key={i} className="text-[11px] text-amber-400/70 truncate" title={err}>
                            {err}
                          </p>
                        ))}
                        {vr.errors.length > 3 && (
                          <p className="text-[11px] text-amber-400/50">
                            +{vr.errors.length - 3} more
                          </p>
                        )}
                      </div>
                    )}
                    {expandedId === ext.extractionId && (
                      <div className="mt-2 p-4 glass-panel rounded-xl border border-white/10">
                        {extractionCache[ext.extractionId] ? (
                          <InvoiceReviewForm
                            extractionId={ext.extractionId}
                            userId={userId || ''}
                            initialData={
                              extractionCache[ext.extractionId].extractionData ||
                              extractionCache[ext.extractionId]
                            }
                            confidence={
                              extractionCache[ext.extractionId].confidenceScore ||
                              ext.confidence ||
                              0
                            }
                            compact
                            onSubmitSuccess={() => {
                              setReviewedIds((prev) => new Set(prev).add(ext.extractionId));
                              setExpandedId(null);
                              // Re-validate after fix
                              setValidationResults({});
                            }}
                          />
                        ) : (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-2 border-sky-400 border-t-transparent" />
                            <span className="ml-3 text-sm text-faded">
                              {t('loading') || 'Loading...'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setValidationResults({});
                setState('success');
              }}
              className="flex-1 px-4 py-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-500 text-white font-semibold hover:brightness-110 transition-colors"
            >
              {t('retryDownload')}
            </button>
            <Button variant="outline" onClick={() => router.push('/dashboard/history')}>
              {t('viewInHistory')}
            </Button>
            <Button variant="outline" onClick={resetForm}>
              {t('newUpload')}
            </Button>
          </div>
        </div>
      )}

      {state === 'success' && result && !multiResult && (
        <div className="mt-4 p-4 glass-panel border border-emerald-400/30 rounded-xl">
          <p className="text-emerald-200 font-medium mb-3">✅ {t('invoiceExtracted')}</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="glass-panel p-3 rounded-lg">
              <p className="text-faded">{t('confidence')}</p>
              <p className="text-xl font-bold text-emerald-200">{result.confidenceScore}%</p>
            </div>
            <div className="glass-panel p-3 rounded-lg">
              <p className="text-faded">{t('responseTime')}</p>
              <p className="text-xl font-bold text-sky-200">
                {(result.responseTime / 1000).toFixed(1)}s
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => router.push(`/review/${result.extractionId}`)}
              className="flex-1 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-400 to-green-500 text-white font-semibold hover:brightness-110 transition-colors"
            >
              {t('reviewAndEdit')}
            </button>
            <Button variant="outline" onClick={resetForm}>
              {t('newUpload')}
            </Button>
          </div>
        </div>
      )}

      {state === 'success' && multiResult && (
        <div className="mt-4 p-4 glass-panel border border-emerald-400/30 rounded-xl">
          <p className="text-emerald-200 font-medium mb-3">
            ✅ {t('invoicesDetected', { count: multiResult.totalInvoices })}
          </p>
          {multiResult.extractions.length > 5 &&
            (() => {
              const reviewable = multiResult.extractions.filter((e) => e.extractionId).length;
              return (
                <p className="text-xs text-faded mb-2">
                  {reviewedIds.size}/{reviewable} {t('reviewed').toLowerCase()}
                </p>
              );
            })()}
          {/* Validation summary banner */}
          {Object.keys(validationResults).length > 0 &&
            (() => {
              const invalidCount = Object.values(validationResults).filter((v) => !v.valid).length;
              const totalValidated = Object.keys(validationResults).length;
              const extractionIds = multiResult.extractions
                .filter((e) => e.extractionId)
                .map((e) => e.extractionId!);
              if (invalidCount > 0) {
                return (
                  <div className="mb-3 space-y-2">
                    <div className="p-3 rounded-xl border border-amber-400/30 bg-amber-500/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400">⚠</span>
                          <span className="text-sm text-amber-200">
                            <strong>{invalidCount}</strong> of {totalValidated} invoices have
                            validation errors.
                          </span>
                        </div>
                        <button
                          onClick={() => setShowApplyAll(!showApplyAll)}
                          className="px-3 py-1.5 text-xs font-medium rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-200 hover:bg-sky-500/25"
                        >
                          {showApplyAll ? t('collapse') : t('applyToAll')}
                        </button>
                      </div>
                    </div>
                    {showApplyAll && (
                      <DashboardApplyToAll
                        extractionIds={extractionIds}
                        onApplied={() => {
                          setShowApplyAll(false);
                          setValidationResults({});
                        }}
                        onClose={() => setShowApplyAll(false)}
                      />
                    )}
                  </div>
                );
              }
              return (
                <div className="mb-3 p-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span className="text-sm text-emerald-200">
                      All {totalValidated} invoices passed validation.
                    </span>
                  </div>
                </div>
              );
            })()}
          <div
            ref={listScrollRef}
            className={`space-y-2 pr-1 ${multiResult.extractions.length > 5 ? 'max-h-[70vh] overflow-y-auto scrollbar-thin' : ''}`}
          >
            {multiResult.extractions.map((ext, idx) => {
              const vr = ext.extractionId ? validationResults[ext.extractionId] : null;
              return (
                <div key={ext.extractionId || idx}>
                  <div
                    className={`flex items-center justify-between glass-panel p-2.5 rounded-lg ${
                      ext.status === 'failed'
                        ? 'border border-rose-400/30'
                        : vr && !vr.valid
                          ? 'border border-amber-400/30'
                          : vr?.valid
                            ? 'border border-emerald-400/20'
                            : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {ext.status === 'failed' ? (
                        <span className="text-rose-400 text-sm flex-shrink-0">✗</span>
                      ) : vr && !vr.valid ? (
                        <span className="text-amber-400 text-sm flex-shrink-0">⚠</span>
                      ) : vr?.valid ? (
                        <span className="text-emerald-400 text-sm flex-shrink-0">✓</span>
                      ) : reviewedIds.has(ext.extractionId) ? (
                        <span className="text-emerald-400 text-sm flex-shrink-0">✓</span>
                      ) : null}
                      <span className="text-sm font-medium text-white truncate">
                        {ext.label || `Invoice ${idx + 1}`}
                      </span>
                      {ext.confidence > 0 && (
                        <span className="text-xs text-faded flex-shrink-0">
                          {Math.round(ext.confidence * 100)}%
                        </span>
                      )}
                      {vr && !vr.valid && (
                        <span className="text-xs text-amber-300/80 flex-shrink-0">
                          ⚠ {vr.errors.length} {vr.errors.length === 1 ? 'error' : 'errors'}
                        </span>
                      )}
                      {vr?.valid && (
                        <span className="text-xs text-emerald-300/80 flex-shrink-0">✓ valid</span>
                      )}
                    </div>
                    {ext.extractionId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const isCollapsing = expandedId === ext.extractionId;
                          if (isCollapsing) {
                            setReviewedIds((prev) => new Set(prev).add(ext.extractionId));
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
                            setExpandedId(ext.extractionId);
                            loadExtraction(ext.extractionId);
                          }
                        }}
                        className={
                          vr && !vr.valid
                            ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                            : reviewedIds.has(ext.extractionId)
                              ? 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                              : expandedId === ext.extractionId
                                ? 'bg-white/10 text-slate-200 hover:bg-white/15'
                                : 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                        }
                      >
                        {vr && !vr.valid
                          ? t('fixErrors')
                          : reviewedIds.has(ext.extractionId)
                            ? t('reviewed')
                            : expandedId === ext.extractionId
                              ? t('collapse')
                              : t('reviewAndEdit')}
                      </Button>
                    ) : (
                      <span className="text-xs text-rose-300" title={ext.errorMessage}>
                        {ext.errorMessage || tCommon('error')}
                      </span>
                    )}
                  </div>
                  {/* Show validation errors inline when not expanded */}
                  {vr && !vr.valid && expandedId !== ext.extractionId && (
                    <div className="ml-6 mt-1 space-y-0.5">
                      {vr.errors.slice(0, 3).map((err, i) => (
                        <p key={i} className="text-[11px] text-amber-400/70 truncate" title={err}>
                          {err}
                        </p>
                      ))}
                      {vr.errors.length > 3 && (
                        <p className="text-[11px] text-amber-400/50">
                          +{vr.errors.length - 3} more
                        </p>
                      )}
                    </div>
                  )}
                  {expandedId === ext.extractionId && (
                    <div className="mt-2 p-4 glass-panel rounded-xl border border-white/10">
                      {extractionCache[ext.extractionId] ? (
                        <InvoiceReviewForm
                          extractionId={ext.extractionId}
                          userId={userId || ''}
                          initialData={
                            extractionCache[ext.extractionId].extractionData ||
                            extractionCache[ext.extractionId]
                          }
                          confidence={
                            extractionCache[ext.extractionId].confidenceScore || ext.confidence || 0
                          }
                          compact
                          onSubmitSuccess={() => {
                            setReviewedIds((prev) => new Set(prev).add(ext.extractionId));
                            setExpandedId(null);
                            // Re-validate after fix
                            setValidationResults({});
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
                          <span className="ml-3 text-sm text-faded">{tCommon('loading')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Summary of failed extractions */}
          {(() => {
            const failedCount = multiResult.extractions.filter((e) => e.status === 'failed').length;
            const successCount = multiResult.extractions.filter((e) => e.extractionId).length;
            if (failedCount > 0) {
              return (
                <div className="mt-3 p-3 rounded-xl border border-amber-400/30 bg-amber-500/10">
                  <p className="text-sm text-amber-200">
                    ⚠️ {failedCount} of {multiResult.totalInvoices} invoices failed extraction.
                    {successCount > 0 && ` ${successCount} successful invoices can be downloaded.`}
                  </p>
                </div>
              );
            }
            return null;
          })()}
          <div className="flex gap-2 mt-4">
            {(() => {
              const successCount = multiResult.extractions.filter((e) => e.extractionId).length;
              return successCount > 0 ? (
                <button
                  type="button"
                  onClick={handleDownloadZip}
                  disabled={isDownloading}
                  className="flex-1 px-4 py-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-500 text-white font-semibold hover:brightness-110 transition-colors disabled:opacity-50"
                >
                  {isDownloading ? t('generatingZip') : `${t('downloadAllZip')} (${successCount})`}
                </button>
              ) : null;
            })()}
            <Button variant="outline" onClick={() => router.push('/dashboard/history')}>
              {tCommon('viewHistory') || 'View in History'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm(t('confirmNewUpload'))) resetForm();
              }}
            >
              {t('newUpload')}
            </Button>
          </div>
        </div>
      )}

      {/* UX-6: Credit confirmation dialog */}
      <Dialog
        open={showConfirm}
        onOpenChange={(open) => {
          setShowConfirm(open);
          if (!open) setPendingFile(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmUpload')}</DialogTitle>
            <DialogDescription>
              {t('confirmUploadDesc', {
                credits: availableCredits,
                plural: availableCredits !== 1 ? 's' : '',
              })}
            </DialogDescription>
          </DialogHeader>
          {pendingFile && (
            <p className="text-sm text-faded mt-2">
              {t('fileInfo', {
                name: pendingFile.name,
                size: (pendingFile.size / 1024 / 1024).toFixed(1),
              })}
            </p>
          )}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={confirmAndUpload}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white font-semibold rounded-full hover:brightness-110 transition-colors"
            >
              {t('continue')}
            </button>
            <DialogClose className="flex-1 px-4 py-2 rounded-full border border-white/15 text-slate-100 bg-white/5 hover:bg-white/10 transition-colors">
              {tCommon('cancel')}
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
