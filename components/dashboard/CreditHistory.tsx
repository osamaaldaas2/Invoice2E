'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';

type CreditTransaction = {
    id: string;
    amount: number;
    transaction_type: 'credit' | 'debit';
    source: string;
    reference_id: string | null;
    balance_after: number | null;
    created_at: string;
};

const SOURCE_CONFIG: Record<string, { label: string; labelDe: string; icon: string }> = {
    payment: { label: 'Purchase', labelDe: 'Kauf', icon: '💳' },
    stripe: { label: 'Purchase (Stripe)', labelDe: 'Kauf (Stripe)', icon: '💳' },
    paypal: { label: 'Purchase (PayPal)', labelDe: 'Kauf (PayPal)', icon: '💳' },
    extraction: { label: 'Invoice Extraction', labelDe: 'Rechnungsextraktion', icon: '📄' },
    batch_extraction: { label: 'Batch Extraction', labelDe: 'Batch-Extraktion', icon: '📦' },
    conversion: { label: 'Conversion', labelDe: 'Konvertierung', icon: '🔄' },
    voucher: { label: 'Voucher Redeemed', labelDe: 'Gutschein eingelöst', icon: '🎟️' },
    refund: { label: 'Refund', labelDe: 'Rückerstattung', icon: '↩️' },
    gift: { label: 'Gift', labelDe: 'Geschenk', icon: '🎁' },
    signup: { label: 'Welcome Bonus', labelDe: 'Willkommensbonus', icon: '🎉' },
    admin: { label: 'Admin Adjustment', labelDe: 'Admin-Anpassung', icon: '⚙️' },
};

function getSourceDisplay(source: string, isGerman: boolean): { label: string; icon: string } {
    const config = SOURCE_CONFIG[source];
    if (config) {
        return { label: isGerman ? config.labelDe : config.label, icon: config.icon };
    }
    // Handle refund:transactionId pattern
    if (source.startsWith('refund')) {
        const refundConfig = SOURCE_CONFIG['refund']!;
        return { label: isGerman ? refundConfig.labelDe : refundConfig.label, icon: refundConfig.icon };
    }
    // Handle batch:jobId pattern
    if (source.startsWith('batch:')) {
        const batchConfig = SOURCE_CONFIG['batch_extraction']!;
        return { label: isGerman ? batchConfig.labelDe : batchConfig.label, icon: batchConfig.icon };
    }
    return { label: source, icon: '📝' };
}

type CreditHistoryProps = {
    locale?: string;
};

export default function CreditHistory({ locale = 'en' }: CreditHistoryProps) {
    const t = useTranslations('credits');
    const isGerman = locale === 'de';
    const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const limit = 10;

    const fetchHistory = useCallback(async (p: number) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/credits/history?page=${p}&limit=${limit}`);
            if (response.ok) {
                const data = await response.json();
                setTransactions(data.items || []);
                setTotal(data.total || 0);
            }
        } catch {
            // Silently fail — shows empty state
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchHistory(page);
    }, [page, fetchHistory]);

    // Refresh when credits update (purchase, voucher, etc.)
    useEffect(() => {
        const handleUpdate = () => fetchHistory(page);
        window.addEventListener('credits-updated', handleUpdate);
        return () => window.removeEventListener('credits-updated', handleUpdate);
    }, [page, fetchHistory]);

    const totalPages = Math.ceil(total / limit);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString(isGerman ? 'de-DE' : 'en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-white font-display mb-4">
                {t('historyTitle')}
            </h3>

            {loading ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
                    ))}
                </div>
            ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-faded">
                    <p className="text-3xl mb-2">📭</p>
                    <p>{t('historyEmpty')}</p>
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        {transactions.map((tx) => {
                            const isCredit = tx.transaction_type === 'credit' || tx.amount > 0;
                            const absAmount = Math.abs(tx.amount);
                            const { label, icon } = getSourceDisplay(tx.source, isGerman);

                            return (
                                <div
                                    key={tx.id}
                                    className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-xl flex-shrink-0">{icon}</span>
                                        <div className="min-w-0">
                                            <p className="text-white font-medium truncate">
                                                {label}
                                            </p>
                                            <p className="text-xs text-faded">
                                                {formatDate(tx.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className={`font-semibold ${isCredit ? 'text-emerald-300' : 'text-rose-300'}`}>
                                            {isCredit ? '+' : '-'}{absAmount} {t('credit', { count: absAmount })}
                                        </p>
                                        {tx.balance_after !== null && (
                                            <p className="text-xs text-faded">
                                                {t('historyBalance')}: {tx.balance_after}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="px-3 py-1.5 text-sm rounded-lg border border-white/15 text-slate-200 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {t('historyPrevious')}
                            </button>
                            <span className="text-sm text-faded">
                                {page} / {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="px-3 py-1.5 text-sm rounded-lg border border-white/15 text-slate-200 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {t('historyNext')}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
