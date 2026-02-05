'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';

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

    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [converting, setConverting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [xmlContent, setXmlContent] = useState('');

    useEffect(() => {
        const loadData = async () => {
            try {
                const userData = localStorage.getItem('user');
                if (!userData) {
                    router.push('/login');
                    return;
                }

                setUser(JSON.parse(userData));
                setLoading(false);
            } catch {
                router.push('/login');
            }
        };

        loadData();
    }, [router]);

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
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    return (
        <ProtectedRoute fallbackUrl="/login">
            <div className="min-h-screen bg-gray-50">
                {/* Header */}
                <header className="bg-white shadow-sm border-b">
                    <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                        <h1 className="text-2xl font-bold text-blue-600">Invoice2E</h1>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="px-4 py-2 text-gray-600 hover:text-gray-900"
                        >
                            Exit
                        </button>
                    </div>
                </header>

                {/* Progress Steps */}
                <div className="bg-white border-b mb-8">
                    <div className="container mx-auto px-4 py-4">
                        <div className="flex items-center justify-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white">✓</div>
                                <span className="text-green-600 font-medium">Upload</span>
                            </div>
                            <div className="h-px w-12 bg-green-300" />
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white">✓</div>
                                <span className="text-green-600 font-medium">Review</span>
                            </div>
                            <div className="h-px w-12 bg-blue-300" />
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">3</div>
                                <span className="text-blue-600 font-medium">Convert</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="container mx-auto px-4 py-8">
                    <div className="max-w-2xl mx-auto">
                        <div className="mb-8 text-center">
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">Convert to XRechnung</h1>
                            <p className="text-gray-600">
                                Generate compliant XRechnung 3.0 XML from your validated invoice data.
                            </p>
                        </div>

                        <div className="bg-white border rounded-xl shadow-sm p-8">
                            <div className="space-y-6">
                                <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                                    <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                                        ℹ️ What is XRechnung?
                                    </h3>
                                    <p className="text-sm text-blue-800 mt-2">
                                        XRechnung is the standard for electronic invoicing in Germany (CEN/TC 434).
                                        It ensures your invoice is machine-readable and compliant with EU regulations.
                                    </p>
                                </div>

                                {error && (
                                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
                                        ❌ {error}
                                    </div>
                                )}

                                {success && (
                                    <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
                                        ✅ {success}
                                    </div>
                                )}

                                {!xmlContent ? (
                                    <button
                                        onClick={handleConvert}
                                        disabled={converting}
                                        className="w-full px-6 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-lg shadow-blue-200"
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
                                ) : (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div className="p-4 bg-gray-50 border rounded-lg">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">XML Preview</span>
                                                <span className="text-xs text-gray-400">invoice_xrechnung.xml</span>
                                            </div>
                                            <pre className="text-xs text-gray-700 font-mono overflow-x-auto p-2 bg-white border rounded h-48">
                                                {xmlContent}
                                            </pre>
                                        </div>

                                        <button
                                            onClick={handleDownload}
                                            className="w-full px-6 py-4 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-200 flex items-center justify-center gap-2"
                                        >
                                            📥 Download XML File
                                        </button>

                                        <button
                                            onClick={() => router.push('/dashboard')}
                                            className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
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
        </ProtectedRoute>
    );
}
