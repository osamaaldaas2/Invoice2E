'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import InvoiceReviewForm from '@/components/forms/InvoiceReviewForm';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useUser } from '@/lib/user-context';

type Extraction = {
    id: string;
    userId: string;
    extractionData: Record<string, unknown>;
    confidenceScore: number;
    createdAt: string;
};

export default function ReviewPage() {
    const router = useRouter();
    const params = useParams();
    const extractionId = params.extractionId as string;

    const { user, loading: userLoading } = useUser();
    const [extraction, setExtraction] = useState<Extraction | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (userLoading) return;
        if (!user) {
            router.push('/login');
            return;
        }

        const loadData = async () => {
            try {
                // Fetch extraction
                const response = await fetch(`/api/invoices/extractions/${extractionId}`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to load extraction');
                }

                // Verify ownership (uses camelCase from API)
                if (data.data.userId !== user.id) {
                    throw new Error('Unauthorized access');
                }

                setExtraction(data.data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load data');
            } finally {
                setLoading(false);
            }
        };

        if (extractionId) {
            loadData();
        }
    }, [extractionId, user, userLoading, router]);

    if (userLoading || loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto mb-4" />
                    <p className="text-faded">Loading invoice data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center max-w-md glass-card p-8">
                    <div className="text-6xl mb-4">❌</div>
                    <h1 className="text-2xl font-bold text-white font-display mb-2">Error Loading Invoice</h1>
                    <p className="text-rose-200 mb-6">{error}</p>
                    <Link
                        href={'/dashboard'}
                        className="px-6 py-3 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 text-white rounded-full hover:brightness-110"
                    >
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    if (!extraction || !user) {
        return null;
    }

    return (
        <ErrorBoundary>
            <div className="min-h-screen overflow-x-hidden">
            <div className="container mx-auto px-4 pt-6 flex items-center justify-between min-w-0">
                <span className="text-faded font-medium">Reviewing Invoice</span>
                <Link
                    href={'/dashboard'}
                    className="px-4 py-2 border border-white/15 rounded-full bg-white/5 hover:bg-white/10"
                >
                    Cancel
                </Link>
            </div>

            {/* Progress Steps */}
            <div className="bg-slate-950/70 border-b border-white/10 backdrop-blur-xl">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-center gap-2 sm:gap-4">
                        <div className="flex items-center gap-1 sm:gap-2">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-white text-sm">
                                ✓
                            </div>
                            <span className="text-emerald-200 font-medium text-xs sm:text-sm hidden sm:inline">Upload</span>
                        </div>
                        <div className="h-px w-6 sm:w-12 bg-sky-500/30" />
                        <div className="flex items-center gap-1 sm:gap-2">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-sky-500/20 rounded-full flex items-center justify-center text-white text-sm">
                                2
                            </div>
                            <span className="text-sky-200 font-medium text-xs sm:text-sm hidden sm:inline">Review</span>
                        </div>
                        <div className="h-px w-6 sm:w-12 bg-white/10" />
                        <div className="flex items-center gap-1 sm:gap-2">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white/10 rounded-full flex items-center justify-center text-faded text-sm">
                                3
                            </div>
                            <span className="text-faded text-xs sm:text-sm hidden sm:inline">Convert</span>
                        </div>
                        <div className="h-px w-6 sm:w-12 bg-white/10" />
                        <div className="flex items-center gap-1 sm:gap-2">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-white/10 rounded-full flex items-center justify-center text-faded text-sm">
                                4
                            </div>
                            <span className="text-faded text-xs sm:text-sm hidden sm:inline">Download</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-8">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-2xl md:text-3xl font-bold text-white font-display mb-2">Review Invoice Data</h1>
                        <p className="text-faded">
                            Please review the AI-extracted data and make any necessary corrections
                            before converting to XRechnung format.
                        </p>
                    </div>

                    <InvoiceReviewForm
                        extractionId={extractionId}
                        userId={user.id}
                        initialData={extraction.extractionData as InitialData}
                        confidence={extraction.confidenceScore}
                    />
                </div>
            </main>
            </div>
        </ErrorBoundary>
    );
}

// Type for the form props
type InitialData = {
    invoiceNumber?: string;
    invoiceDate?: string;
    buyerName?: string;
    buyerEmail?: string;
    buyerAddress?: string;
    buyerTaxId?: string;
    sellerName?: string;
    sellerEmail?: string;
    sellerAddress?: string;
    sellerTaxId?: string;
    lineItems?: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        taxRate?: number;
    }>;
    subtotal?: number;
    taxAmount?: number;
    totalAmount?: number;
    currency?: string;
    paymentTerms?: string;
    notes?: string;
};
