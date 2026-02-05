'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { FILE_LIMITS } from '@/lib/constants';

interface BatchJob {
    id: string;
    status: string;
    totalFiles: number;
    completedFiles: number;
    failedFiles: number;
    progress: number;
}

export default function BulkUploadForm() {
    const t = useTranslations('bulkUpload');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [job, setJob] = useState<BatchJob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [polling, setPolling] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
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
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        try {
            setUploading(true);
            setError(null);

            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/invoices/bulk-upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            // Start polling for status
            setJob({
                id: data.batchId,
                status: data.status,
                totalFiles: data.totalFiles,
                completedFiles: 0,
                failedFiles: 0,
                progress: 0,
            });

            startPolling(data.batchId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const startPolling = async (batchId: string) => {
        setPolling(true);
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/invoices/bulk-upload?batchId=${batchId}`);
                const data = await response.json();

                if (data.success) {
                    setJob({
                        id: batchId,
                        status: data.status,
                        totalFiles: data.totalFiles,
                        completedFiles: data.completedFiles,
                        failedFiles: data.failedFiles,
                        progress: data.progress,
                    });

                    if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
                        clearInterval(pollInterval);
                        setPolling(false);
                    }
                }
            } catch {
                // Continue polling on error
            }
        }, 2000);
    };

    const handleCancel = async () => {
        if (!job) return;

        try {
            await fetch(`/api/invoices/bulk-upload?batchId=${job.id}`, {
                method: 'DELETE',
            });
            setJob(null);
            setPolling(false);
        } catch {
            // Ignore cancel errors
        }
    };

    const handleReset = () => {
        setFile(null);
        setJob(null);
        setError(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                {t('title')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
                {t('description')}
            </p>

            {error && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                    {error}
                </div>
            )}

            {!job ? (
                <>
                    {/* File Upload Area */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
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
                                <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </div>
                        ) : (
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white">{t('dropZip')}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{t('maxSize')}</p>
                            </div>
                        )}
                    </div>

                    {/* Upload Button */}
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="mt-4 w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {uploading ? t('uploading') : t('startProcessing')}
                    </button>
                </>
            ) : (
                <>
                    {/* Progress Display */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {t('processing')}
                            </span>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${job.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                job.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                }`}>
                                {job.status}
                            </span>
                        </div>

                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                            <div
                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500"
                                style={{ width: `${job.progress}%` }}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">{job.totalFiles}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{t('total')}</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-green-600">{job.completedFiles}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{t('completed')}</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-red-600">{job.failedFiles}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">{t('failed')}</div>
                            </div>
                        </div>

                        <div className="flex gap-2">
                            {polling && (
                                <button
                                    onClick={handleCancel}
                                    className="flex-1 py-2 px-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                >
                                    {t('cancel')}
                                </button>
                            )}
                            {!polling && (
                                <button
                                    onClick={handleReset}
                                    className="flex-1 py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    {t('newUpload')}
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
