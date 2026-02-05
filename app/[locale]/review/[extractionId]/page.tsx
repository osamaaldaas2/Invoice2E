'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import InvoiceReviewForm from '@/components/forms/InvoiceReviewForm';

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

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

    const [user, setUser] = useState<User | null>(null);
    const [extraction, setExtraction] = useState<Extraction | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadData = async () => {
            try {
                // Check auth
                const userData = localStorage.getItem('user');
                if (!userData) {
                    router.push('/login');
                    return;
                }

                const parsedUser = JSON.parse(userData);
                setUser(parsedUser);

                // Fetch extraction
                const response = await fetch(`/api/invoices/extractions/${extractionId}`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to load extraction');
                }

                // Verify ownership (uses camelCase from API)
                if (data.data.userId !== parsedUser.id) {
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
    }, [extractionId, router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600">Loading invoice data...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center max-w-md">
                    <div className="text-6xl mb-4">❌</div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Invoice</h1>
                    <p className="text-red-600 mb-6">{error}</p>
                    <Link
                        href="/dashboard"
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="container mx-auto px-4 py-4 flex justify-between items-center">
                    <Link href="/" className="text-2xl font-bold text-blue-600">
                        Invoice2E
                    </Link>
                    <div className="flex items-center gap-4">
                        <span className="text-gray-600">Reviewing Invoice</span>
                        <Link
                            href="/dashboard"
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </Link>
                    </div>
                </div>
            </header>

            {/* Progress Steps */}
            <div className="bg-white border-b">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white">
                                ✓
                            </div>
                            <span className="text-green-600 font-medium">Upload</span>
                        </div>
                        <div className="h-px w-12 bg-blue-300" />
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                                2
                            </div>
                            <span className="text-blue-600 font-medium">Review</span>
                        </div>
                        <div className="h-px w-12 bg-gray-300" />
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-600">
                                3
                            </div>
                            <span className="text-gray-500">Convert</span>
                        </div>
                        <div className="h-px w-12 bg-gray-300" />
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center text-gray-600">
                                4
                            </div>
                            <span className="text-gray-500">Download</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="container mx-auto px-4 py-8">
                <div className="max-w-4xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Review Invoice Data</h1>
                        <p className="text-gray-600">
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
    supplierName?: string;
    supplierEmail?: string;
    supplierAddress?: string;
    supplierTaxId?: string;
    items?: Array<{
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
