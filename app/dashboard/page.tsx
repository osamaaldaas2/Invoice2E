'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import FileUploadForm from '@/components/forms/FileUploadForm';
import { useFormatSelection } from '@/components/dashboard/FormatSelector';
import FormatRing from '@/components/dashboard/FormatRing';
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
  const { user, loading: userLoading } = useUser();
  const t = useTranslations('dashboard');
  const tFormats = useTranslations('formats');
  const tHistory = useTranslations('history');

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [conversions, setConversions] = useState<ConversionItem[]>([]);
  const [conversionsLoading, setConversionsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useFormatSelection();
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const loadData = async () => {
      setError(null);

      try {
        const response = await fetch('/api/invoices/analytics?type=stats', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Failed to load stats');
        if (data.statistics) setStats(data.statistics);
      } catch (err) {
        setError((prev) => prev ?? (err instanceof Error ? err.message : 'Failed to load stats'));
      } finally {
        setStatsLoading(false);
      }

      try {
        const response = await fetch('/api/invoices/history?status=draft&limit=5', {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Failed to load drafts');
        setDrafts(data.items || []);
      } catch (err) {
        setError((prev) => prev ?? (err instanceof Error ? err.message : 'Failed to load drafts'));
      } finally {
        setDraftsLoading(false);
      }

      try {
        const response = await fetch('/api/invoices/history?status=completed&limit=5', {
          cache: 'no-store',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Failed to load conversions');
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

  if (!user) return null;

  const formatDisplayName = selectedFormat ? tFormats(`${selectedFormat}.name`) : null;

  return (
    <ErrorBoundary>
      <DashboardLayout>
        {/* Error alert */}
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 text-rose-200 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white font-display">
            {t('welcomeBack')}, {user.firstName}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            {t('welcomeMessage', { name: user.firstName })}
          </p>
        </div>

        {/* ── Bento Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-12 gap-3">
          {/* Stat: Conversions */}
          <div className="col-span-1 md:col-span-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all hover:bg-white/[0.05] hover:border-white/[0.12] hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 font-medium">{t('totalConversions')}</span>
              <span className="text-lg">📊</span>
            </div>
            <p className="text-3xl font-extrabold text-sky-300 tracking-tight">
              {statsLoading ? (
                <span className="inline-block w-12 h-8 rounded-lg bg-white/5 animate-pulse" />
              ) : (
                (stats?.totalConversions ?? 0)
              )}
            </p>
          </div>

          {/* Stat: Success Rate */}
          <div className="col-span-1 md:col-span-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all hover:bg-white/[0.05] hover:border-white/[0.12] hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 font-medium">{t('successRate')}</span>
              <span className="text-lg">✅</span>
            </div>
            <p className="text-3xl font-extrabold text-emerald-300 tracking-tight">
              {statsLoading ? (
                <span className="inline-block w-12 h-8 rounded-lg bg-white/5 animate-pulse" />
              ) : (
                `${stats?.successRate ?? 0}%`
              )}
            </p>
          </div>

          {/* ── Upload Hero Card — center, spans 2 rows ── */}
          <div className="col-span-2 md:col-span-6 md:row-span-2 rounded-2xl border border-sky-400/10 bg-[radial-gradient(ellipse_at_50%_40%,rgba(56,189,248,0.04)_0%,rgba(255,255,255,0.02)_70%)] p-6 md:p-8 flex flex-col items-center justify-center order-first md:order-none">
            {!showUpload ? (
              <>
                <div onClick={() => selectedFormat && setShowUpload(true)}>
                  <FormatRing
                    selectedFormat={selectedFormat}
                    onSelect={(f) => {
                      setSelectedFormat(f);
                    }}
                  />
                </div>
                <p className="text-xs text-slate-600 mt-2 text-center">
                  {selectedFormat ? (
                    <>
                      <span className="text-sky-400 font-semibold">{formatDisplayName}</span>
                      {' — '}
                      <button
                        onClick={() => setShowUpload(true)}
                        className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
                      >
                        {t('uploadInvoice')}
                      </button>
                    </>
                  ) : (
                    <span>{t('selectFormatFirst')}</span>
                  )}
                </p>
              </>
            ) : (
              <div className="w-full upload-form-compact">
                <button
                  onClick={() => setShowUpload(false)}
                  className="text-xs text-slate-500 hover:text-slate-300 mb-4 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  {t('selectTargetFormat')}
                </button>
                <p className="text-xs text-slate-500 mb-3">
                  <span className="text-sky-400 font-semibold">{formatDisplayName}</span> ausgewählt
                </p>
                {statsLoading ? (
                  <div className="h-32 rounded-xl bg-white/5 animate-pulse" />
                ) : (
                  <FileUploadForm
                    userId={user.id}
                    availableCredits={stats?.availableCredits ?? 0}
                    targetFormat={selectedFormat!}
                    onExtractionComplete={(extractionId) => {
                      router.push(`/review/${extractionId}`);
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Stat: Credits */}
          <div className="col-span-1 md:col-span-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all hover:bg-white/[0.05] hover:border-white/[0.12] hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 font-medium">{t('creditsRemaining')}</span>
              <span className="text-lg">💳</span>
            </div>
            <p className="text-3xl font-extrabold text-violet-300 tracking-tight">
              {statsLoading ? (
                <span className="inline-block w-12 h-8 rounded-lg bg-white/5 animate-pulse" />
              ) : (
                (stats?.availableCredits ?? 0)
              )}
            </p>
          </div>

          {/* Stat: Avg Processing */}
          <div className="col-span-1 md:col-span-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all hover:bg-white/[0.05] hover:border-white/[0.12] hover:-translate-y-0.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 font-medium">Ø Verarbeitung</span>
              <span className="text-lg">⚡</span>
            </div>
            <p className="text-3xl font-extrabold text-amber-200 tracking-tight">
              {statsLoading ? (
                <span className="inline-block w-12 h-8 rounded-lg bg-white/5 animate-pulse" />
              ) : (
                `${(stats?.avgProcessingTime ?? 0).toFixed(1)}s`
              )}
            </p>
          </div>

          {/* ── Recent Conversions ── */}
          <div className="col-span-2 md:col-span-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                📋 {t('recentConversions')}
              </h3>
              <Link
                href="/dashboard/history?status=completed"
                className="text-[11px] text-sky-400 hover:underline"
              >
                {t('viewAllArrow')}
              </Link>
            </div>
            {conversionsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-11 rounded-xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : conversions.length === 0 ? (
              <div className="text-center py-10 text-slate-600">
                <p className="text-3xl mb-2">📭</p>
                <p className="text-sm">{t('noConversions')}</p>
                <p className="text-xs mt-1">{t('noConversionsHint')}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {conversions.map((c) => (
                  <Link
                    key={c.id}
                    href={c.extraction_id ? `/review/${c.extraction_id}` : '/dashboard/history'}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]"
                  >
                    <div>
                      <p className="text-[13px] font-semibold text-slate-200">
                        {c.invoice_number || t('invoiceFallback')}
                      </p>
                      <p className="text-[11px] text-slate-700">
                        {new Date(c.created_at).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                        {c.output_format ? ` · ${c.output_format}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={c.status} t={t} tHistory={tHistory} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* ── Drafts ── */}
          <div className="col-span-2 md:col-span-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                ⏳ {t('draftsInProgress')}
              </h3>
              <Link
                href="/dashboard/history?status=draft"
                className="text-[11px] text-sky-400 hover:underline"
              >
                {t('viewAllArrow')}
              </Link>
            </div>
            {draftsLoading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-11 rounded-xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : drafts.filter((d) => d.status === 'draft').length === 0 ? (
              <div className="text-center py-8 text-slate-600">
                <p className="text-2xl mb-2">📄</p>
                <p className="text-sm">{t('noDrafts')}</p>
                <p className="text-xs mt-1">{t('noDraftsHint')}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {drafts
                  .filter((d) => d.status === 'draft')
                  .map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    >
                      <div>
                        <p className="text-[13px] font-semibold text-slate-200">
                          {d.invoice_number || t('draftFallback')}
                        </p>
                        <p className="text-[11px] text-slate-700">
                          {new Date(d.created_at).toLocaleDateString('de-DE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <Link
                        href={`/review/${d.extraction_id || d.id}`}
                        className="px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-400/15 hover:bg-amber-500/20 transition-colors"
                      >
                        {t('resume')} →
                      </Link>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* ── Quick Action Cards ── */}
          <ActionCard
            href="/dashboard/analytics"
            icon="📊"
            title="Analytics"
            desc="Trends & Statistiken"
          />
          <ActionCard
            href="/dashboard/templates"
            icon="📝"
            title="Vorlagen"
            desc="Wiederkehrende Daten"
          />
          <ActionCard
            href="/invoices/bulk-upload"
            icon="📦"
            title="Massenupload"
            desc="Batch-Konvertierung"
          />
          <ActionCard href="/pricing" icon="✨" title="Credits" desc="Guthaben aufladen" />
        </div>
      </DashboardLayout>
    </ErrorBoundary>
  );
}

/* ── Helper Components ── */

function StatusBadge({
  status,
  t,
  tHistory,
}: {
  status: string;
  t: (key: string) => string;
  tHistory: (key: string) => string;
}) {
  const styles: Record<string, string> = {
    completed: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/15',
    draft: 'bg-amber-500/10 text-amber-300 border-amber-400/15',
    failed: 'bg-rose-500/10 text-rose-300 border-rose-400/15',
    failed_refunded: 'bg-rose-500/10 text-rose-300 border-rose-400/15',
    processing: 'bg-sky-500/10 text-sky-300 border-sky-400/15',
    pending: 'bg-sky-500/10 text-sky-300 border-sky-400/15',
  };

  const labels: Record<string, string> = {
    completed: `✓ ${t('completedStatus')}`,
    draft: t('draftStatus'),
    failed: tHistory('statusFailed'),
    failed_refunded: tHistory('statusFailedRefunded'),
    processing: tHistory('statusProcessing'),
    pending: tHistory('statusPending'),
  };

  return (
    <span
      className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${styles[status] || styles.completed}`}
    >
      {labels[status] || t('completedStatus')}
    </span>
  );
}

function ActionCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="col-span-1 md:col-span-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all hover:bg-white/[0.05] hover:border-white/[0.12] hover:-translate-y-0.5 group relative"
    >
      <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-lg mb-3">
        {icon}
      </div>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-slate-600 mt-0.5">{desc}</p>
      <span className="absolute bottom-4 right-4 text-sm text-slate-800 group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all">
        →
      </span>
    </Link>
  );
}
