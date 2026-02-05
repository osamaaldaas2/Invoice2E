'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
    const [state, setState] = useState<UploadState>('idle');
    const [error, setError] = useState('');
    const [result, setResult] = useState<ExtractedData | null>(null);
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                    border-2 border-dashed rounded-xl p-8 text-center transition-all
                    ${isDisabled ? 'cursor-not-allowed opacity-75 bg-gray-50 border-gray-200' : 'cursor-pointer hover:border-blue-400'}
                    ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}
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
                    <p className={`text-lg font-semibold ${!hasCredits ? 'text-red-500' : 'text-gray-700'}`}>
                        {getStatusMessage()}
                    </p>

                    {!hasCredits ? (
                        <div className="mt-4 pointer-events-auto">
                            <p className="text-sm text-gray-500 mb-3">
                                You need at least 1 credit to upload.
                            </p>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    router.push('/dashboard/credits');
                                }}
                                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg text-sm font-medium hover:from-amber-600 hover:to-amber-700 transition-colors shadow-sm"
                            >
                                Buy Credits
                            </button>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 mt-2">
                            AI extracts data automatically (PDF, JPG, PNG - Max {FILE_LIMITS.MAX_FILE_SIZE_MB}MB)
                        </p>
                    )}
                </div>
            </div>


            {isProcessing && (
                <div className="mt-4">
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-sm text-gray-600 mt-2 text-center">
                        {state === 'uploading' ? 'Uploading...' : '🤖 AI extracting invoice data...'}
                    </p>
                </div>
            )}

            {state === 'error' && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-700 font-medium">❌ {error}</p>
                    <button
                        onClick={resetForm}
                        className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
                    >
                        Try again
                    </button>
                </div>
            )}

            {state === 'success' && result && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-700 font-medium mb-3">✅ Invoice extracted successfully!</p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white p-3 rounded-lg">
                            <p className="text-gray-500">Confidence</p>
                            <p className="text-xl font-bold text-green-600">{result.confidenceScore}%</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg">
                            <p className="text-gray-500">Response Time</p>
                            <p className="text-xl font-bold text-blue-600">{(result.responseTime / 1000).toFixed(1)}s</p>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                        <button
                            onClick={() => router.push(`/review/${result.extractionId}`)}
                            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            Review & Edit Data
                        </button>
                        <button
                            onClick={resetForm}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            New Upload
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
