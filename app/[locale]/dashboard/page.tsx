'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import FileUploadForm from '@/components/forms/FileUploadForm';
import { fetchSessionUser } from '@/lib/client-auth';

type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
};

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

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
    { href: '/dashboard/history', label: 'History', icon: '📋' },
    { href: '/dashboard/analytics', label: 'Analytics', icon: '📊' },
    { href: '/dashboard/templates', label: 'Templates', icon: '📝' },
    { href: '/dashboard/credits', label: 'Credits', icon: '💳' },
    { href: '/invoices/bulk-upload', label: 'Bulk Upload', icon: '📦' },
];

export default function DashboardPage() {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [drafts, setDrafts] = useState<DraftItem[]>([]);
    const [draftsLoading, setDraftsLoading] = useState(true);
    const [conversions, setConversions] = useState<ConversionItem[]>([]);
    const [conversionsLoading, setConversionsLoading] = useState(true);

    const locale = useMemo(() => {
        const parts = pathname?.split('/') || [];
        return parts.length > 1 ? parts[1] : 'en';
    }, [pathname]);

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
        const loadData = async () => {
            try {
                const sessionUser = await fetchSessionUser();
                if (!sessionUser) {
                    router.push(withLocale('/login'));
                    return;
                }

                setUser(sessionUser);

                // Fetch stats
                fetch('/api/invoices/analytics?type=stats', { cache: 'no-store' })
                    .then(res => res.json())
                    .then(data => {
                        if (data.statistics) {
                            setStats(data.statistics);
                        }
                    })
                    .catch(console.error);

                // Fetch drafts
                fetch('/api/invoices/history?status=draft&limit=5', { cache: 'no-store' })
                    .then(res => res.json())
                    .then(data => {
                        setDrafts(data.items || []);
                    })
                    .catch(console.error)
                    .finally(() => setDraftsLoading(false));

                // Fetch recent conversions
                fetch('/api/invoices/history?status=completed&limit=5', { cache: 'no-store' })
                    .then(res => res.json())
                    .then(data => {
                        setConversions(data.items || []);
                    })
                    .catch(console.error)
                    .finally(() => setConversionsLoading(false));
            } catch {
                router.push(withLocale('/login'));
            } finally {
                setLoading(false);
            }
        };

        void loadData();
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

    return (
        <div className="min-h-screen">
            <div className="flex">
                {/* Sidebar Navigation */}
                <aside className="hidden md:block w-64 bg-slate-950/70 border-r border-white/10 backdrop-blur-xl min-h-screen fixed left-0 top-16">
                    <div className="p-4">
                        <div className="mb-6 pb-4 border-b border-white/10">
                            <p className="text-sm text-faded">Welcome back,</p>
                            <p className="font-semibold text-white">{user.firstName} {user.lastName}</p>
                            <p className="text-xs text-faded">{user.email}</p>
                        </div>
                        <nav className="space-y-1">
                            {navItems.map((item) => {
                                const fullHref = withLocale(item.href);
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
                <main className="flex-1 ml-0 md:ml-64 p-6 md:p-8">
                    <div className="max-w-6xl mx-auto">
                        <div className="md:hidden mb-6">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="chip">{user.firstName}</span>
                                <span className="text-faded text-sm">{user.email}</span>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {navItems.map((item) => {
                                    const fullHref = withLocale(item.href);
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
                            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                            <p className="text-faded mt-2">
                                Welcome back, {user.firstName}! Convert your invoices to XRechnung format.
                            </p>
                        </div>

                        <div className="space-y-8">
                            {/* Upload Section (full width) */}
                            <div className="glass-card p-6">
                                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <span>📤</span> Upload Invoice
                                </h2>
                                <FileUploadForm
                                    userId={user.id}
                                    availableCredits={stats?.availableCredits ?? 0}
                                    onExtractionComplete={(extractionId) => {
                                        router.push(withLocale(`/review/${extractionId}`));
                                    }}
                                />
                            </div>

                            {/* Row 2: Recent Conversions + Drafts */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Recent Conversions */}
                                <div className="glass-card p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                            <span>📋</span> Recent Conversions
                                        </h2>
                                        <Link
                                            href={withLocale('/dashboard/history?status=completed')}
                                            className="text-sm text-sky-200 hover:underline"
                                        >
                                            View All →
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
                                            <p>No conversions yet</p>
                                            <p className="text-sm mt-1">Upload an invoice to get started</p>
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
                                                            {conversion.invoice_number || 'Invoice'}
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
                                                        {conversion.status || 'completed'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Drafts Section */}
                                <div className="glass-card p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                            <span>⏳</span> Drafts / In Progress
                                        </h2>
                                        <Link
                                            href={withLocale('/dashboard/history?status=draft')}
                                            className="text-sm text-sky-200 hover:underline"
                                        >
                                            View All →
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
                                            <p>No drafts yet</p>
                                            <p className="text-sm mt-1">Upload an invoice to create a draft</p>
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
                                                            {draft.invoice_number || 'Draft invoice'}
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
                                                        href={withLocale(`/review/${draft.extraction_id || draft.id}`)}
                                                        className="px-4 py-2 rounded-full bg-amber-500/20 text-amber-100 border border-amber-400/30 hover:bg-amber-500/30"
                                                    >
                                                        Resume
                                                    </Link>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                            <div className="glass-card p-6">
                                <h3 className="text-faded font-medium">Total Conversions</h3>
                                <p className="text-3xl font-bold text-sky-200 mt-2">
                                    {stats?.totalConversions || 0}
                                </p>
                            </div>
                            <Link href={withLocale('/dashboard/credits')} className="glass-card p-6 hover:border-emerald-400/40 transition-colors">
                                <h3 className="text-faded font-medium">Credits Remaining</h3>
                                <p className="text-3xl font-bold text-emerald-200 mt-2">
                                    {stats?.availableCredits ?? '--'}
                                </p>
                            </Link>
                            <Link href={withLocale('/dashboard/analytics')} className="glass-card p-6 hover:border-violet-400/40 transition-colors">
                                <h3 className="text-faded font-medium">Success Rate</h3>
                                <p className="text-3xl font-bold text-violet-200 mt-2">
                                    {stats?.successRate || 0}%
                                </p>
                            </Link>
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
}
