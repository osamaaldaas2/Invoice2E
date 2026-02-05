'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import FileUploadForm from '@/components/forms/FileUploadForm';

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

export default function UploadPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const userData = localStorage.getItem('user');

        if (!userData) {
            router.push('/login');
            return;
        }

        try {
            setUser(JSON.parse(userData));
        } catch {
            router.push('/login');
        } finally {
            setLoading(false);
        }
    }, [router]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600" />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    const handleExtractionComplete = (extractionId: string) => {
        router.push(`/review/${extractionId}`);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 py-12 px-4">
            <div className="max-w-2xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Invoice</h1>
                    <p className="text-gray-600">
                        Welcome, {user.firstName}! Upload your invoice below.
                    </p>
                    <p className="text-gray-500 text-sm mt-1">
                        Supported formats: PDF, JPG, PNG (Max 25MB)
                    </p>
                </div>

                <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
                    <FileUploadForm
                        userId={user.id}
                        onExtractionComplete={handleExtractionComplete}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <h3 className="font-semibold text-blue-900 mb-2">📄 Supported Formats</h3>
                        <ul className="text-sm text-blue-800 space-y-1">
                            <li>✓ PDF documents</li>
                            <li>✓ JPEG images</li>
                            <li>✓ PNG images</li>
                        </ul>
                    </div>

                    <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                        <h3 className="font-semibold text-green-900 mb-2">📏 File Size</h3>
                        <p className="text-sm text-green-800">Maximum 25MB per file</p>
                        <p className="text-xs text-green-600 mt-1">Larger files will be rejected</p>
                    </div>

                    <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                        <h3 className="font-semibold text-purple-900 mb-2">🤖 AI Processing</h3>
                        <p className="text-sm text-purple-800">Gemini AI extracts data automatically</p>
                        <p className="text-xs text-purple-600 mt-1">Usually takes 5-15 seconds</p>
                    </div>
                </div>

                <div className="mt-8 text-center">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="text-purple-600 hover:text-purple-800 font-medium"
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
