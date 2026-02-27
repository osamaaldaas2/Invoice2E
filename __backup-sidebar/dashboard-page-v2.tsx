'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import FileUploadForm from '@/components/forms/FileUploadForm';
import FormatSelectorCard, { useFormatSelection } from '@/components/dashboard/FormatSelector';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useUser } from '@/lib/user-context';
import DashboardLayout from '@/components/layout/DashboardLayout';

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
  const tHistory = useTranslations('history');

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [conversions, setConversions] = useState<ConversionItem[]>([]);
  const [conversionsLoading, setConversionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useFormatSelection();

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
        setError((prev) => prev ?? (err instanceof Error ? err.message : 'Failed to load stats'));
      } finally {
        setStatsLoading(false);
      }

      // Fetch drafts
      try {
        const response = await fetch('/api/invoices/history?status=draft&limit=5', {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to load drafts');
        }
        setDrafts(data.items || []);
      } catch (err) {
        setError((prev) => prev ?? (err instanceof Error ? err.message : 'Failed to load drafts'));
      } finally {
        setDraftsLoading(false);
      }

      // Fetch recent conversions
      try {
        const response = await fetch('/api/invoices/history?status=completed&limit=5', {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to load conversions');
        }
        setConversions(data.items || []);
      } catch (err) {
        setError(
          (prev) => prev ?? (err instanceof Error ? err.message : 'Failed to load conversions')
        );
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
      <DashboardLayout>
        {error && (
          <div className="mb-6 glass-panel border border-rose-400/30 text-rose-200 px-4 py-3 rounded-xl">
            {error}
          </div>
        )}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white">{t('pageTitle')}</h1>
          <p className="text-faded mt-2">{t('welcomeMessage', { name: user.firstName })}</p>
        </div>

        <div className="space-y-8">
          {/* Format Selection */}
          <div className="glass-card p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span>🎯</span> {t('selectTargetFormat')}
            </h2>
            <FormatSelectorCard selectedFormat={selectedFormat} onSelect={setSelectedFormat} />
          </div>

          {/* Upload Section (full width) */}
          <div
            className={`glass-card p-4 md:p-6 transition-opacity duration-300 ${!selectedFormat ? 'opacity-50' : ''}`}
          >
            <h2 className="text-lg md:text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span>📤</span> {t('uploadInvoice')}
            </h2>
            {!selectedFormat ? (
              <div className="text-center py-8 text-faded">
                <p className="text-sm">{t('selectFormatFirst')}</p>
              </div>
            ) : statsLoading ? (
              <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
            ) : (
              <FileUploadForm
                userId={user.id}
                availableCredits={stats?.availableCredits ?? 0}
                targetFormat={selectedFormat}
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
                    <Link
                      key={conversion.id}
                      href={
                        conversion.extraction_id
                          ? `/review/${conversion.extraction_id}`
                          : '/dashboard/history'
                      }
                      className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors cursor-pointer"
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
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          conversion.status === 'failed' || conversion.status === 'failed_refunded'
                            ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30'
                            : conversion.status === 'draft'
                              ? 'bg-amber-500/15 text-amber-200 border border-amber-400/30'
                              : conversion.status === 'processing' ||
                                  conversion.status === 'pending'
                                ? 'bg-sky-500/15 text-sky-200 border border-sky-400/30'
                                : 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30'
                        }`}
                      >
                        {conversion.status === 'completed'
                          ? t('completedStatus')
                          : conversion.status === 'draft'
                            ? t('draftStatus')
                            : conversion.status === 'failed'
                              ? tHistory('statusFailed')
                              : conversion.status === 'failed_refunded'
                                ? tHistory('statusFailedRefunded')
                                : conversion.status === 'processing'
                                  ? tHistory('statusProcessing')
                                  : conversion.status === 'pending'
                                    ? tHistory('statusPending')
                                    : t('completedStatus')}
                      </span>
                    </Link>
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
              ) : drafts.filter((draft) => draft.status === 'draft').length === 0 ? (
                <div className="text-center py-8 text-faded">
                  <p className="text-3xl mb-2">📄</p>
                  <p>{t('noDrafts')}</p>
                  <p className="text-sm mt-1">{t('noDraftsHint')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {drafts
                    .filter((draft) => draft.status === 'draft')
                    .map((draft) => (
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
          <Link
            href="/dashboard/history"
            className="glass-card p-4 md:p-6 hover:border-sky-400/40 transition-colors"
          >
            <h3 className="text-faded font-medium text-sm md:text-base">{t('totalConversions')}</h3>
            <p className="text-2xl md:text-3xl font-bold text-sky-200 mt-2">
              {statsLoading ? '--' : stats?.totalConversions || 0}
            </p>
          </Link>
          <Link
            href="/pricing"
            className="glass-card p-4 md:p-6 hover:border-emerald-400/40 transition-colors"
          >
            <h3 className="text-faded font-medium text-sm md:text-base">{t('creditsRemaining')}</h3>
            <p className="text-2xl md:text-3xl font-bold text-emerald-200 mt-2">
              {statsLoading ? '--' : (stats?.availableCredits ?? '--')}
            </p>
          </Link>
          <Link
            href="/dashboard/analytics"
            className="glass-card p-4 md:p-6 hover:border-violet-400/40 transition-colors"
          >
            <h3 className="text-faded font-medium text-sm md:text-base">{t('successRate')}</h3>
            <p className="text-2xl md:text-3xl font-bold text-violet-200 mt-2">
              {statsLoading ? '--' : `${stats?.successRate || 0}%`}
            </p>
          </Link>
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}
