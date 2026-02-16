'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useUser } from '@/lib/user-context';
import { getFormatMetadata } from '@/lib/format-registry';
import type { OutputFormat } from '@/types/canonical-invoice';

interface ValidationIssue {
    ruleId?: string;
    message: string;
    suggestion?: string;
}

export default function ConvertPage() {
    const router = useRouter();
    const params = useParams();
    const extractionId = params.extractionId as string;
    const t = useTranslations('convert');

    const { user, loading } = useUser();
    const [converting, setConverting] = useState(false);
    const [error, setError] = useState('');
    const [validationErrors, setValidationErrors] = useState<ValidationIssue[]>([]);
    const [validationWarnings, setValidationWarnings] = useState<ValidationIssue[]>([]);
    const [success, setSuccess] = useState('');
    const [xmlContent, setXmlContent] = useState('');
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [outputFormat, setOutputFormat] = useState<OutputFormat>('xrechnung-cii');

    const handleConvert = async () => {
        setConverting(true);
        setError('');
        setValidationErrors([]);
        setValidationWarnings([]);
        setSuccess('');

        try {
            // Get the review data from sessionStorage
            const reviewData = sessionStorage.getItem(`review_${extractionId}`);

            if (!reviewData) {
                throw new Error(t('noReviewData'));
            }

            const invoiceData = JSON.parse(reviewData);
            const selectedFormat: OutputFormat = invoiceData.outputFormat || 'xrechnung-cii';
            setOutputFormat(selectedFormat);
            const formatMeta = getFormatMetadata(selectedFormat);

            const response = await fetch('/api/invoices/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversionId: extractionId,
                    userId: user?.id,
                    invoiceData,
                    format: selectedFormat,
                }),
            });

            // Handle PDF responses (binary) vs XML (JSON)
            if (formatMeta.mimeType === 'application/pdf') {
                if (!response.ok) {
                    const errData = await response.json();
                    if (Array.isArray(errData.validationErrors) && errData.validationErrors.length > 0) {
                        setValidationErrors(errData.validationErrors);
                    }
                    throw new Error(errData.error || 'Conversion failed');
                }
                const blob = await response.blob();
                setPdfBlob(blob);
                setSuccess(t('success'));
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                // Set structured validation errors if available
                if (Array.isArray(data.validationErrors) && data.validationErrors.length > 0) {
                    setValidationErrors(data.validationErrors);
                }
                throw new Error(data.error || 'Conversion failed');
            }

            setXmlContent(data.data.xmlContent);
            setSuccess(t('success'));

            // Show warnings on success if present
            if (Array.isArray(data.validationWarnings) && data.validationWarnings.length > 0) {
                setValidationWarnings(data.validationWarnings);
            } else if (Array.isArray(data.data?.validationWarnings) && data.data.validationWarnings.length > 0) {
                setValidationWarnings(data.data.validationWarnings);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Conversion failed');
        } finally {
            setConverting(false);
        }
    };

    const handleDownload = () => {
        const formatMeta = getFormatMetadata(outputFormat);
        const filename = `invoice_${outputFormat}${formatMeta.fileExtension}`;
        const element = document.createElement('a');

        if (pdfBlob) {
            const url = URL.createObjectURL(pdfBlob);
            element.setAttribute('href', url);
            element.setAttribute('download', filename);
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            URL.revokeObjectURL(url);
            return;
        }

        if (!xmlContent) return;
        element.setAttribute('href', `data:text/xml;charset=utf-8,${encodeURIComponent(xmlContent)}`);
        element.setAttribute('download', filename);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <ProtectedRoute fallbackUrl="/login">
            <ErrorBoundary>
                <div className="min-h-screen overflow-x-hidden">
                {/* Progress Steps */}
                <div className="bg-slate-950/70 border-b border-white/10 backdrop-blur-xl mb-8">
                    <div className="container mx-auto px-4 py-4">
                        <div className="flex items-center justify-between gap-2 sm:gap-4">
                            <div className="hidden sm:block w-20" />
                            <div className="flex-1 flex items-center justify-center gap-2 sm:gap-4 min-w-0">
                            <div className="flex items-center gap-1 sm:gap-2">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-white text-sm">✓</div>
                                <span className="text-emerald-200 font-medium text-xs sm:text-sm hidden sm:inline">{t('stepUpload')}</span>
                            </div>
                            <div className="h-px w-6 sm:w-12 bg-emerald-400/30" />
                            <div className="flex items-center gap-1 sm:gap-2">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-white text-sm">✓</div>
                                <span className="text-emerald-200 font-medium text-xs sm:text-sm hidden sm:inline">{t('stepReview')}</span>
                            </div>
                            <div className="h-px w-6 sm:w-12 bg-sky-500/30" />
                            <div className="flex items-center gap-1 sm:gap-2">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-sky-500/20 rounded-full flex items-center justify-center text-white text-sm">3</div>
                                <span className="text-sky-200 font-medium text-xs sm:text-sm hidden sm:inline">{t('stepConvert')}</span>
                            </div>
                            </div>
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="px-3 py-2 text-faded hover:text-white text-sm"
                            >
                                {t('exit')}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="container mx-auto px-4 py-8">
                    <div className="max-w-2xl mx-auto">
                        <div className="mb-8 text-center">
                            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{t('title')}</h1>
                            <p className="text-faded">
                                {t('subtitle')}
                            </p>
                        </div>

                        <div className="glass-card p-4 sm:p-8">
                            <div className="space-y-6">
                                <div className="p-4 glass-panel rounded-lg border border-white/10">
                                    <h3 className="font-semibold text-sky-200 flex items-center gap-2">
                                        ℹ️ {t('whatIsXrechnung')}
                                    </h3>
                                    <p className="text-sm text-faded mt-2">
                                        {t('whatIsXrechnungDesc')}
                                    </p>
                                </div>

                                {error && (
                                    <div className="p-4 glass-panel border border-rose-400/30 rounded-xl space-y-3">
                                        <p className="text-rose-200">❌ {error}</p>

                                        {validationErrors.length > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-sm font-semibold text-rose-300">{t('validationErrors')}</p>
                                                <ul className="space-y-2">
                                                    {validationErrors.map((ve, idx) => (
                                                        <li key={idx} className="p-3 bg-rose-500/10 border border-rose-400/20 rounded-lg">
                                                            <div className="flex items-start gap-2">
                                                                {ve.ruleId && (
                                                                    <span className="text-xs font-mono bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded flex-shrink-0">
                                                                        {ve.ruleId}
                                                                    </span>
                                                                )}
                                                                <span className="text-sm text-rose-200">{ve.message}</span>
                                                            </div>
                                                            {ve.suggestion && (
                                                                <p className="text-xs text-rose-300/70 mt-1 ml-0.5">
                                                                    💡 {ve.suggestion}
                                                                </p>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleConvert}
                                                className="px-4 py-2 bg-sky-500/20 text-sky-200 border border-sky-400/30 rounded-full text-sm font-semibold hover:bg-sky-500/30 transition-colors"
                                            >
                                                🔄 {t('retry')}
                                            </button>
                                            <button
                                                onClick={() => router.push(`/review/${extractionId}`)}
                                                className="px-4 py-2 bg-white/5 text-slate-200 border border-white/10 rounded-full text-sm font-semibold hover:bg-white/10 transition-colors"
                                            >
                                                ← {t('goBackAndFix')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {success && (
                                    <div className="space-y-3">
                                        <div className="p-4 glass-panel border border-emerald-400/30 rounded-xl text-emerald-200">
                                            ✅ {success}
                                        </div>

                                        {validationWarnings.length > 0 && (
                                            <div className="p-4 glass-panel border border-amber-400/30 rounded-xl space-y-2">
                                                <p className="text-sm font-semibold text-amber-300">⚠️ {t('validationWarnings')}</p>
                                                <ul className="space-y-1.5">
                                                    {validationWarnings.map((vw, idx) => (
                                                        <li key={idx} className="flex items-start gap-2 text-sm text-amber-200/80">
                                                            {vw.ruleId && (
                                                                <span className="text-xs font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded flex-shrink-0">
                                                                    {vw.ruleId}
                                                                </span>
                                                            )}
                                                            <span>{vw.message}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!xmlContent && !pdfBlob ? (
                                    <div className="space-y-3">
                                        {!error && (
                                            <>
                                                <button
                                                    onClick={handleConvert}
                                                    disabled={converting}
                                                    className="w-full px-6 py-4 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white rounded-full font-bold text-lg hover:brightness-110 disabled:opacity-50 transition-colors shadow-lg shadow-sky-500/30"
                                                >
                                                    {converting ? (
                                                        <span className="flex items-center justify-center gap-2">
                                                            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                                            {t('generating')}
                                                        </span>
                                                    ) : (
                                                        t('convertButton')
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => router.push(`/review/${extractionId}`)}
                                                    disabled={converting}
                                                    className="w-full px-6 py-3 bg-white/5 text-slate-100 border border-white/10 rounded-full font-semibold hover:bg-white/10 disabled:opacity-50 transition-colors"
                                                >
                                                    {t('backToReview')}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        {xmlContent && (
                                        <div className="p-4 glass-panel border border-white/10 rounded-lg">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-semibold text-faded uppercase tracking-wider">{t('xmlPreview')}</span>
                                                <span className="text-xs text-faded">invoice_{outputFormat}{getFormatMetadata(outputFormat).fileExtension}</span>
                                            </div>
                                            <pre className="text-xs text-slate-200 font-mono overflow-x-auto p-2 bg-slate-950/80 border border-white/10 rounded-xl h-48">
                                                {xmlContent}
                                            </pre>
                                        </div>
                                        )}

                                        {pdfBlob && (
                                        <div className="p-4 glass-panel border border-white/10 rounded-lg text-center">
                                            <p className="text-sm text-slate-300 mb-2">📄 PDF invoice generated ({(pdfBlob.size / 1024).toFixed(1)} KB)</p>
                                        </div>
                                        )}

                                        <button
                                            onClick={handleDownload}
                                            className="w-full px-6 py-4 bg-gradient-to-r from-emerald-400 to-green-500 text-white rounded-full font-bold text-lg hover:brightness-110 transition-colors shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2"
                                        >
                                            📥 {pdfBlob ? t('downloadXml').replace('XML', 'PDF') : t('downloadXml')}
                                        </button>

                                        <button
                                            onClick={() => router.push('/dashboard')}
                                            className="w-full px-6 py-3 bg-white/5 text-slate-100 border border-white/10 rounded-full font-semibold hover:bg-white/10 transition-colors"
                                        >
                                            {t('startNew')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </ErrorBoundary>
        </ProtectedRoute>
    );
}
