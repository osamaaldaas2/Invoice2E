'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { FILE_LIMITS } from '@/lib/constants';

type UploadState = 'idle' | 'uploading' | 'extracting' | 'success' | 'error';

type ExtractedData = {
    extractionId: string;
    confidenceScore: number;
    responseTime: number;
};

type MultiInvoiceResult = {
    totalInvoices: number;
    extractions: { extractionId: string; label: string; confidence: number }[];
};


type FileUploadFormProps = {
    userId?: string;
    onExtractionComplete?: (extractionId: string, data: ExtractedData) => void;
    availableCredits?: number;
};

export default function FileUploadForm({ userId, onExtractionComplete, availableCredits = 0 }: FileUploadFormProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [state, setState] = useState<UploadState>('idle');
    const [error, setError] = useState('');
    const [result, setResult] = useState<ExtractedData | null>(null);
    const [multiResult, setMultiResult] = useState<MultiInvoiceResult | null>(null);
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [backgroundJobId, setBackgroundJobId] = useState<string | null>(null);
    const [backgroundProgress, setBackgroundProgress] = useState(0);
    const [backgroundTotal, setBackgroundTotal] = useState(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const hasCredits = availableCredits > 0;

    const completedStatuses = useMemo(() => new Set(['completed', 'failed', 'cancelled', 'partial_success']), []);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const startPolling = useCallback((jobId: string) => {
        stopPolling();
        pollRef.current = setInterval(async () => {
            try {
                const response = await fetch(`/api/invoices/extract?jobId=${jobId}`);
                const payload = await response.json();
                if (payload.success) {
                    const completed = (payload.completedFiles || 0) + (payload.failedFiles || 0);
                    const total = payload.totalFiles || 0;
                    setBackgroundProgress(payload.progress || 0);
                    setBackgroundTotal(total);
                    setProgress(total > 0 ? Math.round((completed / total) * 100) : 0);

                    if (payload.status && completedStatuses.has(payload.status)) {
                        stopPolling();
                        setBackgroundJobId(null);
                        setState('success');
                        setProgress(100);

                        // Convert results to multiResult format
                        const results = payload.results || [];
                        const extractions = results
                            .filter((r: { status: string }) => r.status === 'success' || r.status === 'failed')
                            .map((r: { filename?: string; extractionId?: string; confidenceScore?: number; status: string }, idx: number) => ({
                                extractionId: r.extractionId || '',
                                label: r.filename || `Invoice ${idx + 1}`,
                                confidence: r.confidenceScore || 0,
                            }));

                        setMultiResult({
                            totalInvoices: total,
                            extractions,
                        });
                    }
                }
            } catch {
                // Silently ignore poll errors, will retry on next interval
            }
        }, 2000);
    }, [stopPolling, completedStatuses]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => stopPolling();
    }, [stopPolling]);

    const validateClientSide = useCallback((file: File): string | null => {
        if (file.size > FILE_LIMITS.MAX_FILE_SIZE_BYTES) {
            return `File size exceeds ${FILE_LIMITS.MAX_FILE_SIZE_MB}MB limit`;
        }
        if (!(FILE_LIMITS.ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
            return 'File type not allowed. Use PDF, JPG, or PNG';
        }
        return null;
    }, []);

    const handleFileUpload = useCallback(async (file: File) => {
        if (!hasCredits) {
            setError('Insufficient credits. Please purchase more credits.');
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
            setProgress(prev => {
                if (prev >= 90) return 90;
                return prev + Math.random() * 5 + 2;
            });
        }, 500);

        try {
            // FIX-026: Don't send userId in request body, server gets it from session
            const formData = new FormData();
            formData.append('file', file);

            setState('extracting');

            const response = await fetch('/api/invoices/extract', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                // Check specifically for insufficient credits error from API (402)
                if (response.status === 402) {
                    throw new Error(data.error || 'Insufficient credits');
                }
                throw new Error(data.error || 'Extraction failed');
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
            clearInterval(progressInterval);
            setState('error');
            setError(err instanceof Error ? err.message : 'Extraction failed');
        }
    }, [validateClientSide, userId, onExtractionComplete, hasCredits]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFileUpload(file);
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
            handleFileUpload(file);
        }
    };

    const resetForm = () => {
        stopPolling();
        setState('idle');
        setError('');
        setResult(null);
        setMultiResult(null);
        setProgress(0);
        setBackgroundJobId(null);
        setBackgroundProgress(0);
        setBackgroundTotal(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleDownloadZip = useCallback(async () => {
        if (!multiResult) return;

        const extractionIds = multiResult.extractions
            .filter(e => e.extractionId)
            .map(e => e.extractionId);

        if (extractionIds.length === 0) return;

        setIsDownloading(true);
        try {
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
            a.download = 'invoices_xrechnung.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Download failed');
        } finally {
            setIsDownloading(false);
        }
    }, [multiResult]);

    const getStatusIcon = () => {
        if (!hasCredits) return '🔒';
        switch (state) {
            case 'uploading': return '📤';
            case 'extracting': return '🤖';
            case 'success': return '✅';
            case 'error': return '❌';
            default: return '📄';
        }
    };

    const getStatusMessage = () => {
        if (!hasCredits) return 'Insufficient Credits';
        switch (state) {
            case 'uploading': return 'Uploading file...';
            case 'extracting': return 'AI is extracting invoice data...';
            case 'success': return 'Extraction complete!';
            case 'error': return 'Extraction failed';
            default: return 'Drag invoice or click to select';
        }
    };

    const isProcessing = state === 'uploading' || state === 'extracting';
    const isDisabled = isProcessing || !hasCredits;

    return (
        <div className="w-full max-w-lg mx-auto">
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                    if (!hasCredits) return;
                    fileInputRef.current?.click();
                }}
                className={`
                    border-2 border-dashed rounded-2xl p-8 text-center transition-all
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
                    <div className="text-5xl mb-4">{getStatusIcon()}</div>
                    <p className={`text-lg font-semibold ${!hasCredits ? 'text-rose-300' : 'text-white'}`}>
                        {getStatusMessage()}
                    </p>

                    {!hasCredits ? (
                        <div className="mt-4 pointer-events-auto">
                            <p className="text-sm text-faded mb-3">
                                You need at least 1 credit to upload.
                            </p>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(withLocale('/dashboard/credits'));
                                }}
                                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-full text-sm font-semibold hover:from-amber-400 hover:to-amber-500 transition-colors shadow-sm"
                            >
                                Buy Credits
                            </button>
                        </div>
                    ) : (
                        <p className="text-sm text-faded mt-2">
                            AI extracts data automatically (PDF, JPG, PNG - Max {FILE_LIMITS.MAX_FILE_SIZE_MB}MB)
                        </p>
                    )}
                </div>
            </div>


            {isProcessing && (
                <div className="mt-4">
                    <div className="w-full bg-white/10 rounded-full h-2.5">
                        <div
                            className="bg-gradient-to-r from-sky-400 to-blue-500 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${backgroundJobId ? backgroundProgress : progress}%` }}
                        />
                    </div>
                    <p className="text-sm text-faded mt-2 text-center">
                        {backgroundJobId
                            ? `Processing ${backgroundTotal} invoices... ${backgroundProgress}%`
                            : state === 'uploading'
                                ? 'Uploading...'
                                : 'AI extracting invoice data...'}
                    </p>
                </div>
            )}

            {state === 'error' && (
                <div className="mt-4 p-4 glass-panel border border-rose-400/30 rounded-xl">
                    <p className="text-rose-200 font-medium">❌ {error}</p>
                    <button
                        type="button"
                        onClick={resetForm}
                        className="mt-2 text-sm text-rose-200/80 hover:text-rose-100 underline"
                    >
                        Try again
                    </button>
                </div>
            )}

            {state === 'success' && result && !multiResult && (
                <div className="mt-4 p-4 glass-panel border border-emerald-400/30 rounded-xl">
                    <p className="text-emerald-200 font-medium mb-3">✅ Invoice extracted successfully!</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="glass-panel p-3 rounded-lg">
                            <p className="text-faded">Confidence</p>
                            <p className="text-xl font-bold text-emerald-200">{result.confidenceScore}%</p>
                        </div>
                        <div className="glass-panel p-3 rounded-lg">
                            <p className="text-faded">Response Time</p>
                            <p className="text-xl font-bold text-sky-200">{(result.responseTime / 1000).toFixed(1)}s</p>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button
                            type="button"
                            onClick={() => router.push(withLocale(`/review/${result.extractionId}`))}
                            className="flex-1 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-400 to-green-500 text-white font-semibold hover:brightness-110 transition-colors"
                        >
                            Review & Edit Data
                        </button>
                        <button
                            type="button"
                            onClick={resetForm}
                            className="px-4 py-2 rounded-full border border-white/15 text-slate-100 bg-white/5 hover:bg-white/10 transition-colors"
                        >
                            New Upload
                        </button>
                    </div>
                </div>
            )}

            {state === 'success' && multiResult && (
                <div className="mt-4 p-4 glass-panel border border-emerald-400/30 rounded-xl">
                    <p className="text-emerald-200 font-medium mb-3">
                        ✅ {multiResult.totalInvoices} invoices detected and extracted
                    </p>
                    <div className="space-y-2">
                        {multiResult.extractions.map((ext, idx) => (
                            <div
                                key={ext.extractionId || idx}
                                className="flex items-center justify-between glass-panel p-3 rounded-lg"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-white">
                                        {ext.label || `Invoice ${idx + 1}`}
                                    </span>
                                    {ext.confidence > 0 && (
                                        <span className="text-xs text-faded">
                                            {Math.round(ext.confidence * 100)}% confidence
                                        </span>
                                    )}
                                </div>
                                {ext.extractionId ? (
                                    <button
                                        type="button"
                                        onClick={() => router.push(withLocale(`/review/${ext.extractionId}`))}
                                        className="px-3 py-1 text-sm rounded-full bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 transition-colors"
                                    >
                                        Review
                                    </button>
                                ) : (
                                    <span className="text-xs text-rose-300">Failed</span>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button
                            type="button"
                            onClick={handleDownloadZip}
                            disabled={isDownloading}
                            className="flex-1 px-4 py-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-500 text-white font-semibold hover:brightness-110 transition-colors disabled:opacity-50"
                        >
                            {isDownloading ? 'Generating ZIP...' : 'Download All as ZIP'}
                        </button>
                        <button
                            type="button"
                            onClick={resetForm}
                            className="px-4 py-2 rounded-full border border-white/15 text-slate-100 bg-white/5 hover:bg-white/10 transition-colors"
                        >
                            New Upload
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
