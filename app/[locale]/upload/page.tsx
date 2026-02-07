'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import FileUploadForm from '@/components/forms/FileUploadForm';
import { fetchSessionUser } from '@/lib/client-auth';

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

export default function UploadPage() {
    const router = useRouter();
    const params = useParams();
    const locale = (params?.locale as string) || 'en';
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

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

    useEffect(() => {
        const loadUser = async () => {
            try {
                const sessionUser = await fetchSessionUser();
                if (!sessionUser) {
                    router.push(withLocale('/login'));
                    return;
                }
                setUser(sessionUser);
            } catch {
                router.push(withLocale('/login'));
            } finally {
                setLoading(false);
            }
        };

        void loadUser();
    }, [router, withLocale]);

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

    const handleExtractionComplete = (extractionId: string) => {
        router.push(withLocale(`/review/${extractionId}`));
    };

    return (
        <div className="min-h-screen py-12 px-4">
            <div className="max-w-2xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2 font-display">Upload Invoice</h1>
                    <p className="text-faded">
                        Welcome, {user.firstName}! Upload your invoice below.
                    </p>
                    <p className="text-faded text-sm mt-1">
                        Supported formats: PDF, JPG, PNG (Max 25MB)
                    </p>
                </div>

                <div className="glass-card p-8 mb-8">
                    <FileUploadForm
                        userId={user.id}
                        onExtractionComplete={handleExtractionComplete}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="glass-panel rounded-2xl p-4 border border-white/10">
                        <h3 className="font-semibold text-white mb-2">📄 Supported Formats</h3>
                        <ul className="text-sm text-faded space-y-1">
                            <li>✓ PDF documents</li>
                            <li>✓ JPEG images</li>
                            <li>✓ PNG images</li>
                        </ul>
                    </div>

                    <div className="glass-panel rounded-2xl p-4 border border-white/10">
                        <h3 className="font-semibold text-white mb-2">📏 File Size</h3>
                        <p className="text-sm text-faded">Maximum 25MB per file</p>
                        <p className="text-xs text-faded mt-1">Larger files will be rejected</p>
                    </div>

                    <div className="glass-panel rounded-2xl p-4 border border-white/10">
                        <h3 className="font-semibold text-white mb-2">🤖 AI Processing</h3>
                        <p className="text-sm text-faded">Gemini AI extracts data automatically</p>
                        <p className="text-xs text-faded mt-1">Usually takes 5-15 seconds</p>
                    </div>
                </div>

                <div className="mt-8 text-center">
                    <button
                        onClick={() => router.push(withLocale('/dashboard'))}
                        className="text-sky-200 hover:text-sky-100 font-medium"
                    >
                        ← Back to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
