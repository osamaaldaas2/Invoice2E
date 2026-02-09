'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { fetchSessionUser } from '@/lib/client-auth';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

export default function ConvertPage() {
    const router = useRouter();
    const params = useParams();
    const extractionId = params.extractionId as string;
    const locale = (params.locale as string) || 'en';

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

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [converting, setConverting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [xmlContent, setXmlContent] = useState('');

    useEffect(() => {
        const loadData = async () => {
            try {
                const sessionUser = await fetchSessionUser();
                if (!sessionUser) {
                    router.push(withLocale('/login'));
                    return;
                }

                setUser(sessionUser);
                setLoading(false);
            } catch {
                router.push(withLocale('/login'));
            }
        };

        loadData();
    }, [router, withLocale]);

    const handleConvert = async () => {
        setConverting(true);
        setError('');
        setSuccess('');

        try {
            // Get the review data from sessionStorage
            const reviewData = sessionStorage.getItem(`review_${extractionId}`);

            if (!reviewData) {
                throw new Error('No review data found. Please go back to review step.');
            }

            const invoiceData = JSON.parse(reviewData);

            const response = await fetch('/api/invoices/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversionId: extractionId,
                    userId: user?.id,
                    invoiceData,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Conversion failed');
            }

            setXmlContent(data.data.xmlContent);
            setSuccess('XRechnung conversion successful!');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Conversion failed');
        } finally {
            setConverting(false);
        }
    };

    const handleDownload = () => {
        if (!xmlContent) return;

        const element = document.createElement('a');
        element.setAttribute('href', `data:text/xml;charset=utf-8,${encodeURIComponent(xmlContent)}`);
        element.setAttribute('download', 'invoice_xrechnung.xml');
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
                <div className="min-h-screen">
                {/* Progress Steps */}
                <div className="bg-slate-950/70 border-b border-white/10 backdrop-blur-xl mb-8">
                    <div className="container mx-auto px-4 py-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="w-20" />
                            <div className="flex-1 flex items-center justify-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-white">✓</div>
                                <span className="text-emerald-200 font-medium">Upload</span>
                            </div>
                            <div className="h-px w-12 bg-emerald-400/30" />
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-white">✓</div>
                                <span className="text-emerald-200 font-medium">Review</span>
                            </div>
                            <div className="h-px w-12 bg-sky-500/30" />
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-sky-500/20 rounded-full flex items-center justify-center text-white">3</div>
                                <span className="text-sky-200 font-medium">Convert</span>
                            </div>
                            </div>
                            <button
                                onClick={() => router.push(withLocale('/dashboard'))}
                                className="px-4 py-2 text-faded hover:text-white"
                            >
                                Exit
                            </button>
                        </div>
                    </div>
                </div>

                <div className="container mx-auto px-4 py-8">
                    <div className="max-w-2xl mx-auto">
                        <div className="mb-8 text-center">
                            <h1 className="text-3xl font-bold text-white mb-2">Convert to XRechnung</h1>
                            <p className="text-faded">
                                Generate compliant XRechnung 3.0 XML from your validated invoice data.
                            </p>
                        </div>

                        <div className="glass-card p-8">
                            <div className="space-y-6">
                                <div className="p-4 glass-panel rounded-lg border border-white/10">
                                    <h3 className="font-semibold text-sky-200 flex items-center gap-2">
                                        ℹ️ What is XRechnung?
                                    </h3>
                                    <p className="text-sm text-faded mt-2">
                                        XRechnung is the standard for electronic invoicing in Germany (CEN/TC 434).
                                        It ensures your invoice is machine-readable and compliant with EU regulations.
                                    </p>
                                </div>

                                {error && (
                                    <div className="p-4 glass-panel border border-rose-400/30 rounded-xl text-rose-200">
                                        ❌ {error}
                                    </div>
                                )}

                                {success && (
                                    <div className="p-4 glass-panel border border-emerald-400/30 rounded-xl text-emerald-200">
                                        ✅ {success}
                                    </div>
                                )}

                                {!xmlContent ? (
                                    <div className="space-y-3">
                                        <button
                                            onClick={handleConvert}
                                            disabled={converting}
                                            className="w-full px-6 py-4 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white rounded-full font-bold text-lg hover:brightness-110 disabled:opacity-50 transition-colors shadow-lg shadow-sky-500/30"
                                        >
                                            {converting ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                                    Generating XML...
                                                </span>
                                            ) : (
                                                '⚡ Convert to XRechnung'
                                            )}
                                        </button>
                                        <button
                                            onClick={() => router.push(withLocale(`/review/${extractionId}`))}
                                            disabled={converting}
                                            className="w-full px-6 py-3 bg-white/5 text-slate-100 border border-white/10 rounded-full font-semibold hover:bg-white/10 disabled:opacity-50 transition-colors"
                                        >
                                            Back to Review
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="p-4 glass-panel border border-white/10 rounded-lg">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-semibold text-faded uppercase tracking-wider">XML Preview</span>
                                                <span className="text-xs text-faded">invoice_xrechnung.xml</span>
                                            </div>
                                            <pre className="text-xs text-slate-200 font-mono overflow-x-auto p-2 bg-slate-950/80 border border-white/10 rounded-xl h-48">
                                                {xmlContent}
                                            </pre>
                                        </div>

                                        <button
                                            onClick={handleDownload}
                                            className="w-full px-6 py-4 bg-gradient-to-r from-emerald-400 to-green-500 text-white rounded-full font-bold text-lg hover:brightness-110 transition-colors shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2"
                                        >
                                            📥 Download XML File
                                        </button>

                                        <button
                                            onClick={() => router.push(withLocale('/dashboard'))}
                                            className="w-full px-6 py-3 bg-white/5 text-slate-100 border border-white/10 rounded-full font-semibold hover:bg-white/10 transition-colors"
                                        >
                                            Start New Invoice
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
