'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { FILE_LIMITS } from '@/lib/constants';

type UploadState = 'idle' | 'uploading' | 'extracting' | 'success' | 'error';

type ExtractedData = {
    extractionId: string;
    confidenceScore: number;
    responseTime: number;
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
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
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
        setProgress(20);

        try {
            const formData = new FormData();
            formData.append('file', file);
            if (userId) {
                formData.append('userId', userId);
            }

            setProgress(40);
            setState('extracting');

            const response = await fetch('/api/invoices/extract', {
                method: 'POST',
                body: formData,
            });

            setProgress(80);

            const data = await response.json();

            if (!response.ok) {
                // Check specifically for insufficient credits error from API (402)
                if (response.status === 402) {
                    throw new Error(data.error || 'Insufficient credits');
                }
                throw new Error(data.error || 'Extraction failed');
            }

            setProgress(100);
            setState('success');
            setResult({
                extractionId: data.data.extractionId,
                confidenceScore: data.data.confidenceScore,
                responseTime: data.data.responseTime,
            });

            if (onExtractionComplete) {
                onExtractionComplete(data.data.extractionId, data.data);
            }

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (err) {
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
        setState('idle');
        setError('');
        setResult(null);
        setProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

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
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-sm text-faded mt-2 text-center">
                        {state === 'uploading' ? 'Uploading...' : '🤖 AI extracting invoice data...'}
                    </p>
                </div>
            )}

            {state === 'error' && (
                <div className="mt-4 p-4 glass-panel border border-rose-400/30 rounded-xl">
                    <p className="text-rose-200 font-medium">❌ {error}</p>
                    <button
                        onClick={resetForm}
                        className="mt-2 text-sm text-rose-200/80 hover:text-rose-100 underline"
                    >
                        Try again
                    </button>
                </div>
            )}

            {state === 'success' && result && (
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
                            onClick={() => router.push(withLocale(`/review/${result.extractionId}`))}
                            className="flex-1 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-400 to-green-500 text-white font-semibold hover:brightness-110 transition-colors"
                        >
                            Review & Edit Data
                        </button>
                        <button
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
