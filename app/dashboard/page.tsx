'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import FileUploadForm from '@/components/forms/FileUploadForm';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useUser } from '@/lib/user-context';

type DashboardStats = {
    totalConversions: number;
    successfulConversions: number;
    failedConversions: number;
    totalCreditsUsed: number;
    successRate: number;
    avgProcessingTime: number;
    availableCredits: number;
};

type DraftItem = {
    id: string;
    invoice_number: string;
    file_name: string;
    status: string;
    created_at: string;
    extraction_id?: string;
};

type ConversionItem = {
    id: string;
    invoice_number: string;
    file_name: string;
    status: string;
    created_at: string;
    output_format: string;
    extraction_id?: string;
};

export default function DashboardPage() {
    const router = useRouter();
    const pathname = usePathname();
    const { user, loading: userLoading } = useUser();
    const t = useTranslations('dashboard');

    const navItems = [
        { href: '/dashboard', label: t('navDashboard'), icon: '🏠' },
        { href: '/dashboard/history', label: t('navHistory'), icon: '📋' },
        { href: '/dashboard/analytics', label: t('navAnalytics'), icon: '📊' },
        { href: '/dashboard/templates', label: t('navTemplates'), icon: '📝' },
        { href: '/dashboard/credits', label: t('navCredits'), icon: '💳' },
        { href: '/invoices/bulk-upload', label: t('navBulkUpload'), icon: '📦' },
    ];
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);
    const [drafts, setDrafts] = useState<DraftItem[]>([]);
    const [draftsLoading, setDraftsLoading] = useState(true);
    const [conversions, setConversions] = useState<ConversionItem[]>([]);
    const [conversionsLoading, setConversionsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (userLoading) return;
        if (!user) {
            router.push('/login');
            return;
        }

        const loadData = async () => {
            setError(null);

            // Fetch stats
            try {
                const response = await fetch('/api/invoices/analytics?type=stats', { cache: 'no-store' });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data?.error || 'Failed to load stats');
                }
                if (data.statistics) {
                    setStats(data.statistics);
                }
            } catch (err) {
                setError(prev => prev ?? (err instanceof Error ? err.message : 'Failed to load stats'));
            } finally {
                setStatsLoading(false);
            }

            // Fetch drafts
            try {
                const response = await fetch('/api/invoices/history?status=draft&limit=5', { cache: 'no-store' });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data?.error || 'Failed to load drafts');
                }
                setDrafts(data.items || []);
            } catch (err) {
                setError(prev => prev ?? (err instanceof Error ? err.message : 'Failed to load drafts'));
            } finally {
                setDraftsLoading(false);
            }

            // Fetch recent conversions
            try {
                const response = await fetch('/api/invoices/history?status=completed&limit=5', { cache: 'no-store' });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data?.error || 'Failed to load conversions');
                }
                setConversions(data.items || []);
            } catch (err) {
                setError(prev => prev ?? (err instanceof Error ? err.message : 'Failed to load conversions'));
            } finally {
                setConversionsLoading(false);
            }
        };

        void loadData();
    }, [user, userLoading, router]);

    if (userLoading) {
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
        <ErrorBoundary>
            <div className="min-h-screen overflow-x-hidden">
                <div className="flex min-w-0">
                {/* Sidebar Navigation */}
                <aside className="hidden md:block w-64 bg-slate-950/70 border-r border-white/10 backdrop-blur-xl min-h-screen fixed left-0 top-16">
                    <div className="p-4">
                        <div className="mb-6 pb-4 border-b border-white/10">
                            <p className="text-sm text-faded">{t('welcomeBack')},</p>
                            <p className="font-semibold text-white">{user.firstName} {user.lastName}</p>
                            <p className="text-xs text-faded">{user.email}</p>
                        </div>
                        <nav className="space-y-1">
                            {navItems.map((item) => {
                                const fullHref = item.href;
                                const isActive = pathname === fullHref;
                                return (
                                    <Link
                                        key={item.href}
                                        href={fullHref}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive
                                            ? 'bg-gradient-to-r from-sky-400/20 via-blue-500/10 to-transparent text-sky-100 border border-sky-300/30'
                                            : 'text-slate-200 hover:bg-white/10'
                                            }`}
                                    >
                                        <span>{item.icon}</span>
                                        <span className="font-medium">{item.label}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 min-w-0 ml-0 md:ml-64 p-3 md:p-8">
                    <div className="max-w-6xl mx-auto overflow-hidden">
                        {error && (
                            <div className="mb-6 glass-panel border border-rose-400/30 text-rose-200 px-4 py-3 rounded-xl">
                                {error}
                            </div>
                        )}
                        <div className="md:hidden mb-6">
                            <div className="flex items-center gap-2 mb-4 min-w-0">
                                <span className="chip shrink-0">{user.firstName}</span>
                                <span className="text-faded text-sm truncate min-w-0">{user.email}</span>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {navItems.map((item) => {
                                    const fullHref = item.href;
                                    const isActive = pathname === fullHref;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={fullHref}
                                            className={`nav-pill whitespace-nowrap ${isActive ? 'nav-pill-active' : ''}`}
                                        >
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="mb-8">
                            <h1 className="text-2xl md:text-3xl font-bold text-white">{t('pageTitle')}</h1>
                            <p className="text-faded mt-2">
                                {t('welcomeMessage', { name: user.firstName })}
                            </p>
                        </div>

                        <div className="space-y-8">
                            {/* Upload Section (full width) */}
                            <div className="glass-card p-4 md:p-6">
                                <h2 className="text-lg md:text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <span>📤</span> {t('uploadInvoice')}
                                </h2>
                                {statsLoading ? (
                                    <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
                                ) : (
                                    <FileUploadForm
                                        userId={user.id}
                                        availableCredits={stats?.availableCredits ?? 0}
                                        onExtractionComplete={(extractionId) => {
                                            router.push(`/review/${extractionId}`);
                                        }}
                                    />
                                )}
                            </div>

                            {/* Row 2: Recent Conversions + Drafts */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
                                {/* Recent Conversions */}
                                <div className="glass-card p-4 md:p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                                            <span>📋</span> {t('recentConversions')}
                                        </h2>
                                        <Link
                                            href="/dashboard/history?status=completed"
                                            className="text-sm text-sky-200 hover:underline"
                                        >
                                            {t('viewAllArrow')}
                                        </Link>
                                    </div>
                                    {conversionsLoading ? (
                                        <div className="space-y-3">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />
                                            ))}
                                        </div>
                                    ) : conversions.length === 0 ? (
                                        <div className="text-center py-12 text-faded">
                                            <p className="text-4xl mb-2">📭</p>
                                            <p>{t('noConversions')}</p>
                                            <p className="text-sm mt-1">{t('noConversionsHint')}</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {conversions.map((conversion) => (
                                                <div
                                                    key={conversion.id}
                                                    className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                                                >
                                                    <div>
                                                        <p className="text-white font-medium">
                                                            {conversion.invoice_number || t('invoiceFallback')}
                                                        </p>
                                                        <p className="text-xs text-faded">
                                                            {new Date(conversion.created_at).toLocaleDateString('de-DE', {
                                                                day: '2-digit',
                                                                month: '2-digit',
                                                                year: 'numeric',
                                                            })}
                                                        </p>
                                                    </div>
                                                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">
                                                        {conversion.status || t('completedStatus')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Drafts Section */}
                                <div className="glass-card p-4 md:p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                                            <span>⏳</span> {t('draftsInProgress')}
                                        </h2>
                                        <Link
                                            href="/dashboard/history?status=draft"
                                            className="text-sm text-sky-200 hover:underline"
                                        >
                                            {t('viewAllArrow')}
                                        </Link>
                                    </div>
                                    {draftsLoading ? (
                                        <div className="space-y-3">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />
                                            ))}
                                        </div>
                                    ) : drafts.filter(draft => draft.status === 'draft').length === 0 ? (
                                        <div className="text-center py-8 text-faded">
                                            <p className="text-3xl mb-2">📄</p>
                                            <p>{t('noDrafts')}</p>
                                            <p className="text-sm mt-1">{t('noDraftsHint')}</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {drafts.filter(draft => draft.status === 'draft').map((draft) => (
                                                <div
                                                    key={draft.id}
                                                    className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                                                >
                                                    <div>
                                                        <p className="text-white font-medium">
                                                            {draft.invoice_number || t('draftFallback')}
                                                        </p>
                                                        <p className="text-xs text-faded">
                                                            {new Date(draft.created_at).toLocaleDateString('de-DE', {
                                                                day: '2-digit',
                                                                month: '2-digit',
                                                                year: 'numeric',
                                                            })}
                                                        </p>
                                                    </div>
                                                    <Link
                                                        href={`/review/${draft.extraction_id || draft.id}`}
                                                        className="px-4 py-2 rounded-full bg-amber-500/20 text-amber-100 border border-amber-400/30 hover:bg-amber-500/30"
                                                    >
                                                        {t('resume')}
                                                    </Link>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mt-8">
                            <div className="glass-card p-4 md:p-6">
                                <h3 className="text-faded font-medium text-sm md:text-base">{t('totalConversions')}</h3>
                                <p className="text-2xl md:text-3xl font-bold text-sky-200 mt-2">
                                    {statsLoading ? '--' : (stats?.totalConversions || 0)}
                                </p>
                            </div>
                            <Link href="/pricing" className="glass-card p-4 md:p-6 hover:border-emerald-400/40 transition-colors">
                                <h3 className="text-faded font-medium text-sm md:text-base">{t('creditsRemaining')}</h3>
                                <p className="text-2xl md:text-3xl font-bold text-emerald-200 mt-2">
                                    {statsLoading ? '--' : (stats?.availableCredits ?? '--')}
                                </p>
                            </Link>
                            <Link href="/dashboard/analytics" className="glass-card p-4 md:p-6 hover:border-violet-400/40 transition-colors">
                                <h3 className="text-faded font-medium text-sm md:text-base">{t('successRate')}</h3>
                                <p className="text-2xl md:text-3xl font-bold text-violet-200 mt-2">
                                    {statsLoading ? '--' : `${stats?.successRate || 0}%`}
                                </p>
                            </Link>
                        </div>

                    </div>
                </main>
                </div>
            </div>
        </ErrorBoundary>
    );
}
